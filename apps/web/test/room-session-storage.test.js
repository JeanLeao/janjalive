import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoomSession, saveRoomSession, clearRoomSession } from '../src/features/room/signaling/room-session-storage.ts';

test('room-session-storage: saves and reads ephemeral roomKey alongside host credentials', () => {
  const mockStorage = new Map();
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };

  try {
    const roomId = 'test-room-f12';
    assert.deepEqual(readRoomSession(roomId), {});

    saveRoomSession(roomId, {
      hostCredential: 'host-secret-123',
      peerId: 'peer-abc',
      reconnectToken: 'token-xyz',
      roomKey: 'access-key-f12',
    });

    const read = readRoomSession(roomId);
    assert.equal(read.hostCredential, 'host-secret-123');
    assert.equal(read.peerId, 'peer-abc');
    assert.equal(read.reconnectToken, 'token-xyz');
    assert.equal(read.roomKey, 'access-key-f12');

    clearRoomSession(roomId);
    assert.deepEqual(readRoomSession(roomId), {});
  } finally {
    globalThis.sessionStorage = originalSessionStorage;
  }
});
