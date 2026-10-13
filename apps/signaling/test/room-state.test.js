import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry } from '../dist/room-state.js';

test('room-state: join creates a room and returns existing peers only', () => {
  const rooms = new RoomRegistry();
  const first = rooms.join('demo', 'host');
  const second = rooms.join('demo', 'viewer');

  assert.deepEqual(first, []);
  assert.deepEqual(second, ['host']);
  assert.deepEqual(rooms.peers('demo'), ['host', 'viewer']);
});

test('room-state: leave removes participant and deletes an empty room', () => {
  const rooms = new RoomRegistry();
  rooms.join('demo', 'host');
  rooms.join('demo', 'viewer');

  assert.deepEqual(rooms.leave('demo', 'host'), ['viewer']);
  assert.deepEqual(rooms.peers('demo'), ['viewer']);
  assert.deepEqual(rooms.leave('demo', 'viewer'), []);
  assert.equal(rooms.has('demo'), false);
});

test('room-state: room and peer identifiers are normalized and invalid values rejected', () => {
  const rooms = new RoomRegistry();
  assert.deepEqual(rooms.join('  Launch-2026 ', ' host_1 '), []);
  assert.deepEqual(rooms.peers('launch-2026'), ['host_1']);
  assert.throws(() => rooms.join('', 'host'), /sala/i);
  assert.throws(() => rooms.join('demo', '??'), /participante/i);
});

test('room-state: stores and sanitizes participant nicknames', () => {
  const rooms = new RoomRegistry();
  rooms.join('demo', 'host', '  Aldo  ');
  rooms.join('demo', 'viewer');

  assert.equal(rooms.getNickname('demo', 'host'), 'Aldo');
  assert.equal(rooms.getNickname('demo', 'viewer'), undefined);
  assert.deepEqual(rooms.getParticipants('demo'), [
    { peerId: 'host', nickname: 'Aldo' },
    { peerId: 'viewer' },
  ]);
});

test('room-state: updates, sanitizes, removes nicknames and prevents redundant updates', () => {
  const rooms = new RoomRegistry();
  rooms.join('demo', 'host', 'Aldo');
  rooms.join('demo', 'viewer');

  // Update with new valid name
  const r1 = rooms.updateNickname('demo', 'host', '  Aldo Migge  ');
  assert.equal(r1.changed, true);
  assert.equal(r1.nickname, 'Aldo Migge');
  assert.equal(rooms.getNickname('demo', 'host'), 'Aldo Migge');

  // Redundant update with same name
  const r2 = rooms.updateNickname('demo', 'host', 'Aldo Migge');
  assert.equal(r2.changed, false);
  assert.equal(r2.nickname, 'Aldo Migge');

  // Truncation to 32 chars
  const longName = 'x'.repeat(40);
  const r3 = rooms.updateNickname('demo', 'host', longName);
  assert.equal(r3.changed, true);
  assert.equal(r3.nickname.length, 32);

  // Remove nickname with empty string
  const r4 = rooms.updateNickname('demo', 'host', '');
  assert.equal(r4.changed, true);
  assert.equal(r4.nickname, undefined);
  assert.equal(rooms.getNickname('demo', 'host'), undefined);

  // Redundant removal
  const r5 = rooms.updateNickname('demo', 'host', '   ');
  assert.equal(r5.changed, false);
  assert.equal(r5.nickname, undefined);

  // Update non-existent peer
  const r6 = rooms.updateNickname('demo', 'nonexistent', 'Name');
  assert.equal(r6.changed, false);
});
