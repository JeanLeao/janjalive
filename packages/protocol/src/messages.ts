import { z } from 'zod';

export const SharingStateSchema = z.object({
  active: z.boolean(),
  paused: z.boolean().optional(),
  streamId: z.string().min(1).max(128).optional(),
  pointingEnabled: z.boolean().optional(),
  drawingEnabled: z.boolean().optional(),
  hasAudio: z.boolean(),
  audioMuted: z.boolean(),
});
export type SharingState = z.infer<typeof SharingStateSchema>;
export const UpdateSharingMessageSchema = SharingStateSchema.extend({ type: z.literal('update-sharing') });
export const SharingUpdatedMessageSchema = SharingStateSchema.extend({ type: z.literal('sharing-updated'), peerId: z.string().min(1) });

// F29: a presenter's current stage selection. `seq` is assigned by the server and only grows per presenter.
export const StageSelectionSchema = z.object({
  targetPeerId: z.string().min(1).max(64),
  seq: z.number().int().nonnegative(),
}).strict();
export type StageSelection = z.infer<typeof StageSelectionSchema>;
export const SelectStageMessageSchema = z.object({
  type: z.literal('select-stage'),
  targetPeerId: z.string().min(1).max(64),
}).strict();
export type SelectStageMessage = z.infer<typeof SelectStageMessageSchema>;
export const StageSelectedMessageSchema = z.object({
  type: z.literal('stage-selected'),
  peerId: z.string().min(1),
  targetPeerId: z.string().min(1).max(64).nullable(),
  seq: z.number().int().nonnegative(),
}).strict();
export type StageSelectedMessage = z.infer<typeof StageSelectedMessageSchema>;
export const STAGE_SELECTION_LIMITS = { perSecond: 5 } as const;

