import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry, RoomCapacityError, UnauthorizedReconnectError } from '../dist/room-state.js';

test('room-state: explicit creation and join and returns existing peers only', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('demo');
  const first = rooms.join('demo', 'host');
  const second = rooms.join('demo', 'viewer');

  assert.deepEqual(first, []);
  assert.deepEqual(second, ['host']);
  assert.deepEqual(rooms.peers('demo'), ['host', 'viewer']);
});

test('room-state: leave removes participant and deletes an empty room', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('demo');
  rooms.join('demo', 'host');
  rooms.join('demo', 'viewer');

  assert.deepEqual(rooms.leave('demo', 'host'), ['viewer']);
  assert.deepEqual(rooms.peers('demo'), ['viewer']);
  assert.deepEqual(rooms.leave('demo', 'viewer'), []);
  assert.equal(rooms.has('demo'), false);
});

test('room-state: room and peer identifiers are normalized and invalid values rejected', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('launch-2026');
  rooms.createRoom('demo');
  assert.deepEqual(rooms.join('  Launch-2026 ', ' host_1 '), []);
  assert.deepEqual(rooms.peers('launch-2026'), ['host_1']);
  assert.throws(() => rooms.join('', 'host'), /sala/i);
  assert.throws(() => rooms.join('demo', '??'), /participante/i);
});

test('room-state: stores and sanitizes participant nicknames', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('demo');
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
  rooms.createRoom('demo');
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

test('room-state: enforces default capacity of 10 and configurable limit', () => {
  const defaultRooms = new RoomRegistry();
  assert.equal(defaultRooms.maxParticipants, 10);

  const customRooms = new RoomRegistry(3);
  customRooms.createRoom('small-room');
  assert.equal(customRooms.maxParticipants, 3);

  // Fill custom room to 3 participants
  customRooms.join('small-room', 'p1');
  customRooms.join('small-room', 'p2');
  customRooms.join('small-room', 'p3');

  assert.equal(customRooms.count('small-room'), 3);
  assert.equal(customRooms.isFull('small-room'), true);
  assert.equal(customRooms.hasPeer('small-room', 'p1'), true);
  assert.equal(customRooms.hasPeer('small-room', 'p4'), false);

  // 4th participant rejected with RoomCapacityError
  assert.throws(
    () => customRooms.join('small-room', 'p4'),
    (err) => err instanceof RoomCapacityError && err.maxCapacity === 3
  );

  // Existing participant re-joining is allowed and does NOT throw
  customRooms.join('small-room', 'p2', undefined, customRooms.getReconnectToken('small-room', 'p2'));
  assert.equal(customRooms.count('small-room'), 3);

  // Leaving frees slot immediately
  customRooms.leave('small-room', 'p3');
  assert.equal(customRooms.count('small-room'), 2);
  assert.equal(customRooms.isFull('small-room'), false);

  // Now p4 can join
  customRooms.join('small-room', 'p4');
  assert.equal(customRooms.count('small-room'), 3);
  assert.equal(customRooms.isFull('small-room'), true);
});

test('room-state: preserves existing nickname upon reconnect when nickname is omitted', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('room-a');
  rooms.join('room-a', 'peer-1', 'OriginalName');
  assert.equal(rooms.getNickname('room-a', 'peer-1'), 'OriginalName');

  // Reconnect with same peerId without providing nickname
  rooms.join('room-a', 'peer-1', undefined, rooms.getReconnectToken('room-a', 'peer-1'));
  assert.equal(rooms.getNickname('room-a', 'peer-1'), 'OriginalName');

  // Reconnect providing new nickname updates it
  rooms.join('room-a', 'peer-1', 'NewName', rooms.getReconnectToken('room-a', 'peer-1'));
  assert.equal(rooms.getNickname('room-a', 'peer-1'), 'NewName');
});

test('room-state: generates and manages ephemeral session reconnectToken', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('room-sec');
  rooms.join('room-sec', 'alice', 'Alice');

  const token = rooms.getReconnectToken('room-sec', 'alice');
  assert.ok(typeof token === 'string' && token.length >= 16, 'Token must be generated and sufficiently long');
  assert.equal(rooms.validateReconnectToken('room-sec', 'alice', token), true);
  assert.equal(rooms.validateReconnectToken('room-sec', 'alice', 'wrong-token'), false);
  assert.equal(rooms.validateReconnectToken('room-sec', 'alice', ''), false);

  // Reconnect with valid token succeeds
  assert.doesNotThrow(() => {
    rooms.join('room-sec', 'alice', 'Alice 2', token);
  });
  assert.equal(rooms.getReconnectToken('room-sec', 'alice'), token);

  // Reconnect with invalid token throws UnauthorizedReconnectError
  assert.throws(
    () => rooms.join('room-sec', 'alice', 'Alice Imposter', 'fake-token'),
    UnauthorizedReconnectError
  );

  // Leaving destroys the token immediately
  rooms.leave('room-sec', 'alice');
  assert.equal(rooms.getReconnectToken('room-sec', 'alice'), undefined);
  assert.equal(rooms.validateReconnectToken('room-sec', 'alice', token), false);
});

