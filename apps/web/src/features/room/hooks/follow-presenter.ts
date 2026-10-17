/**
 * F29 — "Seguir apresentador": pure client-side state for follow mode.
 *
 * Followed presenters are identified by their ephemeral peerId. Indications are
 * authoritative server events (`stage-indicated`, per-presenter `seq`); this reducer only
 * keeps the newest one per presenter and decides whether following is active, suspended by
 * a manual selection, or waiting for a disconnected presenter to come back.
 */
export interface FollowIndication {
  targetPeerId: string | null;
  seq: number;
}

export interface FollowState {
  /** Presenter chosen by the viewer, or null while following is off. */
  presenterId: string | null;
  /** The viewer took manual control; only an explicit resume reapplies indications. */
  suspended: boolean;
  /** The followed presenter dropped and may still reconnect with the same identity. */
  away: boolean;
  /** No indication has been seen since following (re)started: fall back to the presenter's own stream once. */
  fallbackPending: boolean;
  indications: Record<string, FollowIndication>;
}

export type FollowStatus = 'off' | 'active' | 'suspended' | 'away';

export type FollowAction =
  | { type: 'follow'; presenterId: string }
  | { type: 'stop' }
  | { type: 'manual-select' }
  | { type: 'resume' }
  | { type: 'fallback-done' }
  | { type: 'indication'; presenterId: string; targetPeerId: string | null; seq: number }
  | { type: 'snapshot'; indications: Record<string, FollowIndication> }
  | { type: 'presenter-left'; presenterId: string; reserved: boolean }
  | { type: 'presenter-back'; presenterId: string }
  | { type: 'presenter-expired'; presenterId: string }
  | { type: 'reset' };

export const initialFollowState: FollowState = {
  presenterId: null, suspended: false, away: false, fallbackPending: false, indications: {},
};

export function followStatus(state: FollowState): FollowStatus {
  if (!state.presenterId) return 'off';
  if (state.suspended) return 'suspended';
  return state.away ? 'away' : 'active';
}

export function followReducer(state: FollowState, action: FollowAction): FollowState {
  switch (action.type) {
    case 'follow':
      return { ...state, presenterId: action.presenterId, suspended: false, away: false, fallbackPending: true };
    case 'stop':
      return { ...state, presenterId: null, suspended: false, away: false, fallbackPending: false };
    case 'manual-select':
      return state.presenterId && !state.suspended ? { ...state, suspended: true, fallbackPending: false } : state;
    case 'resume':
      return state.presenterId && state.suspended ? { ...state, suspended: false, fallbackPending: true } : state;
    case 'fallback-done':
      return state.fallbackPending ? { ...state, fallbackPending: false } : state;
    case 'indication': {
      const known = state.indications[action.presenterId];
      if (known && action.seq <= known.seq) return state; // late or repeated
      return {
        ...state,
        // Any indication (even a clear) means the presenter drives the stage: no own-stream fallback.
        fallbackPending: action.presenterId === state.presenterId ? false : state.fallbackPending,
        indications: { ...state.indications, [action.presenterId]: { targetPeerId: action.targetPeerId, seq: action.seq } },
      };
    }
    case 'snapshot':
      return {
        ...state,
        fallbackPending: state.presenterId ? !(state.presenterId in action.indications) : false,
        indications: action.indications,
      };
    case 'presenter-left': {
      const { [action.presenterId]: _dropped, ...indications } = state.indications;
      if (action.presenterId !== state.presenterId) return { ...state, indications };
      // Voluntary leave is final; an involuntary drop keeps the choice while the identity is reserved.
      return action.reserved
        ? { ...state, indications, away: true }
        : { ...state, indications, presenterId: null, suspended: false, away: false, fallbackPending: false };
    }
    case 'presenter-back':
      if (action.presenterId !== state.presenterId || !state.away) return state;
      return { ...state, away: false, fallbackPending: !state.suspended };
    case 'presenter-expired':
      if (action.presenterId !== state.presenterId || !state.away) return state;
      return { ...state, presenterId: null, suspended: false, away: false, fallbackPending: false };
    case 'reset':
      return initialFollowState;
  }
}

export interface FollowContext {
  localPeerId: string;
  /** Participants whose stream is currently shared (paused included), local one included. */
  isSharing: (peerId: string) => boolean;
}

/**
 * Stage id ('local' or a remote peerId) that follow mode wants highlighted, or null when it
 * must not force anything (off, suspended, presenter away, indicated stream ended, nothing to say).
 */
export function followTarget(state: FollowState, ctx: FollowContext): { stageId: string; consumesFallback: boolean } | null {
  const { presenterId } = state;
  if (!presenterId || state.suspended || state.away) return null;
  const indication = state.indications[presenterId];
  if (indication) {
    const target = indication.targetPeerId;
    if (!target || !ctx.isSharing(target)) return null;
    return { stageId: target === ctx.localPeerId ? 'local' : target, consumesFallback: false };
  }
  if (state.fallbackPending && ctx.isSharing(presenterId)) return { stageId: presenterId, consumesFallback: true };
  return null;
}
