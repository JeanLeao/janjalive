export const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PEER_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidRoom(roomId: unknown): boolean {
  if (typeof roomId !== 'string' && typeof roomId !== 'number') return false;
  const normalized = String(roomId).trim().toLowerCase();
  return ROOM_PATTERN.test(normalized);
}

export function isValidPeer(peerId: unknown): boolean {
  if (typeof peerId !== 'string' && typeof peerId !== 'number') return false;
  const normalized = String(peerId).trim();
  return PEER_PATTERN.test(normalized);
}

export function normalizeRoom(roomId: unknown): string {
  const normalized = String(roomId ?? '').trim().toLowerCase();
  if (!ROOM_PATTERN.test(normalized)) {
    throw new Error('Identificador de sala inválido. Use letras, números e hífens.');
  }
  return normalized;
}

export function normalizePeer(peerId: unknown): string {
  const normalized = String(peerId ?? '').trim();
  if (!PEER_PATTERN.test(normalized)) {
    throw new Error('Identificador de participante inválido.');
  }
  return normalized;
}

export function generateSecureRoomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Ambiente sem suporte a CSPRNG seguro para gerar ID de sala.');
}
