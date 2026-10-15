import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry, RoomCapacityError, UnauthorizedReconnectError } from './room-state.js';
import {
  loadTurnConfig,
  createTurnCredentialsProvider,
  turnCredentials,
  type TurnConfig,
} from './turn.js';
import {
  INTERACTION_LIMITS,
  type ServerMessage,
  ClientMessageSchema,
  normalizeRoom,
  normalizePeer,
  WS_CLOSE_CODES,
  isTerminalCloseCode,
} from '@screen-room/protocol';
import {
  resolveClientIp,
  parseTrustedProxies,
  DEFAULT_TRUSTED_PROXIES,
  isIpTrusted,
} from './proxy.js';

export { turnCredentials, resolveClientIp, parseTrustedProxies, DEFAULT_TRUSTED_PROXIES, isIpTrusted };

export interface SignalSocketMeta {
  roomId: string;
  peerId: string;
  isVoluntary?: boolean;
}

export type SignalWebSocket = WebSocket & {
  meta?: SignalSocketMeta | null;
  isAlive?: boolean;
  messageCount?: number;
  lastMessageReset?: number;
};

function signalLog(event: string, fields: Record<string, unknown> = {}) {
  console.log(`[screen-room:signal] ${event}`, fields);
}

function send(socket: WebSocket | undefined, message: ServerMessage | Record<string, unknown>) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export interface SignalServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  turnConfig?: TurnConfig;
  heartbeatIntervalMs?: number;
  maxPayload?: number;
  maxParticipantsPerRoom?: number;
  trustedProxies?: string[];
  recoveryGraceMs?: number;
}

/**
 * Resolves maximum participants per room from options or environment variables.
 * Defaults to 10 participants per room.
 */
