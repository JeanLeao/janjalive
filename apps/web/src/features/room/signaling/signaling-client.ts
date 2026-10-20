import {
  type SharingState,
  COLLABORATION_LIMITS,
  type ClientMessage,
  type ServerMessage,
  isServerMessage,
  isTerminalCloseCode,
  WS_CLOSE_CODES,
} from '@screen-room/protocol';
import type { ConnectionState } from '../types';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export interface SignalingClientOptions {
  url?: string;
  onMessage: (message: ServerMessage) => void;
  onStateChange: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  logger?: DiagnosticsLogger;
  autoReconnect?: boolean;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  backoffFactor?: number;
  jitterMs?: number;
}

export class SignalingClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private readonly options: SignalingClientOptions;
  private explicitDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private reconnectToken?: string;

  constructor(options: SignalingClientOptions) {
    this.options = options;
  }

  private resolveUrl(): string {
    if (this.options.url) return this.options.url;
    if (typeof window !== 'undefined') {
      const viteUrl = (import.meta as any).env?.VITE_SIGNALING_URL;
      if (viteUrl) return viteUrl;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/signal`;
    }
    return 'ws://localhost:3000/signal';
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState) {
    if (this.state === newState) return;
    this.state = newState;
    this.options.onStateChange(newState);
  }

  connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (
      this.isConnecting ||
      (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN))
    ) {
      return;
    }

    this.explicitDisconnect = false;
    this.isConnecting = true;
    this.setState('connecting');
    const url = this.resolveUrl();
    this.options.logger?.log('signal-connecting', { url, attempt: this.reconnectAttempts });

    try {
      this.socket = new WebSocket(url);
    } catch (err: any) {
      this.isConnecting = false;
      this.setState('error');
      this.options.logger?.log('signal-error', { error: err?.message || 'WebSocket creation failed' });
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.options.logger?.log('signal-open', { url });
    };

    this.socket.onclose = (event) => {
      this.isConnecting = false;
      this.options.logger?.log('signal-close', { code: event.code, clean: event.wasClean });
      this.socket = null;
      if (!this.explicitDisconnect) {
        if (isTerminalCloseCode(event.code)) {
          this.options.logger?.log('signal-terminal-close', { code: event.code });
          this.setState('disconnected');
        } else {
          this.setState('disconnected');
          this.scheduleReconnect();
        }
      } else {
        this.setState('idle');
      }
    };

    this.socket.onerror = (event) => {
      this.options.logger?.log('signal-error', { event: 'websocket error' });
      this.options.onError?.(new Error('Falha na conexão do signaling'));
    };

    this.socket.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        if (isServerMessage(raw)) {
          if (raw.type === 'peers' && raw.reconnectToken) {
            this.reconnectToken = raw.reconnectToken;
          }
          // Pointer traffic must not notify React's diagnostics subscription per movement.
          if (raw.type !== 'collaboration') this.options.logger?.log('signal-receive', { type: raw.type, count: (raw as any).count });
          this.options.onMessage(raw);
        } else {
          this.options.logger?.log('signal-malformed', { reason: 'invalid-server-message' });
        }
      } catch (parseError: any) {
        this.options.logger?.log('signal-parse-error', { message: parseError?.message });
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.explicitDisconnect) return;
    if (this.options.autoReconnect === false) return;
    if (this.reconnectTimer) return; // Prevent concurrent attempts

    const initial = this.options.initialReconnectDelayMs ?? 1000;
    const max = this.options.maxReconnectDelayMs ?? 10000;
    const factor = this.options.backoffFactor ?? 2;
    const jitter = this.options.jitterMs ?? 500;

    const baseDelay = Math.min(initial * Math.pow(factor, this.reconnectAttempts), max);
    const delay = Math.round(baseDelay + Math.random() * jitter);

    this.reconnectAttempts++;
    this.options.logger?.log('signal-schedule-reconnect', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.explicitDisconnect) {
        this.connect();
      }
    }, delay);
  }

  send(message: ClientMessage): boolean {
    const ephemeral = message.type === 'laser' || message.type === 'drawing' || message.type === 'clear-annotations' || message.type === 'point';
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (!ephemeral) this.options.logger?.log('signal-skip', { type: message.type, reason: 'socket-not-open' });
      return false;
    }

    if (ephemeral &&
        this.socket.bufferedAmount >= COLLABORATION_LIMITS.maxBufferedBytes) return false;
    try {
      this.socket.send(JSON.stringify(message));
      if (!ephemeral) this.options.logger?.log('signal-send', {
        type: (message as any).data?.type || message.type,
        target: (message as any).target || '-',
      });
      return true;
    } catch (sendError: any) {
      this.options.logger?.log('signal-send-error', { message: sendError?.message });
      return false;
    }
  }

  join(roomId: string, peerId: string, nickname?: string, reconnectToken?: string, hostCredential?: string, roomKey?: string): boolean {
    const token = reconnectToken ?? this.reconnectToken;
    return this.send({
      type: 'join',
      roomId,
      peerId,
      ...(nickname ? { nickname } : {}),
      ...(token ? { reconnectToken: token } : {}),
      ...(hostCredential ? { hostCredential } : {}),
      ...(roomKey ? { roomKey } : {}),
    });
  }

  getReconnectToken(): string | undefined {
    return this.reconnectToken;
  }

  setReconnectToken(token?: string): void {
    this.reconnectToken = token;
  }

  updateNickname(nickname?: string): boolean {
    return this.send({
      type: 'update-nickname',
      ...(nickname !== undefined ? { nickname } : {}),
    });
  }

  updateSharing(sharing: SharingState): boolean {
    return this.send({ type: 'update-sharing', ...sharing });
  }

  relaySignal(target: string, data: Record<string, unknown> | any): boolean {
    return this.send({ type: 'signal', target, data });
  }

  leave(): boolean {
    return this.send({ type: 'leave' });
  }

  disconnect(): void {
    this.explicitDisconnect = true;
    this.reconnectToken = undefined;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'leave' }));
        } catch {
          // ignore
        }
      }
      try {
        this.socket.close(WS_CLOSE_CODES.NORMAL, 'Normal closure');
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.setState('idle');
  }
}
