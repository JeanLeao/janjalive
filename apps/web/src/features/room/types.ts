import type { QualityProfileKey } from '@screen-room/protocol';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RemoteStreamEntry {
  peerId: string;
  stream: MediaStream;
}

export interface RoomParticipant {
  peerId: string;
  nickname?: string;
  isLocal: boolean;
  isSharing: boolean;
  isPaused?: boolean;
  streamId?: string;
  pointingEnabled?: boolean;
  drawingEnabled?: boolean;
  hasAudio?: boolean;
}

export interface NetworkMetrics {
  bitrateKbps: number;
  lossPercent: number;
  rttMs: number;
  activeConnections: number;
}

export interface DiagnosticEntry {
  id: string;
  timestamp: string;
  event: string;
  details: Record<string, unknown>;
}
