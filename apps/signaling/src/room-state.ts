import {
  normalizeRoom, normalizePeer, type SharingState, type ParticipantInfo,
  type PresenterCollaborationMessage, type PointMessage, type SpectatorDrawingMessage,
  type ClearCollaborativeDrawingsMessage, COLLABORATION_LIMITS,
  type StageIndication, STAGE_INDICATION_LIMITS,
} from '@screen-room/protocol';
import * as crypto from 'node:crypto';

export interface InteractionBudget { chat: number[]; reaction: number[]; ids: string[] }

export interface PointingSenderBudget {
  seq: number;
  times: number[];
  ids: string[];
}

export interface SpectatorDrawingSenderBudget {
  seq: number;
  times: number[];
  ids: string[];
}

export interface ParticipantMeta {
  interactions?: InteractionBudget;
  collaboration?: {
    streamId: string;
    seq: number;
    laser: number[];
    drawing: number[];
    clear: number[];
    clearCollaborative?: number[];
    clearCollaborativeSeq?: number;
    pointingBySender?: Map<string, PointingSenderBudget>;
    drawingBySender?: Map<string, SpectatorDrawingSenderBudget>;
    aggregateDrawingTimes?: number[];
  };
  sharing?: SharingState;
  nickname?: string;
  reconnectToken: string;
  /** F29: ephemeral stage indication; `indicationSeq` only grows so stale updates stay detectable. */
  indication?: StageIndication;
  indicationSeq?: number;
  indicationTimes?: number[];
}

export interface RecoveryReservation {
  interactions?: InteractionBudget;
  sharing?: SharingState;
  indication?: StageIndication;
  indicationSeq?: number;
  reconnectToken: string;
  nickname?: string;
  timer: NodeJS.Timeout;
  expiresAt: number;
}

export class RoomCapacityError extends Error {
  readonly maxCapacity: number;
  constructor(maxCapacity: number) {
    super(`Sala cheia: capacidade máxima de ${maxCapacity} participantes atingida.`);
    this.name = 'RoomCapacityError';
    this.maxCapacity = maxCapacity;
  }
}

export class UnauthorizedReconnectError extends Error {
  constructor(message = 'Sessão ativa detectada para este peer. Credencial de reconexão inválida ou ausente.') {
    super(message);
    this.name = 'UnauthorizedReconnectError';
  }
}

export class RoomRegistry {
  static readonly DEFAULT_RECOVERY_GRACE_MS = 30000;
  #rooms = new Map<string, Map<string, ParticipantMeta>>();
  #recoveryReservations = new Map<string, RecoveryReservation>();
  readonly maxParticipants: number;

  constructor(maxParticipants = 10) {
    const parsed = Number(maxParticipants);
    this.maxParticipants = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
  }

  join(roomId: unknown, peerId: unknown, nickname?: unknown, reconnectToken?: unknown): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    let participants = this.#rooms.get(room);
    if (!participants) {
      participants = new Map();
      this.#rooms.set(room, participants);
    }

    const existingMeta = participants.get(peer);
    const reservation = this.getRecoveryReservation(room, peer);

    if (existingMeta) {
      if (reconnectToken !== undefined) {
        const provided = typeof reconnectToken === 'string' ? reconnectToken.trim() : '';
        if (!provided || provided !== existingMeta.reconnectToken) {
          throw new UnauthorizedReconnectError(
            'Sessão ativa detectada para este peer. Credencial de reconexão inválida ou ausente.'
          );
        }
      }
    } else if (reservation) {
      const provided = typeof reconnectToken === 'string' ? reconnectToken.trim() : '';
      if (!provided || provided !== reservation.reconnectToken) {
        throw new UnauthorizedReconnectError(
          'Identidade em período de recuperação efêmera. Credencial de reconexão inválida ou ausente.'
        );
      }
      this.clearRecovery(room, peer);
    } else {
      if (this.occupiedSlots(room) >= this.maxParticipants) {
        throw new RoomCapacityError(this.maxParticipants);
      }
    }

