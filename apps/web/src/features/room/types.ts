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
  bitrateKbps: number | null;
  lossPercent: number | null;
  rttMs: number | null;
  activeConnections: number;
  peers: PeerDiagnostics[];
}

export interface DiagnosticEntry {
  id: string;
  timestamp: string;
  event: string;
  details: Record<string, unknown>;
}

export interface PeerDiagnostics {
  peerId: string;
  connection: RTCPeerConnectionState;
  ice: RTCIceConnectionState;
  signaling: RTCSignalingState;
  negotiated: boolean;
  stats: 'available' | 'unavailable';
  measurement: Record<'bitrate' | 'loss' | 'rtt', 'unavailable' | 'no-report' | 'unsupported' | 'pending' | 'measured'>;
  receiving: boolean | null;
  framesDecoded: number | null;
  bitrateKbps: number | null;
  lossPercent: number | null;
  rttMs: number | null;
}
