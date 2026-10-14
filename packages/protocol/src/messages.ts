import { z } from 'zod';

export const SharingStateSchema = z.object({
  active: z.boolean(),
  streamId: z.string().min(1).max(128).optional(),
  hasAudio: z.boolean(),
  audioMuted: z.boolean(),
});
export type SharingState = z.infer<typeof SharingStateSchema>;
export const UpdateSharingMessageSchema = SharingStateSchema.extend({ type: z.literal('update-sharing') });
export const SharingUpdatedMessageSchema = SharingStateSchema.extend({ type: z.literal('sharing-updated'), peerId: z.string().min(1) });

// Participant presence info
export const ParticipantInfoSchema = z.object({
  peerId: z.string().min(1),
  sharing: SharingStateSchema.optional(),
  nickname: z.string().trim().min(1).max(32).optional(),
});
export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;

// Client -> Server
export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  nickname: z.string().trim().min(1).max(32).optional(),
  reconnectToken: z.string().trim().min(1).max(128).optional(),
});
export type JoinMessage = z.infer<typeof JoinMessageSchema>;

export const SignalRelayMessageSchema = z.object({
  type: z.literal('signal'),
  target: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
export type SignalRelayMessage = z.infer<typeof SignalRelayMessageSchema>;

export const UpdateNicknameMessageSchema = z.object({
  type: z.literal('update-nickname'),
  nickname: z.string().trim().max(32).optional(),
});
export type UpdateNicknameMessage = z.infer<typeof UpdateNicknameMessageSchema>;

export const LeaveMessageSchema = z.object({
  type: z.literal('leave'),
});
export type LeaveMessage = z.infer<typeof LeaveMessageSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  UpdateSharingMessageSchema,
  SignalRelayMessageSchema,
  UpdateNicknameMessageSchema,
  LeaveMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server -> Client
export const PeersMessageSchema = z.object({
  type: z.literal('peers'),
  peers: z.array(z.string()),
  count: z.number().int().nonnegative(),
  participants: z.array(ParticipantInfoSchema).optional(),
  reconnectToken: z.string().trim().min(1).max(128).optional(),
});
export type PeersMessage = z.infer<typeof PeersMessageSchema>;

export const PeerJoinedMessageSchema = z.object({
  type: z.literal('peer-joined'),
  peerId: z.string(),
  count: z.number().int().positive(),
  nickname: z.string().trim().min(1).max(32).optional(),
});
export type PeerJoinedMessage = z.infer<typeof PeerJoinedMessageSchema>;

export const PeerLeftMessageSchema = z.object({
  type: z.literal('peer-left'),
  peerId: z.string(),
  count: z.number().int().nonnegative(),
});
export type PeerLeftMessage = z.infer<typeof PeerLeftMessageSchema>;

export const PeerUpdatedMessageSchema = z.object({
  type: z.literal('peer-updated'),
  peerId: z.string().min(1),
  nickname: z.string().trim().min(1).max(32).optional(),
});
export type PeerUpdatedMessage = z.infer<typeof PeerUpdatedMessageSchema>;

export const RelayedSignalMessageSchema = z.object({
  type: z.literal('signal'),
  from: z.string(),
  data: z.record(z.unknown()).or(z.any()),
});
export type RelayedSignalMessage = z.infer<typeof RelayedSignalMessageSchema>;

export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  POLICY_VIOLATION: 1008,
  SUPERSEDED: 4000,
  UNAUTHORIZED_RECONNECT: 4401,
  ROOM_FULL: 4009,
  FORBIDDEN_ORIGIN: 4403,
} as const;

export const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  WS_CLOSE_CODES.NORMAL,
  WS_CLOSE_CODES.POLICY_VIOLATION,
  WS_CLOSE_CODES.SUPERSEDED,
  WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT,
  WS_CLOSE_CODES.ROOM_FULL,
  WS_CLOSE_CODES.FORBIDDEN_ORIGIN,
]);

export function isTerminalCloseCode(code: number): boolean {
  return TERMINAL_CLOSE_CODES.has(code);
}

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  PeersMessageSchema,
  SharingUpdatedMessageSchema,
  PeerJoinedMessageSchema,
  PeerLeftMessageSchema,
  PeerUpdatedMessageSchema,
  RelayedSignalMessageSchema,
  ErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const OfferSignalPayloadSchema = z.object({
  type: z.literal('offer'),
  sdp: z.unknown(),
});
export type OfferSignalPayload = z.infer<typeof OfferSignalPayloadSchema>;

export const AnswerSignalPayloadSchema = z.object({
  type: z.literal('answer'),
  sdp: z.unknown(),
});
export type AnswerSignalPayload = z.infer<typeof AnswerSignalPayloadSchema>;

export const IceSignalPayloadSchema = z.object({
  type: z.literal('ice'),
  candidate: z.unknown(),
});
export type IceSignalPayload = z.infer<typeof IceSignalPayloadSchema>;

export type SignalPayload =
  | OfferSignalPayload
  | AnswerSignalPayload
  | IceSignalPayload
  | { type: string; [key: string]: unknown };

export function isOfferSignal(data: unknown): data is OfferSignalPayload {
  return typeof data === 'object' && data !== null && (data as any).type === 'offer';
}

export function isAnswerSignal(data: unknown): data is AnswerSignalPayload {
  return typeof data === 'object' && data !== null && (data as any).type === 'answer';
}

export function isIceSignal(data: unknown): data is IceSignalPayload {
  return typeof data === 'object' && data !== null && (data as any).type === 'ice';
}

export function isClientMessage(data: unknown): data is ClientMessage {
  return ClientMessageSchema.safeParse(data).success;
}

export function isServerMessage(data: unknown): data is ServerMessage {
  return ServerMessageSchema.safeParse(data).success;
}
