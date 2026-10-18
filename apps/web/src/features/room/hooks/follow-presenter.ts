/**
 * F29 — "Seguir apresentador": pure client-side state for follow mode.
 *
 * Followed presenters are identified by their ephemeral peerId. Selections are
 * authoritative server events (`stage-selected`, per-presenter `seq`); this reducer only
 * keeps the newest one per presenter and decides whether following is active, suspended by
 * a manual selection, or waiting for a disconnected presenter to come back.
 */
export interface FollowSelection {
  targetPeerId: string | null;
  seq: number;
}

export interface FollowState {
  /** Presenter chosen by the viewer, or null while following is off. */
  presenterId: string | null;
  /** The viewer took manual control; only an explicit resume reapplies selections. */
  suspended: boolean;
  /** The followed presenter dropped and may still reconnect with the same identity. */
  away: boolean;
  /** No selection has been seen since following (re)started: fall back to the presenter's own stream once. */
  fallbackPending: boolean;
  selections: Record<string, FollowSelection>;
}

export type FollowStatus = 'off' | 'active' | 'suspended' | 'away' | 'unavailable';

export type FollowAction =
  | { type: 'follow'; presenterId: string }
  | { type: 'stop' }
  | { type: 'manual-select' }
  | { type: 'resume' }
  | { type: 'fallback-done' }
  | { type: 'selection'; presenterId: string; targetPeerId: string | null; seq: number }
  | { type: 'snapshot'; selections: Record<string, FollowSelection> }
  | { type: 'presenter-left'; presenterId: string; reserved: boolean }
  | { type: 'presenter-back'; presenterId: string }
  | { type: 'presenter-expired'; presenterId: string }
  | { type: 'reset' };

export const initialFollowState: FollowState = {
  presenterId: null, suspended: false, away: false, fallbackPending: false, selections: {},
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
    case 'selection': {
      const known = state.selections[action.presenterId];
      if (known && action.seq <= known.seq) return state; // late or repeated
      return {
        ...state,
        // Any selection (even a clear) means the presenter drives the stage: no own-stream fallback.
        fallbackPending: action.presenterId === state.presenterId ? false : state.fallbackPending,
        selections: { ...state.selections, [action.presenterId]: { targetPeerId: action.targetPeerId, seq: action.seq } },
      };
    }
    case 'snapshot':
      return {
        ...state,
        fallbackPending: state.presenterId ? !(state.presenterId in action.selections) : false,
        selections: action.selections,
      };
    case 'presenter-left': {
      const { [action.presenterId]: _dropped, ...selections } = state.selections;
      if (action.presenterId !== state.presenterId) return { ...state, selections };
      // Voluntary leave is final; an involuntary drop keeps the choice while the identity is reserved.
      return action.reserved
        ? { ...state, selections, away: true }
        : { ...state, selections, presenterId: null, suspended: false, away: false, fallbackPending: false };
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
  const selection = state.selections[presenterId];
  if (selection) {
    const target = selection.targetPeerId;
    if (!target || !ctx.isSharing(target)) return null;
    return { stageId: target === ctx.localPeerId ? 'local' : target, consumesFallback: false };
  }
  if (state.fallbackPending && ctx.isSharing(presenterId)) return { stageId: presenterId, consumesFallback: true };
  return null;
}

/** Configured follow mode can remain active while its requested stream is unavailable. */
export function followDisplayStatus(state: FollowState, ctx: FollowContext, connected: boolean): FollowStatus {
  const status = followStatus(state);
  if (status === 'off') return status;
  if (!connected || state.away) return 'away';
  if (status === 'suspended') return status;
  const selection = state.presenterId ? state.selections[state.presenterId] : undefined;
  const target = selection ? selection.targetPeerId : state.presenterId;
  return target && ctx.isSharing(target) ? 'active' : 'unavailable';
}

/** Match signaling eligibility: an announced capture remains eligible while paused or changing source. */
export function canSendStageSelection(context: {
  connected: boolean;
  roomReady: boolean;
  sharing: boolean;
}): boolean {
  return context.connected && context.roomReady && context.sharing;
}