// F38: server-owned order and per-session compare-and-set version.
export const HandStateSchema = z.object({
  peerId: z.string().min(1),
  order: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type HandState = z.infer<typeof HandStateSchema>;
export const SetHandSchema = z.object({
  type: z.literal('set-hand'), raised: z.boolean(),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export const HandsSnapshotSchema = z.object({
  type: z.literal('hands-snapshot'), roomId: z.string().min(1),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  hands: z.array(HandStateSchema).max(1000),
}).strict();
export type HandsSnapshot = z.infer<typeof HandsSnapshotSchema>;
export const HAND_LIMITS = { burst: 6, windowMs: 10_000 } as const;

// F38 Q&A: room-scoped ephemeral questions, answers and spotlight.
export const QA_LIMITS = {
  questionLength: 500,
  answerLength: 1000,
  maxQuestionsPerRoom: 100,
  burst: 8,
  windowMs: 10_000,
} as const;
const QaControlRegex = /^[^\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/u;
export const QaQuestionTextSchema = z.string().trim().min(1).max(QA_LIMITS.questionLength).regex(QaControlRegex);
export const QaAnswerTextSchema = z.string().trim().min(1).max(QA_LIMITS.answerLength).regex(QaControlRegex);
export const QaQuestionStatusSchema = z.enum(['open', 'answered-text', 'answered-verbal']);
export type QaQuestionStatus = z.infer<typeof QaQuestionStatusSchema>;
export const QaQuestionAnswerSchema = z.object({
  text: QaAnswerTextSchema.optional(),
  answeredByPeerId: z.string().min(1),
  answeredByNickname: z.string().trim().min(1).max(32).optional(),
  answeredAt: z.number().int().nonnegative(),
}).strict();
export type QaQuestionAnswer = z.infer<typeof QaQuestionAnswerSchema>;
export const QaQuestionSchema = z.object({
  id: z.string().uuid(),
  order: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  authorPeerId: z.string().min(1),
  authorNickname: z.string().trim().min(1).max(32).optional(),
  text: QaQuestionTextSchema,
  createdAt: z.number().int().nonnegative(),
  status: QaQuestionStatusSchema,
  answer: QaQuestionAnswerSchema.optional(),
}).strict();
export type QaQuestion = z.infer<typeof QaQuestionSchema>;
export const SubmitQuestionSchema = z.object({
  type: z.literal('submit-question'),
  requestId: z.string().uuid(),
  text: QaQuestionTextSchema,
}).strict();
export const WithdrawQuestionSchema = z.object({
  type: z.literal('withdraw-question'),
  requestId: z.string().uuid(),
  questionId: z.string().uuid(),
}).strict();
export const UpdateQuestionBaseSchema = z.object({
  type: z.literal('update-question'),
  requestId: z.string().uuid(),
  questionId: z.string().uuid(),
  action: z.enum(['answer-text', 'answer-verbal', 'reopen', 'highlight', 'unhighlight']),
  answerText: QaAnswerTextSchema.optional(),
}).strict();
export const UpdateQuestionSchema = UpdateQuestionBaseSchema.superRefine((val, ctx) => {
  if (val.action === 'answer-text' && !val.answerText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answerText is required for answer-text' });
  } else if (val.action !== 'answer-text' && val.answerText !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answerText is only allowed for answer-text' });
  }
});
export type SubmitQuestionMessage = z.infer<typeof SubmitQuestionSchema>;
export type WithdrawQuestionMessage = z.infer<typeof WithdrawQuestionSchema>;
export type UpdateQuestionMessage = z.infer<typeof UpdateQuestionSchema>;
export const QuestionsSnapshotSchema = z.object({
  type: z.literal('questions-snapshot'),
  roomId: z.string().min(1),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  highlightedQuestionId: z.string().uuid().nullable(),
  questions: z.array(QaQuestionSchema).max(QA_LIMITS.maxQuestionsPerRoom),
}).strict();
export type QuestionsSnapshot = z.infer<typeof QuestionsSnapshotSchema>;
export const QuestionAcceptedSchema = z.object({
  type: z.literal('question-accepted'),
  requestId: z.string().uuid(),
  roomId: z.string().min(1),
  questionId: z.string().uuid(),
}).strict();
export type QuestionAccepted = z.infer<typeof QuestionAcceptedSchema>;

// F38 polls: personalized snapshots never expose the private voter identity.
export const POLL_LIMITS = {
  questionLength: 300, optionLength: 120, minOptions: 2, maxOptions: 5,
  closedHistory: 3, votersPerPoll: 10_000, burst: 8, windowMs: 10_000,
} as const;
export const PollQuestionSchema = z.string().trim().min(1).max(POLL_LIMITS.questionLength).regex(QaControlRegex);
export const PollOptionTextSchema = z.string().trim().min(1).max(POLL_LIMITS.optionLength).regex(QaControlRegex);
export const CreatePollSchema = z.object({
  type: z.literal('create-poll'), requestId: z.string().uuid(), question: PollQuestionSchema,
  options: z.array(PollOptionTextSchema).min(POLL_LIMITS.minOptions).max(POLL_LIMITS.maxOptions),
}).strict();
export const VotePollSchema = z.object({
  type: z.literal('vote-poll'), requestId: z.string().uuid(), pollId: z.string().uuid(),
  option: z.number().int().min(0).max(POLL_LIMITS.maxOptions - 1),
}).strict();
export const ClosePollSchema = z.object({
  type: z.literal('close-poll'), requestId: z.string().uuid(), pollId: z.string().uuid(),
}).strict();
export type PollOperation = z.infer<typeof CreatePollSchema> | z.infer<typeof VotePollSchema> | z.infer<typeof ClosePollSchema>;
export const PollSchema = z.object({
  id: z.string().uuid(), question: PollQuestionSchema,
  options: z.array(PollOptionTextSchema).min(2).max(5),
  createdAt: z.number().int().nonnegative(), closedAt: z.number().int().nonnegative().nullable(),
  ownVote: z.number().int().min(0).max(4).nullable(),
  counts: z.array(z.number().int().min(0).max(POLL_LIMITS.votersPerPoll)).min(2).max(5).nullable(),
}).strict();
export type Poll = z.infer<typeof PollSchema>;
export const PollsSnapshotSchema = z.object({
  type: z.literal('polls-snapshot'), roomId: z.string().min(1),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  polls: z.array(PollSchema).max(POLL_LIMITS.closedHistory + 1),
}).strict();
export type PollsSnapshot = z.infer<typeof PollsSnapshotSchema>;
export const PollAcceptedSchema = z.object({
  type: z.literal('poll-accepted'), requestId: z.string().uuid(), roomId: z.string().min(1),
}).strict();

// Participant presence info
export const ParticipantInfoSchema = z.object({
  peerId: z.string().min(1),
  sharing: SharingStateSchema.optional(),
  selection: StageSelectionSchema.optional(),
  nickname: z.string().trim().min(1).max(32).optional(),
});
export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;

// Ephemeral interactions: limits shared by validation, server and UI.
export const INTERACTION_LIMITS = {
  textLength: 1000, history: 200, chatBurst: 5, reactionBurst: 8,
  windowMs: 10_000, reactionDurationMs: 3000, visibleReactions: 6,
} as const;
export const REACTIONS = [
  'applause', 'like', 'heart', 'celebrate',
  'brazil', 'dislike', 'middle-finger', 'bubbles', 'rocket',
] as const;
export const ReactionSchema = z.enum(REACTIONS);
export type Reaction = z.infer<typeof ReactionSchema>;
export const ChatTextSchema = z.string().trim().min(1).max(INTERACTION_LIMITS.textLength)
  .regex(/^[^\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/u);
const RequestIdSchema = z.string().uuid();
export const SendChatSchema = z.object({ type: z.literal('send-chat'), requestId: RequestIdSchema, text: ChatTextSchema }).strict();
export const SendReactionSchema = z.object({ type: z.literal('send-reaction'), requestId: RequestIdSchema, reaction: ReactionSchema }).strict();
const interactionIdentity = {
  id: z.string().uuid(), requestId: RequestIdSchema, roomId: z.string().min(1),
  peerId: z.string().min(1), nickname: z.string().min(1).max(32).optional(),
  timestamp: z.number().int().nonnegative(),
};
export const ChatMessageSchema = z.object({ type: z.literal('chat-message'), ...interactionIdentity, text: ChatTextSchema });
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export const ReactionEventSchema = z.object({ type: z.literal('reaction'), ...interactionIdentity, reaction: ReactionSchema });
export type ReactionEvent = z.infer<typeof ReactionEventSchema>;
export const InteractionRejectedSchema = z.object({
  type: z.literal('interaction-rejected'), requestId: RequestIdSchema,
  message: z.string(),
});

// F13: bounded live events only; no snapshots or history.
export const COLLABORATION_LIMITS = {
  annotationTtlMs: 8000, laserTtlMs: 900, pointTtlMs: 2600, sendIntervalMs: 50,
  pointsPerEvent: 16, pointsPerStroke: 512, strokesPerCapture: 32, pointersPerCapture: 8,
  trackedPointersPerCapture: 24,
  laserPerSecond: 25, drawingPerSecond: 30, clearPerSecond: 3, pointPerSecond: 4,
  spectatorDrawingPerSecond: 30, aggregateCollaborativeDrawingPerSecond: 120,
  collaborativeStrokesPerCapture: 32, trackedDrawersPerCapture: 24,
  maxBufferedBytes: 32_768,
} as const;
export const NormalizedPointSchema = z.object({
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
}).strict();
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;
const collaborationBase = {
  streamId: z.string().min(1).max(128),
  eventId: z.string().uuid(), seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};
export const LaserMessageSchema = z.object({
  type: z.literal('laser'), ...collaborationBase, point: NormalizedPointSchema.nullable(),
}).strict();
export const DrawingMessageSchema = z.object({
  type: z.literal('drawing'), ...collaborationBase, strokeId: z.string().uuid(),
  phase: z.enum(['start', 'move', 'end', 'cancel']),
  index: z.number().int().min(0).max(COLLABORATION_LIMITS.pointsPerStroke),
  points: z.array(NormalizedPointSchema).max(COLLABORATION_LIMITS.pointsPerEvent),
}).strict();
export const ClearAnnotationsSchema = z.object({ type: z.literal('clear-annotations'), ...collaborationBase }).strict();
export const ClearCollaborativeDrawingsSchema = z.object({
  type: z.literal('clear-collaborative-drawings'),
  ...collaborationBase,
}).strict();
export type ClearCollaborativeDrawingsMessage = z.infer<typeof ClearCollaborativeDrawingsSchema>;
export const PointMessageSchema = z.object({
  type: z.literal('point'), targetPeerId: z.string().min(1).max(64),
  ...collaborationBase, point: NormalizedPointSchema,
}).strict();
export type PointMessage = z.infer<typeof PointMessageSchema>;
export const PointCollaborationEventSchema = PointMessageSchema.extend({
  senderPeerId: z.string().min(1).max(64),
  senderNickname: z.string().trim().min(1).max(32).optional(),
}).strict();
export type PointCollaborationEvent = z.infer<typeof PointCollaborationEventSchema>;

export const SpectatorDrawingMessageSchema = z.object({
  type: z.literal('spectator-drawing'), targetPeerId: z.string().min(1).max(64),
  ...collaborationBase, strokeId: z.string().uuid(),
  phase: z.enum(['start', 'move', 'end', 'cancel']),
  index: z.number().int().min(0).max(COLLABORATION_LIMITS.pointsPerStroke),
  points: z.array(NormalizedPointSchema).max(COLLABORATION_LIMITS.pointsPerEvent),
}).strict();
export type SpectatorDrawingMessage = z.infer<typeof SpectatorDrawingMessageSchema>;
export const SpectatorDrawingCollaborationEventSchema = SpectatorDrawingMessageSchema.extend({
  senderPeerId: z.string().min(1).max(64),
  senderNickname: z.string().trim().min(1).max(32).optional(),
}).strict();
export type SpectatorDrawingCollaborationEvent = z.infer<typeof SpectatorDrawingCollaborationEventSchema>;

export type PresenterCollaborationMessage =
  | z.infer<typeof LaserMessageSchema>
  | z.infer<typeof DrawingMessageSchema>
  | z.infer<typeof ClearAnnotationsSchema>
  | ClearCollaborativeDrawingsMessage;
export type CollaborationMessage =
  | PresenterCollaborationMessage
  | PointMessage
  | SpectatorDrawingMessage;
export type CollaborationEventPayload =
  | PresenterCollaborationMessage
  | PointCollaborationEvent
  | SpectatorDrawingCollaborationEvent;
export const CollaborationEventSchema = z.object({
  type: z.literal('collaboration'), roomId: z.string().min(1), peerId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  event: z.discriminatedUnion('type', [
    LaserMessageSchema,
    DrawingMessageSchema,
    ClearAnnotationsSchema,
    ClearCollaborativeDrawingsSchema,
    PointCollaborationEventSchema,
    SpectatorDrawingCollaborationEventSchema,
  ]),
});
export type CollaborationEvent = z.infer<typeof CollaborationEventSchema>;

// F16: ephemeral consent and two-phase local recording. No media crosses signaling.
export const CLIP_LIMITS = { durationMs: 60_000, bytes: 64 * 1024 * 1024, pendingMs: 5000 } as const;
export const ClipOperationSchema = z.object({
  type: z.literal('clip-operation'),
  seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  action: z.enum(['permission', 'request', 'started', 'stop']),
  presenterId: z.string().min(1).max(128), streamId: z.string().min(1).max(128),
  recordingId: z.string().uuid(),
  version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  allowed: z.boolean().optional(),
}).strict();
export type ClipOperation = z.infer<typeof ClipOperationSchema>;
export const ClipPermissionSchema = z.object({
  presenterId: z.string(), streamId: z.string(), allowed: z.boolean(), version: z.number().int().nonnegative(),
});
export const ClipActiveSchema = z.object({
  recordingId: z.string().uuid(), recorderId: z.string(), presenterId: z.string(), streamId: z.string(), startedAt: z.number(),
});
export const ClipsSnapshotSchema = z.object({
  type: z.literal('clips-snapshot'), roomId: z.string(), revision: z.number().int().nonnegative(),
  permissions: z.array(ClipPermissionSchema).max(1000), recordings: z.array(ClipActiveSchema).max(1000),
});
export type ClipsSnapshot = z.infer<typeof ClipsSnapshotSchema>;
export const ClipResultSchema = z.object({
  type: z.literal('clip-result'), recordingId: z.string().uuid(), ok: z.boolean(), message: z.string(),
});

// Client -> Server
export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: z.string().min(1),
  peerId: z.string().min(1),
  nickname: z.string().trim().min(1).max(32).optional(),
  reconnectToken: z.string().trim().min(1).max(128).optional(),
  hostCredential: z.string().min(1).max(128).optional(),
  roomKey: z.string().trim().min(1).max(128).optional(),
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

export const RoomStateSchema = z.object({
  hostPeerId: z.string().nullable(),
  hostConnected: z.boolean(),
  locked: z.boolean(),
  revision: z.number().int().nonnegative(),
  isProtected: z.boolean().optional(),
}).strict();
export type RoomState = z.infer<typeof RoomStateSchema>;
export const CreateRoomSchema = z.object({
  type: z.literal('create-room'),
  isProtected: z.boolean().optional(),
}).strict();
export const ModerateRoomSchema = z.object({
  type: z.literal('moderate-room'),
  requestId: z.string().min(1).max(80),
  revision: z.number().int().nonnegative(),
  action: z.enum(['lock', 'unlock', 'remove']),
  targetPeerId: z.string().min(1).max(80).optional(),
}).strict();
export const RoomCreatedSchema = z.object({
  type: z.literal('room-created'),
  roomId: z.string(),
  hostCredential: z.string().min(1).max(128),
  roomKey: z.string().min(1).max(128).optional(),
}).strict();
export const RoomStateMessageSchema = z.object({ type: z.literal('room-state'), state: RoomStateSchema }).strict();
export const ModerationResultSchema = z.object({
  type: z.literal('moderation-result'), requestId: z.string(), ok: z.boolean(), message: z.string(),
}).strict();

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClipOperationSchema,
  LaserMessageSchema, DrawingMessageSchema, ClearAnnotationsSchema, ClearCollaborativeDrawingsSchema,
  PointMessageSchema, SpectatorDrawingMessageSchema,
  CreatePollSchema, VotePollSchema, ClosePollSchema,
  SetHandSchema,
  SubmitQuestionSchema,
  WithdrawQuestionSchema,
  UpdateQuestionBaseSchema,
  SendChatSchema,
  SendReactionSchema,
  CreateRoomSchema, ModerateRoomSchema,
  JoinMessageSchema,
  UpdateSharingMessageSchema,
  SelectStageMessageSchema,
  SignalRelayMessageSchema,
  UpdateNicknameMessageSchema,
  LeaveMessageSchema,
]).superRefine((val, ctx) => {
  if (val.type === 'update-question') {
    if (val.action === 'answer-text' && !val.answerText) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answerText is required for answer-text' });
    } else if (val.action !== 'answer-text' && val.answerText !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'answerText is only allowed for answer-text' });
    }
  }
});
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server -> Client
export const ReservedPeerInfoSchema = z.object({
  peerId: z.string().min(1),
  reconnectGraceMs: z.number().int().positive(),
}).strict();
export type ReservedPeerInfo = z.infer<typeof ReservedPeerInfoSchema>;

export const PeersMessageSchema = z.object({
  type: z.literal('peers'),
  serverTime: z.number().int().nonnegative().optional(),
  peers: z.array(z.string()),
  count: z.number().int().nonnegative(),
  participants: z.array(ParticipantInfoSchema).optional(),
  roomState: RoomStateSchema.optional(),
  reservedPeers: z.array(ReservedPeerInfoSchema).optional(),
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
  /** Present only for involuntary drops: the identity stays reserved for this long. */
  reconnectGraceMs: z.number().int().positive().optional(),
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
  ROOM_NOT_FOUND: 4404,
  ROOM_LOCKED: 4423,
  REMOVED: 4408,
  NORMAL: 1000,
  POLICY_VIOLATION: 1008,
  SUPERSEDED: 4000,
  UNAUTHORIZED_RECONNECT: 4401,
  ROOM_FULL: 4009,
  FORBIDDEN_ORIGIN: 4403,
  KEY_REQUIRED: 4425,
  KEY_INVALID: 4426,
  KEY_RATE_LIMIT: 4429,
} as const;

export const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([
  WS_CLOSE_CODES.ROOM_NOT_FOUND, WS_CLOSE_CODES.ROOM_LOCKED, WS_CLOSE_CODES.REMOVED,
  WS_CLOSE_CODES.NORMAL,
  WS_CLOSE_CODES.POLICY_VIOLATION,
  WS_CLOSE_CODES.SUPERSEDED,
  WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT,
  WS_CLOSE_CODES.ROOM_FULL,
  WS_CLOSE_CODES.FORBIDDEN_ORIGIN,
  WS_CLOSE_CODES.KEY_REQUIRED,
  WS_CLOSE_CODES.KEY_INVALID,
  WS_CLOSE_CODES.KEY_RATE_LIMIT,
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
  ClipsSnapshotSchema, ClipResultSchema,
  RoomCreatedSchema, RoomStateMessageSchema, ModerationResultSchema,
  PollsSnapshotSchema, PollAcceptedSchema,
  HandsSnapshotSchema,
  QuestionsSnapshotSchema,
  QuestionAcceptedSchema,
  CollaborationEventSchema,
  ChatMessageSchema,
  ReactionEventSchema,
  InteractionRejectedSchema,
  PeersMessageSchema,
  SharingUpdatedMessageSchema,
  StageSelectedMessageSchema,
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
