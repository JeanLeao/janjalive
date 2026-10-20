// Credentials stay in this tab, isolated by room; invitations contain only roomId.
export interface StoredRoomSession { hostCredential?: string; peerId?: string; reconnectToken?: string }
const key = (roomId: string) => `screen_room_session:${roomId}`;
export function readRoomSession(roomId: string): StoredRoomSession {
  try { return JSON.parse(sessionStorage.getItem(key(roomId)) || '{}'); } catch { return {}; }
}
export function saveRoomSession(roomId: string, value: StoredRoomSession): void {
  sessionStorage.setItem(key(roomId), JSON.stringify(value));
}
export function clearRoomSession(roomId: string): void {
  try { sessionStorage.removeItem(key(roomId)); } catch { /* unavailable storage */ }
}
