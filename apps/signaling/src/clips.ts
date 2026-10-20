import { CLIP_LIMITS, type ClipOperation, type ClipsSnapshot, type SharingState } from '@screen-room/protocol';

type Permission = ClipsSnapshot['permissions'][number];
type Recording = ClipsSnapshot['recordings'][number] & { active: boolean; timer: ReturnType<typeof setTimeout> };
type State = { revision: number; permissions: Map<string, Permission>; recordings: Map<string, Recording> };

/** Room-scoped metadata only. Pending grants never enter public recording snapshots. */
export class Clips {
  private rooms = new Map<string, State>();
  constructor(private publish: (snapshot: ClipsSnapshot) => void) {}
  snapshot(roomId: string): ClipsSnapshot {
    const state = this.rooms.get(roomId);
    return { type: 'clips-snapshot', roomId, revision: state?.revision ?? 0,
      permissions: [...state?.permissions.values() ?? []],
      recordings: [...state?.recordings.values() ?? []].filter(r => r.active).map(({ active, timer, ...r }) => r) };
  }
  private state(roomId: string) {
    let state = this.rooms.get(roomId);
    if (!state) { state = { revision: 0, permissions: new Map(), recordings: new Map() }; this.rooms.set(roomId, state); }
    return state;
  }
  private changed(roomId: string) { this.state(roomId).revision++; this.publish(this.snapshot(roomId)); }
  private remove(roomId: string, recorderId: string) {
    const state = this.rooms.get(roomId);
    const recording = state?.recordings.get(recorderId);
    if (!recording) return;
    clearTimeout(recording.timer); state!.recordings.delete(recorderId); this.changed(roomId);
  }
  sharing(roomId: string, presenterId: string, sharing: SharingState) {
    const state = this.state(roomId);
    const previous = state.permissions.get(presenterId);
    if (!sharing.active || !sharing.streamId) {
      state.permissions.delete(presenterId);
    } else if (!previous || previous.streamId !== sharing.streamId) {
      state.permissions.set(presenterId, { presenterId, streamId: sharing.streamId, allowed: false, version: state.revision + 1 });
    }
    for (const [id, r] of state.recordings) {
      if (r.presenterId === presenterId && (!sharing.active || sharing.paused || r.streamId !== sharing.streamId)) this.remove(roomId, id);
    }
    this.changed(roomId);
  }
  apply(roomId: string, peerId: string, op: ClipOperation, sharing?: SharingState): string | null {
    const state = this.state(roomId);
    const p = state.permissions.get(op.presenterId);
    if (op.action === 'stop') {
      const r = state.recordings.get(peerId);
      if (!r || r.recordingId !== op.recordingId) return 'Gravação já encerrada.';
      this.remove(roomId, peerId); return null;
    }
    if (!p || p.streamId !== op.streamId || !sharing?.active || sharing.streamId !== op.streamId) return 'Transmissão indisponível.';
    if (op.action === 'permission') {
      if (peerId !== op.presenterId || typeof op.allowed !== 'boolean' || op.version !== p.version) return 'Permissão inválida ou desatualizada.';
      p.allowed = op.allowed; p.version = state.revision + 1;
      if (!p.allowed) for (const [id, r] of state.recordings) if (r.presenterId === peerId && id !== peerId) this.remove(roomId, id);
      this.changed(roomId); return null;
    }
    if (sharing.paused) return 'Transmissão pausada.';
    if (peerId !== op.presenterId && (op.version !== p.version || !p.allowed)) return 'O apresentador não autorizou esta gravação.';
    if (op.action === 'request') {
      if (state.recordings.has(peerId)) return 'Você já tem uma gravação pendente ou ativa.';
      state.recordings.set(peerId, { recordingId: op.recordingId, recorderId: peerId, presenterId: op.presenterId,
        streamId: op.streamId, startedAt: 0, active: false,
        timer: setTimeout(() => this.remove(roomId, peerId), CLIP_LIMITS.pendingMs) });
      return null;
    }
    const r = state.recordings.get(peerId);
    if (!r || r.active || r.recordingId !== op.recordingId || r.streamId !== op.streamId || r.presenterId !== op.presenterId) return 'Autorização expirada.';
    clearTimeout(r.timer); r.active = true; r.startedAt = Date.now();
    r.timer = setTimeout(() => this.remove(roomId, peerId), CLIP_LIMITS.durationMs);
    this.changed(roomId); return null;
  }
  depart(roomId: string, peerId: string) {
    const state = this.rooms.get(roomId);
    if (!state) return;
    state.permissions.delete(peerId);
    for (const [id, r] of state.recordings) if (id === peerId || r.presenterId === peerId) this.remove(roomId, id);
    this.changed(roomId);
  }
  delete(roomId: string) {
    for (const r of this.rooms.get(roomId)?.recordings.values() ?? []) clearTimeout(r.timer);
    this.rooms.delete(roomId);
  }
  dispose() { for (const room of this.rooms.keys()) this.delete(room); }
}