test('room-state: manages ephemeral recovery reservations on involuntary leave', async () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('room-rec');
  rooms.join('room-rec', 'alice', 'Alice Original');
  const token = rooms.getReconnectToken('room-rec', 'alice');
  assert.ok(token);

  // Involuntary leave (isVoluntary = false, graceMs = 100ms)
  rooms.leave('room-rec', 'alice', false, 100);

  // Alice is not an active peer, but has an active recovery reservation
  assert.equal(rooms.hasPeer('room-rec', 'alice'), false);
  assert.equal(rooms.hasRecoveryReservation('room-rec', 'alice'), true);
  assert.equal(rooms.getReservedReconnectToken('room-rec', 'alice'), token);

  // Imposter joins without token -> throws UnauthorizedReconnectError
  assert.throws(
    () => rooms.join('room-rec', 'alice', 'Imposter'),
    UnauthorizedReconnectError
  );

  // Imposter joins with wrong token -> throws UnauthorizedReconnectError
  assert.throws(
    () => rooms.join('room-rec', 'alice', 'Imposter', 'wrong-token'),
    UnauthorizedReconnectError
  );

  // Alice recovers with valid token -> restores session and original nickname
  assert.doesNotThrow(() => {
    rooms.join('room-rec', 'alice', undefined, token);
  });
  assert.equal(rooms.hasPeer('room-rec', 'alice'), true);
  assert.equal(rooms.getNickname('room-rec', 'alice'), 'Alice Original');
  assert.equal(rooms.hasRecoveryReservation('room-rec', 'alice'), false);

  // Another involuntary leave, this time letting it expire
  rooms.leave('room-rec', 'alice', false, 50);
  assert.equal(rooms.hasRecoveryReservation('room-rec', 'alice'), true);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(rooms.hasRecoveryReservation('room-rec', 'alice'), false);
  assert.equal(rooms.has('room-rec'), false, 'Empty room with expired reservations is removed');
});

test('room-state: Policy A enforces occupiedSlots and blocks new peers during ephemeral recovery reservation', async () => {
  const rooms = new RoomRegistry(2);
  rooms.createRoom('room-a');
  rooms.join('room-a', 'p1');
  rooms.join('room-a', 'p2');
  const p2Token = rooms.getReconnectToken('room-a', 'p2');

  assert.equal(rooms.count('room-a'), 2);
  assert.equal(rooms.reservationCount('room-a'), 0);
  assert.equal(rooms.occupiedSlots('room-a'), 2);
  assert.equal(rooms.isFull('room-a'), true);

  // Involuntary leave of p2 with 100ms grace period
  rooms.leave('room-a', 'p2', false, 100);

  // Active count drops to 1, but reservation is 1, so occupiedSlots remains 2
  assert.equal(rooms.count('room-a'), 1);
  assert.equal(rooms.reservationCount('room-a'), 1);
  assert.equal(rooms.occupiedSlots('room-a'), 2);
  assert.equal(rooms.isFull('room-a'), true);

  // New peer p3 cannot join (RoomCapacityError)
  assert.throws(
    () => rooms.join('room-a', 'p3'),
    (err) => err instanceof RoomCapacityError && err.maxCapacity === 2
  );

  // p2 recovers with valid reconnectToken
  rooms.join('room-a', 'p2', undefined, p2Token);
  assert.equal(rooms.count('room-a'), 2);
  assert.equal(rooms.reservationCount('room-a'), 0);
  assert.equal(rooms.occupiedSlots('room-a'), 2);

  // Voluntary leave immediately frees slot
  rooms.leave('room-a', 'p2', true);
  assert.equal(rooms.count('room-a'), 1);
  assert.equal(rooms.reservationCount('room-a'), 0);
  assert.equal(rooms.occupiedSlots('room-a'), 1);
  assert.equal(rooms.isFull('room-a'), false);

  // Now p3 can join
  assert.doesNotThrow(() => {
    rooms.join('room-a', 'p3');
  });
  assert.equal(rooms.count('room-a'), 2);
});

test('room-state: paused metadata survives late join independently of other presenters', () => {
  const rooms = new RoomRegistry();
  rooms.createRoom('pause');
  rooms.join('pause', 'host');
  rooms.join('pause', 'other');
  const paused = { active: true, paused: true, streamId: 'one', hasAudio: true, audioMuted: true };
  const live = { active: true, paused: false, streamId: 'two', hasAudio: false, audioMuted: false };
  rooms.updateSharing('pause', 'host', paused);
  rooms.updateSharing('pause', 'other', live);
  rooms.join('pause', 'late');
  const participants = rooms.getParticipants('pause');
  assert.deepEqual(participants.find(p => p.peerId === 'host').sharing, paused);
  assert.deepEqual(participants.find(p => p.peerId === 'other').sharing, live);
});
