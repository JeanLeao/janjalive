import { normalizeRoom, normalizePeer, type ParticipantInfo } from '@screen-room/protocol';

export interface ParticipantMeta {
  nickname?: string;
}

export class RoomRegistry {
  #rooms = new Map<string, Map<string, ParticipantMeta>>();

  join(roomId: unknown, peerId: unknown, nickname?: unknown): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    let participants = this.#rooms.get(room);
    if (!participants) {
      participants = new Map();
      this.#rooms.set(room, participants);
    }
    const existingPeers = Array.from(participants.keys());
    const cleanNickname =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim().slice(0, 32)
        : undefined;
    participants.set(peer, { nickname: cleanNickname });
    return existingPeers;
  }

  leave(roomId: unknown, peerId: unknown): string[] {
    const room = normalizeRoom(roomId);
    const peer = normalizePeer(peerId);
    const participants = this.#rooms.get(room);
    if (!participants) return [];
    participants.delete(peer);
    const remaining = Array.from(participants.keys());
    if (participants.size === 0) this.#rooms.delete(room);
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
      ...(meta.nickname ? { nickname: meta.nickname } : {}),
    }));
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
}