    const existingPeers = Array.from(participants.keys()).filter((p) => p !== peer);

    const cleanNickname =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim().slice(0, 32)
        : existingMeta?.nickname ?? reservation?.nickname;

    const token =
      existingMeta?.reconnectToken ??
      reservation?.reconnectToken ??
      (typeof reconnectToken === 'string' && reconnectToken.trim()
        ? reconnectToken.trim()
        : crypto.randomUUID());

    const preservedSharing = existingMeta?.sharing ?? reservation?.sharing;
    participants.set(peer, {
      interactions: existingMeta?.interactions ?? reservation?.interactions,
      nickname: cleanNickname,
      reconnectToken: token,
      ...(preservedSharing ? { sharing: preservedSharing } : {}),
      ...(existingMeta?.collaboration ? { collaboration: existingMeta.collaboration } : {}),
      ...((existingMeta?.indication ?? reservation?.indication) ? { indication: existingMeta?.indication ?? reservation?.indication } : {}),
      ...((existingMeta?.indicationSeq ?? reservation?.indicationSeq) !== undefined ? { indicationSeq: existingMeta?.indicationSeq ?? reservation?.indicationSeq } : {}),
    });
    const restored = participants.get(peer)!;
    if (restored.indication && !this.#validIndication(participants, restored)) restored.indication = undefined;
    return existingPeers;
  }

  leave(
    roomId: unknown,
    peerId: unknown,
    isVoluntary = true,
    graceMs = RoomRegistry.DEFAULT_RECOVERY_GRACE_MS
  ): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const reservationKey = `${room}:${peer}`;
    const participants = this.#rooms.get(room);
    if (!participants) return [];

    const existingMeta = participants.get(peer);
    participants.delete(peer);

