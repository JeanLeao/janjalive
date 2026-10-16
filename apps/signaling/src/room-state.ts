import {
  normalizeRoom, normalizePeer, type SharingState, type ParticipantInfo,
  type PresenterCollaborationMessage, type PointMessage, COLLABORATION_LIMITS,
} from '@screen-room/protocol';
import * as crypto from 'node:crypto';

export interface InteractionBudget { chat: number[]; reaction: number[]; ids: string[] }

export interface PointingSenderBudget {
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
    pointingBySender?: Map<string, PointingSenderBudget>;
  };
  sharing?: SharingState;
  nickname?: string;
  reconnectToken: string;
}

export interface RecoveryReservation {
  interactions?: InteractionBudget;
  sharing?: SharingState;
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
    });
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
      ...(meta.nickname ? { nickname: meta.nickname } : {}),
    }));
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
    const nextSharing: SharingState = sharing.active
      ? {
          ...sharing,
          ...(resolvedPointing !== undefined ? { pointingEnabled: resolvedPointing } : {}),
        }
      : { ...sharing, active: false };
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
