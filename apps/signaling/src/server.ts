import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry } from './room-state.js';
import { turnCredentials } from './turn.js';
import type { ServerMessage } from '@screen-room/protocol';

export { turnCredentials };

export interface SignalSocketMeta {
  roomId: string;
  peerId: string;
}

export type SignalWebSocket = WebSocket & {
  meta?: SignalSocketMeta | null;
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
}

export function parseAllowedOrigins(optionsOrigins?: string[]): string[] {
  if (optionsOrigins && optionsOrigins.length > 0) {
    return optionsOrigins.map((o) => o.trim().toLowerCase());
  }
  const env = process.env.ALLOWED_ORIGINS;
  if (env) {
    return env.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
  }
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
}

export function isAllowedOrigin(
  origin: string | undefined,
  hostHeader: string | undefined,
  allowedList: string[]
): boolean {
  if (!origin) return true;
  const normalized = origin.trim().toLowerCase();
  if (hostHeader) {
    const host = hostHeader.toLowerCase();
    if (normalized === `http://${host}` || normalized === `https://${host}`) {
      return true;
    }
  }
  return allowedList.includes(normalized);
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
}: SignalServerOptions = {}): SignalServerInstance {
  const rooms = new RoomRegistry();
  const clients = new Map<string, SignalWebSocket>();
  const allowedList = parseAllowedOrigins(allowedOrigins);

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const origin = req.headers.origin;

    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, req.headers.host, allowedList)) {
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
      if (!isAllowedOrigin(origin, req.headers.host, allowedList)) {
        signalLog('rejected-http-origin', { origin, host: req.headers.host });
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden origin');
        return;
      }
      const payload = JSON.stringify(turnCredentials());
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

  const wss = new WebSocketServer({ server: httpServer, path: '/signal' });

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

  function depart(socket: SignalWebSocket) {
    if (!socket.meta) return;
    const { roomId, peerId } = socket.meta;
    clients.delete(`${roomId}:${peerId}`);
    rooms.leave(roomId, peerId);
    const count = rooms.peers(roomId).length;
    signalLog('leave', { roomId, peerId, count });
    broadcast(roomId, { type: 'peer-left', peerId, count }, peerId);
    socket.meta = null;
  }

  wss.on('connection', (socket: SignalWebSocket, req: http.IncomingMessage) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, req.headers.host, allowedList)) {
      signalLog('rejected-ws-origin', { origin, host: req.headers.host });
      socket.close(4403, 'Forbidden origin');
      return;
    }

    socket.on('message', (raw) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', message: 'Mensagem inválida.' });
        return;
      }

      try {
        if (message.type === 'join') {
          depart(socket);
          const rawNick =
            typeof message.nickname === 'string' && message.nickname.trim()
              ? message.nickname.trim().slice(0, 32)
              : undefined;
          const peers = rooms.join(message.roomId, message.peerId, rawNick);
          socket.meta = {
            roomId: String(message.roomId).trim().toLowerCase(),
            peerId: String(message.peerId).trim(),
          };
          clients.set(`${socket.meta.roomId}:${socket.meta.peerId}`, socket);
          const count = rooms.peers(socket.meta.roomId).length;
          const participants = rooms.getParticipants(socket.meta.roomId);
          signalLog('join', {
            roomId: socket.meta.roomId,
            peerId: socket.meta.peerId,
            nickname: rawNick,
            count,
          });
          send(socket, {
            type: 'peers',
            peers,
            count,
            participants,
          });
          broadcast(
            socket.meta.roomId,
            {
              type: 'peer-joined',
              peerId: socket.meta.peerId,
              count,
              ...(rawNick ? { nickname: rawNick } : {}),
            },
            socket.meta.peerId
          );
          return;
        }

        if (message.type === 'signal' && socket.meta && typeof message.target === 'string') {
          const target = peerSocket(socket.meta.roomId, message.target);
          signalLog('relay', {
            roomId: socket.meta.roomId,
            from: socket.meta.peerId,
            to: message.target,
            type: message.data?.type,
            delivered: Boolean(target),
          });
          if (target) {
            send(target, { type: 'signal', from: socket.meta.peerId, data: message.data });
          }
          return;
        }

        if (message.type === 'update-nickname') {
          if (!socket.meta) {
            send(socket, { type: 'error', message: 'Socket não associado a uma sala.' });
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

        send(socket, { type: 'error', message: 'Ação não permitida.' });
      } catch (error: any) {
        send(socket, { type: 'error', message: error?.message || 'Erro inesperado' });
      }
    });

    socket.on('close', () => depart(socket));
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
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => httpServer.close(() => resolve()));
      }),
  };
}