export function parseMaxParticipants(
  optionsValue?: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (typeof optionsValue === 'number' && Number.isFinite(optionsValue) && optionsValue > 0) {
    return Math.floor(optionsValue);
  }
  const rawEnv = env.MAX_PARTICIPANTS_PER_ROOM || env.MAX_ROOM_CAPACITY || env.MAX_PARTICIPANTS;
  if (rawEnv) {
    const parsed = parseInt(rawEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 10;
}

/**
 * Normalizes an origin string into standard <scheme>://<host>[:<port>] format.
 * Strips whitespace, trailing slashes, and verifies valid http or https protocol.
 */
export function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses and normalizes configured allowed origins (CFG-02).
 */
export function parseAllowedOrigins(optionsOrigins?: string[]): string[] {
  let list: string[] = [];
  if (optionsOrigins && optionsOrigins.length > 0) {
    list = optionsOrigins;
  } else {
    const env = process.env.ALLOWED_ORIGINS;
    if (env) {
      list = env.split(',').map((o) => o.trim()).filter(Boolean);
    } else {
      list = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
      ];
    }
  }

  const normalized = list
    .map(normalizeOrigin)
    .filter((o): o is string => o !== null);

  return Array.from(new Set(normalized));
}

/**
 * Validates request origin against the allowed list (SEC-01).
 * Never trusts Host, X-Forwarded-Host or other unauthenticated headers.
 * Requests without an Origin header are explicitly treated as same-origin / internal.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowedListOrHost: string[] | string | undefined,
  maybeAllowedList?: string[]
): boolean {
  const allowedList = Array.isArray(allowedListOrHost)
    ? allowedListOrHost
    : Array.isArray(maybeAllowedList)
    ? maybeAllowedList
    : [];

  // Requests without Origin (same-origin GET, internal node tests, non-browser clients)
  if (origin === undefined || origin === null || origin === '') {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowedList.includes(normalized);
}

// In-memory sliding window rate limiter for /turn-credentials
const turnRateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkTurnRateLimit(ip: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();
  if (turnRateLimitMap.size > 1000) {
    for (const [key, val] of turnRateLimitMap.entries()) {
      if (now > val.resetTime) turnRateLimitMap.delete(key);
    }
  }
  const entry = turnRateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    turnRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

// Per-socket message rate limiter (max 100 messages/sec)
function checkMessageRateLimit(socket: SignalWebSocket, maxPerSec = 100): boolean {
  const now = Date.now();
  if (!socket.lastMessageReset || now - socket.lastMessageReset >= 1000) {
    socket.lastMessageReset = now;
    socket.messageCount = 1;
    return true;
  }
  socket.messageCount = (socket.messageCount || 0) + 1;
  return socket.messageCount <= maxPerSec;
}

export interface SignalServerInstance {
  ready: Promise<void>;
  readonly port: number;
  httpServer: http.Server;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

export function createSignalServer({
  port = 3000,
  host = '0.0.0.0',
  allowedOrigins,
  turnConfig,
  heartbeatIntervalMs = 30000,
  maxPayload = 64 * 1024,
  maxParticipantsPerRoom,
  trustedProxies,
  recoveryGraceMs = RoomRegistry.DEFAULT_RECOVERY_GRACE_MS,
}: SignalServerOptions = {}): SignalServerInstance {
  // Validate and initialize TURN configuration at startup (CFG-01 & PERF-01)
  const resolvedTurnConfig = turnConfig ?? loadTurnConfig();
  const getTurnCredentials = createTurnCredentialsProvider(resolvedTurnConfig);

  const maxParticipants = parseMaxParticipants(maxParticipantsPerRoom);
  const rooms = new RoomRegistry(maxParticipants);
  const clients = new Map<string, SignalWebSocket>();
  const allowedList = parseAllowedOrigins(allowedOrigins);
  const trustedProxiesList = parseTrustedProxies(process.env.TRUSTED_PROXIES, trustedProxies);

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const origin = req.headers.origin;

    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, allowedList)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden origin');
        return;
      }
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
      };
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (url.pathname === '/turn-credentials') {
      if (!isAllowedOrigin(origin, allowedList)) {
        signalLog('rejected-http-origin', { origin, host: req.headers.host });
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden origin');
        return;
      }

      const clientIp = resolveClientIp(req, trustedProxiesList);
      if (!checkTurnRateLimit(clientIp)) {
        signalLog('rate-limit-turn', { ip: clientIp });
        res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' });
        res.end('Too Many Requests');
        return;
      }

      const payload = JSON.stringify(getTurnCredentials());
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Vary': 'Origin',
      };
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
      }
      res.writeHead(200, headers);
      res.end(payload);
      return;
    }

    if (url.pathname === '/healthz' || url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', service: 'signaling' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/signal',
    maxPayload,
  });

  function peerSocket(roomId: string, peerId: string): SignalWebSocket | undefined {
    return clients.get(`${roomId}:${peerId}`);
  }

  function broadcast(roomId: string, message: ServerMessage, exceptPeer?: string) {
    for (const peerId of rooms.peers(roomId)) {
      if (peerId !== exceptPeer) {
        send(peerSocket(roomId, peerId), message);
      }
    }
  }

  function depart(socket: SignalWebSocket, isVoluntary = false) {
    if (!socket.meta) return;
    const { roomId, peerId } = socket.meta;
    const effectiveVoluntary = Boolean(isVoluntary || socket.meta.isVoluntary);
    const key = `${roomId}:${peerId}`;

    // Deterministic check: only remove if THIS socket is the active one (BUG-01)
    if (clients.get(key) === socket) {
      clients.delete(key);
      rooms.leave(roomId, peerId, effectiveVoluntary, recoveryGraceMs);
      const count = rooms.peers(roomId).length;
      signalLog('leave', { roomId, peerId, count, isVoluntary: effectiveVoluntary });
      broadcast(roomId, { type: 'peer-left', peerId, count }, peerId);
    } else {
      signalLog('superseded-leave-ignored', { roomId, peerId });
    }
    socket.meta = null;
  }

  // Heartbeat timer (REL-01)
  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      const signalSocket = client as SignalWebSocket;
      if (signalSocket.isAlive === false) {
        signalLog('heartbeat-timeout', { meta: signalSocket.meta });
        signalSocket.terminate();
      } else {
        signalSocket.isAlive = false;
        try {
          signalSocket.ping();
        } catch {
          signalSocket.terminate();
        }
      }
    }
  }, heartbeatIntervalMs);
  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref();
  }

  wss.on('connection', (socket: SignalWebSocket, req: http.IncomingMessage) => {
    socket.isAlive = true;

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('error', (err: any) => {
      signalLog('socket-error', { error: err?.message, code: err?.code });
    });

    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, allowedList)) {
      signalLog('rejected-ws-origin', { origin, host: req.headers.host });
      socket.close(WS_CLOSE_CODES.FORBIDDEN_ORIGIN, 'Forbidden origin');
      return;
    }

    socket.on('message', (raw) => {
      if (!checkMessageRateLimit(socket)) {
        signalLog('rate-limit-ws', { meta: socket.meta });
        send(socket, { type: 'error', message: 'Limite de mensagens excedido.' });
        return;
      }

      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', message: 'Mensagem inválida.' });
        return;
      }

      const parseResult = ClientMessageSchema.safeParse(json);
      if (!parseResult.success) {
        send(socket, { type: 'error', message: 'Mensagem malformada ou campos inválidos.' });
        return;
      }

      const message = parseResult.data;

      try {
        if (message.type === 'join') {
          let normalizedRoom: string;
          let normalizedPeer: string;
          try {
            normalizedRoom = normalizeRoom(message.roomId);
            normalizedPeer = normalizePeer(message.peerId);
          } catch (err: any) {
            send(socket, { type: 'error', message: err?.message || 'Identificador de sala ou peer inválido.' });
            return;
          }

          // Check room capacity before modifying state or disconnecting existing peers
          const isExistingPeer = rooms.hasPeer(normalizedRoom, normalizedPeer);
          const isReservedPeer = rooms.hasRecoveryReservation(normalizedRoom, normalizedPeer);
          if (!isExistingPeer && !isReservedPeer && rooms.isFull(normalizedRoom)) {
            signalLog('rejected-room-full', {
              roomId: normalizedRoom,
              peerId: normalizedPeer,
              count: rooms.count(normalizedRoom),
              occupiedSlots: rooms.occupiedSlots(normalizedRoom),
              maxParticipants,
            });
            send(socket, {
              type: 'error',
              message: `Sala cheia: capacidade máxima de ${maxParticipants} participantes atingida.`,
              code: 'ROOM_FULL',
            });
            socket.close(WS_CLOSE_CODES.ROOM_FULL, 'Room is full');
            return;
          }

          // If peer is already active in the room, verify reconnectToken before allowing session replacement (SEC-03)
          if (isExistingPeer) {
            const expectedToken = rooms.getReconnectToken(normalizedRoom, normalizedPeer);
            const providedToken =
              typeof message.reconnectToken === 'string' && message.reconnectToken.trim()
                ? message.reconnectToken.trim()
                : undefined;

            if (!expectedToken || !providedToken || expectedToken !== providedToken) {
              signalLog('unauthorized-reconnect', {
                roomId: normalizedRoom,
                peerId: normalizedPeer,
                hasToken: Boolean(providedToken),
              });
              send(socket, {
                type: 'error',
                message: 'Sessão ativa detectada para este peer. Credencial de reconexão inválida ou ausente.',
                code: 'UNAUTHORIZED_RECONNECT',
              });
              socket.close(WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT, 'Unauthorized reconnect');
              return;
            }
          } else if (isReservedPeer) {
            const expectedToken = rooms.getReservedReconnectToken(normalizedRoom, normalizedPeer);
            const providedToken =
              typeof message.reconnectToken === 'string' && message.reconnectToken.trim()
                ? message.reconnectToken.trim()
                : undefined;

            if (!expectedToken || !providedToken || expectedToken !== providedToken) {
              signalLog('unauthorized-reconnect-reserved', {
                roomId: normalizedRoom,
                peerId: normalizedPeer,
                hasToken: Boolean(providedToken),
              });
              send(socket, {
                type: 'error',
                message: 'Identidade em período de recuperação efêmera. Credencial de reconexão inválida ou ausente.',
                code: 'UNAUTHORIZED_RECONNECT',
              });
              socket.close(WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT, 'Unauthorized reconnect');
              return;
            }
          }

          // If this socket was already associated with another room/peer, depart cleanly
          if (socket.meta && (socket.meta.roomId !== normalizedRoom || socket.meta.peerId !== normalizedPeer)) {
            depart(socket);
          }

          const key = `${normalizedRoom}:${normalizedPeer}`;
          const existingSocket = clients.get(key);
          if (existingSocket && existingSocket !== socket) {
            signalLog('superseding-existing-socket', { roomId: normalizedRoom, peerId: normalizedPeer });
            // Disassociate previous socket so its close event will not clean up the new session (BUG-01)
            existingSocket.meta = null;
            try {
              existingSocket.close(WS_CLOSE_CODES.SUPERSEDED, 'Superseded by new connection');
            } catch {
              existingSocket.terminate();
            }
          }

          const rawNick =
            typeof message.nickname === 'string' && message.nickname.trim()
              ? message.nickname.trim().slice(0, 32)
              : undefined;

          let peers: string[];
          try {
            peers = rooms.join(normalizedRoom, normalizedPeer, rawNick, message.reconnectToken);
          } catch (err: any) {
            signalLog('join-rejected', { roomId: normalizedRoom, peerId: normalizedPeer, error: err?.message });
            send(socket, {
              type: 'error',
              message: err?.message || 'Não foi possível entrar na sala.',
              code: err instanceof RoomCapacityError
                ? 'ROOM_FULL'
                : err instanceof UnauthorizedReconnectError
                ? 'UNAUTHORIZED_RECONNECT'
                : 'JOIN_ERROR',
            });
            if (err instanceof RoomCapacityError) {
              socket.close(WS_CLOSE_CODES.ROOM_FULL, 'Room is full');
            } else if (err instanceof UnauthorizedReconnectError) {
              socket.close(WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT, 'Unauthorized reconnect');
            }
            return;
          }

          socket.meta = {
            roomId: normalizedRoom,
            peerId: normalizedPeer,
          };
          clients.set(key, socket);

          const count = rooms.peers(normalizedRoom).length;
          const participants = rooms.getParticipants(normalizedRoom);
          const effectiveNick = rooms.getNickname(normalizedRoom, normalizedPeer);
          const reconnectToken = rooms.getReconnectToken(normalizedRoom, normalizedPeer);
          signalLog('join', {
            roomId: normalizedRoom,
            peerId: normalizedPeer,
            nickname: effectiveNick,
            count,
          });

          send(socket, {
            type: 'peers',
            peers,
            count,
            participants,
            reconnectToken,
          });

          broadcast(
            normalizedRoom,
            {
              type: 'peer-joined',
              peerId: normalizedPeer,
              count,
              ...(effectiveNick ? { nickname: effectiveNick } : {}),
            },
            normalizedPeer
          );
          return;
        }

        if (message.type === 'send-chat' || message.type === 'send-reaction') {
          const reject = (messageText: string) => send(socket, {
            type: 'interaction-rejected', requestId: message.requestId, message: messageText,
          });
          const meta = socket.meta;
          if (!meta || peerSocket(meta.roomId, meta.peerId) !== socket || !rooms.hasPeer(meta.roomId, meta.peerId)) {
            reject('Entre na sala antes de enviar.');
            return;
          }
          const limits = rooms.interactionBudget(meta.roomId, meta.peerId);
          const kind = message.type === 'send-chat' ? 'chat' : 'reaction';
          const now = Date.now();
          limits[kind] = limits[kind].filter(time => now - time < INTERACTION_LIMITS.windowMs);
          if (limits[kind].length >= (kind === 'chat' ? INTERACTION_LIMITS.chatBurst : INTERACTION_LIMITS.reactionBurst)) {
            reject('Muitas interações. Aguarde alguns segundos.');
            return;
          }
          limits[kind].push(now);
          if (limits.ids.includes(message.requestId)) {
            reject('Esta interação já foi aceita.');
            return;
          }
          limits.ids = [...limits.ids.slice(-63), message.requestId];
          const identity = { id: randomUUID(), requestId: message.requestId, ...meta,
            nickname: rooms.getNickname(meta.roomId, meta.peerId), timestamp: now };
          if (message.type === 'send-chat') {
            broadcast(meta.roomId, { type: 'chat-message', ...identity, text: message.text });
          } else {
            broadcast(meta.roomId, { type: 'reaction', ...identity, reaction: message.reaction });
          }
          return;
        }

        if (message.type === 'signal') {
          if (!socket.meta) {
            send(socket, { type: 'error', message: 'Socket não associado a uma sala. Envie join primeiro.' });
            return;
          }

          let normalizedTarget: string;
          try {
            normalizedTarget = normalizePeer(message.target);
          } catch {
            send(socket, { type: 'error', message: 'Destinatário inválido.' });
            return;
          }

          const target = peerSocket(socket.meta.roomId, normalizedTarget);
          if (!target) {
            signalLog('relay-missing-target', {
              roomId: socket.meta.roomId,
              from: socket.meta.peerId,
              to: normalizedTarget,
            });
            send(socket, { type: 'error', message: 'Participante destinatário não encontrado na sala.' });
            return;
          }

          signalLog('relay', {
            roomId: socket.meta.roomId,
            from: socket.meta.peerId,
            to: normalizedTarget,
            type: (message.data as any)?.type,
            delivered: true,
          });

          send(target, { type: 'signal', from: socket.meta.peerId, data: message.data });
          return;
        }

        if (message.type === 'update-sharing') {
          if (!socket.meta) {
            send(socket, { type: 'error', message: 'Envie join primeiro.' });
            return;
          }
          const { roomId, peerId } = socket.meta;
          const { type, ...sharing } = message;
          rooms.updateSharing(roomId, peerId, sharing);
          broadcast(roomId, { type: 'sharing-updated', peerId, ...sharing }, peerId);
          return;
        }

        if (message.type === 'update-nickname') {
          if (!socket.meta) {
            send(socket, { type: 'error', message: 'Socket não associado a uma sala. Envie join primeiro.' });
            return;
          }
          const { roomId, peerId } = socket.meta;
          const result = rooms.updateNickname(roomId, peerId, message.nickname);
          if (result.changed) {
            signalLog('update-nickname', {
              roomId,
              peerId,
              nickname: result.nickname,
            });
            broadcast(
              roomId,
              {
                type: 'peer-updated',
                peerId,
                ...(result.nickname ? { nickname: result.nickname } : {}),
              },
              peerId
            );
          }
          return;
        }

        if (message.type === 'leave') {
          if (socket.meta) {
            socket.meta.isVoluntary = true;
            depart(socket, true);
          }
          return;
        }

        send(socket, { type: 'error', message: 'Ação não permitida.' });
      } catch (error: any) {
        send(socket, { type: 'error', message: error?.message || 'Erro inesperado' });
      }
    });

    socket.on('close', (code: number) => {
      const isVoluntary = Boolean(
        socket.meta?.isVoluntary ||
        code === 1000 ||
        code === 1005
      );
      depart(socket, isVoluntary);
    });
  });

  const ready = new Promise<void>((resolve) => httpServer.listen(port, host, () => resolve()));

  return {
    ready,
    get port() {
      const address = httpServer.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    httpServer,
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeatTimer);
        rooms.clearAllRecovery();
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => httpServer.close(() => resolve()));
      }),
  };
}
