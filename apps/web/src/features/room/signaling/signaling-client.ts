import {
  type ClientMessage,
  type ServerMessage,
  isServerMessage,
} from '@screen-room/protocol';
import type { ConnectionState } from '../types';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export interface SignalingClientOptions {
  url?: string;
  onMessage: (message: ServerMessage) => void;
  onStateChange: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  logger?: DiagnosticsLogger;
}

export class SignalingClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private readonly options: SignalingClientOptions;
  private explicitDisconnect = false;

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
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.explicitDisconnect = false;
    this.setState('connecting');
    const url = this.resolveUrl();
    this.options.logger?.log('signal-connecting', { url });

    try {
      this.socket = new WebSocket(url);
    } catch (err: any) {
      this.setState('error');
      this.options.logger?.log('signal-error', { error: err?.message || 'WebSocket creation failed' });
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    this.socket.onopen = () => {
      this.setState('connected');
      this.options.logger?.log('signal-open', { url });
    };

    this.socket.onclose = (event) => {
      this.options.logger?.log('signal-close', { code: event.code, clean: event.wasClean });
      this.socket = null;
      if (!this.explicitDisconnect) {
        this.setState('disconnected');
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
          this.options.logger?.log('signal-receive', { type: raw.type, count: (raw as any).count });
          this.options.onMessage(raw);
        } else {
          this.options.logger?.log('signal-malformed', { data: raw });
        }
      } catch (parseError: any) {
        this.options.logger?.log('signal-parse-error', { message: parseError?.message });
      }
    };
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.options.logger?.log('signal-skip', { type: message.type, reason: 'socket-not-open' });
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      this.options.logger?.log('signal-send', {
        type: (message as any).data?.type || message.type,
        target: (message as any).target || '-',
      });
      return true;
    } catch (sendError: any) {
      this.options.logger?.log('signal-send-error', { message: sendError?.message });
      return false;
    }
  }

  join(roomId: string, peerId: string, nickname?: string): boolean {
    return this.send({
      type: 'join',
      roomId,
      peerId,
      ...(nickname ? { nickname } : {}),
    });
  }

  updateNickname(nickname?: string): boolean {
    return this.send({
      type: 'update-nickname',
      ...(nickname !== undefined ? { nickname } : {}),
    });
  }

  relaySignal(target: string, data: Record<string, unknown> | any): boolean {
    return this.send({ type: 'signal', target, data });
  }

  disconnect(): void {
    this.explicitDisconnect = true;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.setState('idle');
  }
}