    if (isVoluntary) {
      this.clearRecovery(room, peer);
      if (participants.size === 0 && !this.hasAnyRecoveryForRoom(room)) {
        this.#rooms.delete(room);
      }
    } else if (existingMeta) {
      this.clearRecovery(room, peer);
      const timer = setTimeout(() => {
        this.clearRecovery(room, peer);
        const currentParticipants = this.#rooms.get(room);
        if ((!currentParticipants || currentParticipants.size === 0) && !this.hasAnyRecoveryForRoom(room)) {
          this.#rooms.delete(room);
        }
      }, graceMs);

      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.#recoveryReservations.set(reservationKey, {
        reconnectToken: existingMeta.reconnectToken,
        nickname: existingMeta.nickname,
        interactions: existingMeta.interactions,
        sharing: existingMeta.sharing,
        indication: existingMeta.indication,
        indicationSeq: existingMeta.indicationSeq,
        timer,
        expiresAt: Date.now() + graceMs,
      });
    }

    const remaining = Array.from(participants.keys());
    return remaining;
  }

  peers(roomId: unknown): string[] {
    const room = normalizeRoom(roomId);
    return Array.from(this.#rooms.get(room)?.keys() ?? []);
  }

  getParticipants(roomId: unknown): ParticipantInfo[] {
    const room = normalizeRoom(roomId);
    const participants = this.#rooms.get(room);
    if (!participants) return [];
    return Array.from(participants.entries()).map(([peerId, meta]) => ({
      peerId,
      ...(meta.sharing ? { sharing: meta.sharing } : {}),
      ...(meta.indication && this.#validIndication(participants, meta) ? { indication: meta.indication } : {}),
      ...(meta.nickname ? { nickname: meta.nickname } : {}),
    }));
  }

  #validIndication(participants: Map<string, ParticipantMeta>, presenter: ParticipantMeta): boolean {
    const indication = presenter.indication;
    return Boolean(indication && presenter.sharing?.active && participants.get(indication.targetPeerId)?.sharing?.active);
  }

  /** The valid indication currently held by a connected presenter, if any. */
  getIndication(roomId: unknown, peerId: unknown): StageIndication | undefined {
    const participants = this.#rooms.get(normalizeRoom(roomId));
    const meta = participants?.get(normalizePeer(peerId));
    return participants && meta?.indication && this.#validIndication(participants, meta) ? meta.indication : undefined;
  }

  /**
   * F29: the sender (actively sharing) points followers at a currently shared stream of the room.
   * Identity comes from the authenticated socket, never from the payload.
   */
  indicateStage(roomId: string, senderPeerId: string, targetPeerId: string, now = Date.now()): StageIndication | undefined {
    const participants = this.#rooms.get(roomId);
    const meta = participants?.get(senderPeerId);
    if (!participants || !meta?.sharing?.active) return undefined;
    let target: string;
    try { target = normalizePeer(targetPeerId); } catch { return undefined; }
    if (!participants.get(target)?.sharing?.active) return undefined;
    meta.indicationTimes = (meta.indicationTimes ?? []).filter((time) => now - time < 1000);
    if (meta.indicationTimes.length >= STAGE_INDICATION_LIMITS.perSecond) return undefined;
    meta.indicationTimes.push(now);
    meta.indicationSeq = (meta.indicationSeq ?? 0) + 1;
    meta.indication = { targetPeerId: target, seq: meta.indicationSeq };
    return meta.indication;
  }

  /**
   * Drops indications that point at `peerId` (its stream ended or it left) and, when
   * `includeOwn` is set, the one it issued itself. Returns the cleared presenters with a fresh seq.
   * Also invalidates references maintained in ephemeral recovery reservations.
   */
  clearIndications(roomId: string, peerId: string, includeOwn: boolean): Array<{ presenterPeerId: string; seq: number }> {
    const cleared: Array<{ presenterPeerId: string; seq: number }> = [];
    for (const [presenterPeerId, meta] of this.#rooms.get(roomId) ?? []) {
      if (!meta.indication) continue;
      if (meta.indication.targetPeerId !== peerId && !(includeOwn && presenterPeerId === peerId)) continue;
      meta.indicationSeq = (meta.indicationSeq ?? 0) + 1;
      meta.indication = undefined;
      cleared.push({ presenterPeerId, seq: meta.indicationSeq });
    }
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (!key.startsWith(prefix)) continue;
      const reservedPeerId = key.slice(prefix.length);
      if (!res.indication) continue;
      if (res.indication.targetPeerId !== peerId && !(includeOwn && reservedPeerId === peerId)) continue;
      res.indicationSeq = (res.indicationSeq ?? 0) + 1;
      res.indication = undefined;
    }
    return cleared;
  }

  updateSharing(roomId: string, peerId: string, sharing: SharingState): SharingState | undefined {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) return undefined;
    const sameCapture = Boolean(sharing.active && sharing.streamId && sharing.streamId === meta.sharing?.streamId);
    if (!sameCapture) meta.collaboration = undefined;
    const resolvedPointing =
      sharing.pointingEnabled !== undefined
        ? sharing.pointingEnabled
        : sameCapture
        ? meta.sharing?.pointingEnabled
        : undefined;
    const resolvedDrawing =
      sharing.drawingEnabled !== undefined
        ? sharing.drawingEnabled
        : sameCapture
        ? meta.sharing?.drawingEnabled
        : undefined;
    const nextSharing: SharingState = sharing.active
      ? {
          ...sharing,
          ...(resolvedPointing !== undefined ? { pointingEnabled: resolvedPointing } : {}),
          ...(resolvedDrawing !== undefined ? { drawingEnabled: resolvedDrawing } : {}),
        }
      : { ...sharing, active: false };
    if (nextSharing.drawingEnabled === false && meta.collaboration) {
      meta.collaboration.drawingBySender?.clear();
      meta.collaboration.aggregateDrawingTimes = undefined;
    }
    meta.sharing = nextSharing;
    return nextSharing;
  }

  /** Operational counters only: never retain points, strokes or event payloads. */
  acceptCollaboration(roomId: string, peerId: string, event: PresenterCollaborationMessage, now = Date.now()): boolean {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta?.sharing?.active || meta.sharing.streamId !== event.streamId ||
        (meta.sharing.paused && event.type !== 'clear-annotations')) return false;
    const budget = meta.collaboration ||= { streamId: event.streamId, seq: 0, laser: [], drawing: [], clear: [] };
    if (event.seq <= budget.seq) return false;
    const kind = event.type === 'laser' ? 'laser' : event.type === 'drawing' ? 'drawing' : 'clear';
    const max = kind === 'laser' ? COLLABORATION_LIMITS.laserPerSecond : kind === 'drawing' ? COLLABORATION_LIMITS.drawingPerSecond : COLLABORATION_LIMITS.clearPerSecond;
    budget[kind] = budget[kind].filter(time => now - time < 1000);
    if (budget[kind].length >= max) return false;
    budget[kind].push(now);
    budget.seq = event.seq;
    return true;
  }

  /** Independent per-spectator validation and deduplication for quick pointing. */
  acceptPointing(roomId: string, senderPeerId: string, event: PointMessage, now = Date.now()): boolean {
    const participants = this.#rooms.get(roomId);
    if (!participants || !participants.has(senderPeerId)) return false;
    let targetPeer: string;
    try {
      targetPeer = normalizePeer(event.targetPeerId);
    } catch {
      return false;
    }
    if (targetPeer === senderPeerId) return false;
    const targetMeta = participants.get(targetPeer);
    if (
      !targetMeta?.sharing?.active ||
      targetMeta.sharing.paused ||
      targetMeta.sharing.streamId !== event.streamId ||
      targetMeta.sharing.pointingEnabled === false
    ) {
      return false;
    }
    const collab = (targetMeta.collaboration ||= {
      streamId: event.streamId,
      seq: 0,
      laser: [],
      drawing: [],
      clear: [],
    });
    const bySender = (collab.pointingBySender ||= new Map<string, PointingSenderBudget>());
    let senderBudget = bySender.get(senderPeerId);
    if (!senderBudget) {
      if (bySender.size >= this.maxParticipants * 2) {
        for (const [id] of bySender) {
          if (!participants.has(id)) bySender.delete(id);
        }
        if (bySender.size >= this.maxParticipants * 2) return false;
      }
      senderBudget = { seq: 0, times: [], ids: [] };
      bySender.set(senderPeerId, senderBudget);
    }
    if (event.seq <= senderBudget.seq || senderBudget.ids.includes(event.eventId)) return false;
    senderBudget.times = senderBudget.times.filter((time) => now - time < 1000);
    if (senderBudget.times.length >= COLLABORATION_LIMITS.pointPerSecond) return false;
    senderBudget.times.push(now);
    senderBudget.seq = event.seq;
    senderBudget.ids = [...senderBudget.ids.slice(-31), event.eventId];
    return true;
  }

  /** Authoritative validation, sequencing and rate limiting for spectator collaborative drawing. */
  acceptSpectatorDrawing(roomId: string, senderPeerId: string, event: SpectatorDrawingMessage, now = Date.now()): boolean {
    const participants = this.#rooms.get(roomId);
    if (!participants || !participants.has(senderPeerId)) return false;
    let targetPeer: string;
    try {
      targetPeer = normalizePeer(event.targetPeerId);
    } catch {
      return false;
    }
    if (targetPeer === senderPeerId) return false;
    const targetMeta = participants.get(targetPeer);
    if (
      !targetMeta?.sharing?.active ||
      targetMeta.sharing.paused ||
      targetMeta.sharing.streamId !== event.streamId ||
      targetMeta.sharing.drawingEnabled !== true
    ) {
      return false;
    }
    const collab = (targetMeta.collaboration ||= {
      streamId: event.streamId,
      seq: 0,
      laser: [],
      drawing: [],
      clear: [],
    });

    collab.aggregateDrawingTimes = (collab.aggregateDrawingTimes || []).filter((time) => now - time < 1000);
    if (collab.aggregateDrawingTimes.length >= COLLABORATION_LIMITS.aggregateCollaborativeDrawingPerSecond) {
      return false;
    }

    const bySender = (collab.drawingBySender ||= new Map<string, SpectatorDrawingSenderBudget>());
    let senderBudget = bySender.get(senderPeerId);
    if (!senderBudget) {
      const maxTracked = COLLABORATION_LIMITS.trackedDrawersPerCapture ?? (this.maxParticipants * 2);
      if (bySender.size >= maxTracked) {
        for (const [id] of bySender) {
          if (!participants.has(id)) bySender.delete(id);
        }
        if (bySender.size >= maxTracked) {
          const oldestKey = bySender.keys().next().value;
          if (oldestKey !== undefined) bySender.delete(oldestKey);
        }
      }
      senderBudget = { seq: 0, times: [], ids: [] };
      bySender.set(senderPeerId, senderBudget);
    }
    if (event.seq <= senderBudget.seq || senderBudget.ids.includes(event.eventId)) return false;
    senderBudget.times = senderBudget.times.filter((time) => now - time < 1000);
    if (senderBudget.times.length >= COLLABORATION_LIMITS.spectatorDrawingPerSecond) return false;

    senderBudget.times.push(now);
    collab.aggregateDrawingTimes.push(now);
    senderBudget.seq = event.seq;
    senderBudget.ids = [...senderBudget.ids.slice(-31), event.eventId];
    return true;
  }

  /** Presenter-exclusive clear of all spectator collaborative drawings on active capture. */
  acceptClearCollaborativeDrawings(roomId: string, presenterPeerId: string, event: ClearCollaborativeDrawingsMessage, now = Date.now()): boolean {
    const meta = this.#rooms.get(roomId)?.get(presenterPeerId);
    if (!meta?.sharing?.active || meta.sharing.streamId !== event.streamId) return false;
    const budget = (meta.collaboration ||= { streamId: event.streamId, seq: 0, laser: [], drawing: [], clear: [] });
    const clearSeq = budget.clearCollaborativeSeq ?? 0;
    if (event.seq <= clearSeq) return false;
    budget.clearCollaborative = (budget.clearCollaborative || []).filter((time) => now - time < 1000);
    if (budget.clearCollaborative.length >= COLLABORATION_LIMITS.clearPerSecond) return false;
    budget.clearCollaborative.push(now);
    budget.clearCollaborativeSeq = event.seq;
    budget.drawingBySender?.clear();
    budget.aggregateDrawingTimes = undefined;
    return true;
  }

  interactionBudget(roomId: string, peerId: string): InteractionBudget {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (!meta) throw new Error('Participante ausente.');
    return meta.interactions ||= { chat: [], reaction: [], ids: [] };
  }

  getNickname(roomId: unknown, peerId: unknown): string | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.get(peer)?.nickname;
  }

  updateNickname(
    roomId: unknown,
    peerId: unknown,
    nickname?: unknown
  ): { changed: boolean; nickname: string | undefined } {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    if (!participants || !participants.has(peer)) {
      return { changed: false, nickname: undefined };
    }
    const cleanNickname =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim().slice(0, 32)
        : undefined;
    const meta = participants.get(peer)!;
    if (meta.nickname === cleanNickname) {
      return { changed: false, nickname: cleanNickname };
    }
    meta.nickname = cleanNickname;
    return { changed: true, nickname: cleanNickname };
  }

  has(roomId: unknown): boolean {
    return this.#rooms.has(normalizeRoom(roomId));
  }

  hasPeer(roomId: unknown, peerId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.has(peer) ?? false;
  }

  /**
   * Returns the count of actively connected participants.
   * This is what is broadcasted to users in presence messages.
   */
  count(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    return this.#rooms.get(room)?.size ?? 0;
  }

  /**
   * Returns the number of valid ephemeral recovery reservations currently held for this room.
   */
  reservationCount(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    const now = Date.now();
    let count = 0;
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (key.startsWith(prefix)) {
        if (now > res.expiresAt) {
          clearTimeout(res.timer);
          this.#recoveryReservations.delete(key);
        } else {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Returns total committed slots in the room (active participants + active recovery reservations).
   * Policy A invariant: occupiedSlots(roomId) <= maxParticipants.
   */
  occupiedSlots(roomId: unknown): number {
    const room = normalizeRoom(roomId);
    const active = this.#rooms.get(room)?.size ?? 0;
    return active + this.reservationCount(room);
  }

  /**
   * Returns whether admission is full for new participants.
   * Considers both actively connected participants and ephemeral slot reservations (Policy A).
   */
  isFull(roomId: unknown): boolean {
    const room = normalizeRoom(roomId);
    return this.occupiedSlots(room) >= this.maxParticipants;
  }

  getReconnectToken(roomId: unknown, peerId: unknown): string | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    return this.#rooms.get(room)?.get(peer)?.reconnectToken;
  }

  hasRecoveryReservation(roomId: unknown, peerId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const res = this.#recoveryReservations.get(`${room}:${peer}`);
    if (!res) return false;
    if (Date.now() > res.expiresAt) {
      this.clearRecovery(room, peer);
      return false;
    }
    return true;
  }

  getRecoveryReservation(roomId: unknown, peerId: unknown): RecoveryReservation | undefined {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const res = this.#recoveryReservations.get(`${room}:${peer}`);
    if (!res) return undefined;
    if (Date.now() > res.expiresAt) {
      this.clearRecovery(room, peer);
      return undefined;
    }
    return res;
  }

  getReservedReconnectToken(roomId: unknown, peerId: unknown): string | undefined {
    return this.getRecoveryReservation(roomId, peerId)?.reconnectToken;
  }

  /**
   * Returns authoritative list of reserved peers and their remaining recovery grace in milliseconds.
   * Never exposes reconnect tokens or credentials.
   */
  getReservedPeers(roomId: unknown, now = Date.now()): Array<{ peerId: string; reconnectGraceMs: number }> {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    const result: Array<{ peerId: string; reconnectGraceMs: number }> = [];
    for (const [key, res] of this.#recoveryReservations.entries()) {
      if (key.startsWith(prefix)) {
        const remaining = res.expiresAt - now;
        if (remaining <= 0) {
          clearTimeout(res.timer);
          this.#recoveryReservations.delete(key);
        } else {
          const peerId = key.slice(prefix.length);
          result.push({ peerId, reconnectGraceMs: Math.max(1, Math.round(remaining)) });
        }
      }
    }
    return result;
  }

  clearRecovery(roomId: unknown, peerId: unknown): void {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const key = `${room}:${peer}`;
    const res = this.#recoveryReservations.get(key);
    if (res) {
      clearTimeout(res.timer);
      this.#recoveryReservations.delete(key);
    }
  }

  hasAnyRecoveryForRoom(roomId: unknown): boolean {
    const room = normalizeRoom(roomId);
    const prefix = `${room}:`;
    for (const key of this.#recoveryReservations.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  clearAllRecovery(): void {
    for (const res of this.#recoveryReservations.values()) {
      clearTimeout(res.timer);
    }
    this.#recoveryReservations.clear();
  }

  validateReconnectToken(roomId: unknown, peerId: unknown, token: unknown): boolean {
    if (typeof token !== 'string' || !token.trim()) return false;
    const cleanToken = token.trim();
    const active = this.getReconnectToken(roomId, peerId);
    if (active && active === cleanToken) return true;
    const reserved = this.getReservedReconnectToken(roomId, peerId);
    return Boolean(reserved && reserved === cleanToken);
  }
}
