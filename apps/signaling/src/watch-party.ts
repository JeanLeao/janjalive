import type { FileOperation, WatchOperation, WatchSnapshot, WatchAvailability, WatchReadinessEvent } from '@screen-room/protocol';

/** One authoritative, ephemeral playback timeline per room. Socket identity is supplied by the caller. */
export class WatchParties {
  private rooms = new Map<string, WatchSnapshot>();
  private availability = new Map<string, Map<string, WatchAvailability>>();
  constructor(private publish: (snapshot: WatchSnapshot) => void, private publishReadiness: (event: WatchReadinessEvent) => void = () => {}) {}
  readiness(roomId: string, peerId: string, sessionId: string, status: WatchAvailability) {
    if (this.rooms.get(roomId)?.state?.sessionId !== sessionId) return;
    let members = this.availability.get(roomId);
    if (!members) { members = new Map(); this.availability.set(roomId, members); }
    if (members.get(peerId) === status) return;
    members.set(peerId, status);
    this.publishReadiness({ type: 'watch-readiness-updated', roomId, sessionId, peerId, status });
  }
  snapshot(roomId: string): WatchSnapshot {
    return { ...(this.rooms.get(roomId) ?? { type: 'watch-snapshot', roomId, revision: 0, state: null }), serverTime: Date.now(), availability: [...this.availability.get(roomId) ?? []].map(([peerId, status]) => ({ peerId, status })) };
  }
  apply(roomId: string, peerId: string, op: WatchOperation): string | null {
    const snapshot = this.snapshot(roomId);
    const state = snapshot.state;
    if (op.revision !== snapshot.revision) return 'Estado desatualizado. Tente novamente.';
    if (op.action === 'create') {
      if (state) return 'Já existe uma Watch Party nesta sala.';
      if (!op.file || !op.duration || !op.file.size || !['video/mp4', 'video/webm'].includes(op.file.mime)) return 'Vídeo inválido.';
      this.availability.delete(roomId);
      snapshot.state = { sessionId: op.sessionId, controllerId: peerId, file: op.file, duration: op.duration,
        position: 0, playing: false, referenceTime: snapshot.serverTime };
    } else {
      if (!state || state.sessionId !== op.sessionId || state.controllerId !== peerId) return 'Sessão encerrada ou controle não autorizado.';
      if (op.action === 'end') { snapshot.state = null; this.availability.delete(roomId); }
      else {
        const position = op.action === 'seek' ? op.position : state.position + (state.playing ? (snapshot.serverTime - state.referenceTime) / 1000 : 0);
        if (position === undefined || position > state.duration && op.action === 'seek') return 'Posição inválida.';
        state.position = Math.min(state.duration, position);
        state.playing = op.action === 'play' ? state.position < state.duration : op.action === 'pause' ? false : state.playing;
        state.referenceTime = snapshot.serverTime;
      }
    }
    snapshot.revision++;
    this.rooms.set(roomId, { type: snapshot.type, roomId, state: snapshot.state, revision: snapshot.revision, serverTime: snapshot.serverTime }); this.publish(this.snapshot(roomId)); return null;
  }
  authorizeFile(roomId: string, peerId: string, op: FileOperation): boolean {
    if (op.type !== 'file-request' || !op.watchSessionId) return true;
    const state = this.rooms.get(roomId)?.state;
    return !!state && state.controllerId === peerId && state.sessionId === op.watchSessionId &&
      state.file.name === op.file.name && state.file.mime === op.file.mime && state.file.size === op.file.size && state.file.sha256 === op.file.sha256;
  }
  depart(roomId: string, peerId: string) {
    const snapshot = this.rooms.get(roomId);
    if (snapshot?.state?.controllerId === peerId) {
      snapshot.state = null; this.availability.delete(roomId); snapshot.revision++; this.publish(this.snapshot(roomId));
    } else if (snapshot?.state) {
      this.readiness(roomId, peerId, snapshot.state.sessionId, 'unavailable');
      this.availability.get(roomId)?.delete(peerId);
    }
  }
  delete(roomId: string) { this.rooms.delete(roomId); this.availability.delete(roomId); }
  dispose() { this.rooms.clear(); this.availability.clear(); }
}
