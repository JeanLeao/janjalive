import { normalizeRoom, normalizePeer, type SharingState, type ParticipantInfo } from '@screen-room/protocol';
import * as crypto from 'node:crypto';

export interface InteractionBudget { chat: number[]; reaction: number[]; ids: string[] }

export interface ParticipantMeta {
  interactions?: InteractionBudget;
  sharing?: SharingState;
  nickname?: string;
  reconnectToken: string;
}

export interface RecoveryReservation {
  interactions?: InteractionBudget;
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

    participants.set(peer, { interactions: existingMeta?.interactions ?? reservation?.interactions, nickname: cleanNickname, reconnectToken: token, ...(existingMeta?.sharing ? { sharing: existingMeta.sharing } : {}) });
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

  updateSharing(roomId: string, peerId: string, sharing: SharingState): void {
    const meta = this.#rooms.get(roomId)?.get(peerId);
    if (meta) meta.sharing = sharing;
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
