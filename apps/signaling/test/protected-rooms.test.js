import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { RoomRegistry, RoomAdmissionError } from '../dist/room-state.js';
import { WS_CLOSE_CODES, isTerminalCloseCode } from '@screen-room/protocol';

async function setupServer(t, options = {}) {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', ...options });
  await app.ready;
  t.after(() => app.close());

  async function client(headers) {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`, { headers });
    const events = [];
    ws.on('message', raw => events.push(JSON.parse(raw.toString())));
    const closed = new Promise(resolve => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    t.after(() => ws.close());
    return {
      ws,
      events,
      closed,
      send: message => ws.send(JSON.stringify(message)),
      next: async (type, predicate = () => true) => {
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          const index = events.findIndex(e => e.type === type && predicate(e));
          if (index >= 0) return events.splice(index, 1)[0];
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        throw new Error(`Timeout waiting for event: ${type}`);
      },
    };
  }

  return { app, client };
}

test('F12 RoomRegistry: unit tests for public vs protected room lifecycle and verification', () => {
  const registry = new RoomRegistry(5);

  // 1. Public room
  const pub = registry.createRoom('public-room');
  assert.equal(pub.roomId, 'public-room');
  assert.ok(pub.hostCredential);
  assert.equal(pub.roomKey, undefined);
  assert.equal(registry.isProtected('public-room'), false);
  assert.equal(registry.roomState('public-room').isProtected, false);

  // Public room allows join without key
  registry.join('public-room', 'guest1');
  assert.equal(registry.peers('public-room').length, 1);

  // 2. Protected room
  const prot = registry.createRoom('prot-room', 60000, true);
  assert.equal(prot.roomId, 'prot-room');
  assert.ok(prot.hostCredential);
  assert.ok(prot.roomKey);
  // Entropy check: >= 96 bits. 16 bytes base64url is 22 chars (128 bits entropy)
  assert.ok(prot.roomKey.length >= 16);
  assert.equal(registry.isProtected('prot-room'), true);
  assert.equal(registry.roomState('prot-room').isProtected, true);

  // Key verification
  assert.equal(registry.verifyRoomKey('prot-room', prot.roomKey), true);
  assert.equal(registry.verifyRoomKey('prot-room', `  ${prot.roomKey}  `), true); // whitespace trimmed
  assert.equal(registry.verifyRoomKey('prot-room', 'wrong-key'), false);
  assert.equal(registry.verifyRoomKey('prot-room', ''), false);

  // Join without key throws KEY_REQUIRED
  assert.throws(
    () => registry.join('prot-room', 'guest2'),
    err => err instanceof RoomAdmissionError && err.code === 'KEY_REQUIRED'
  );

  // Join with invalid key throws KEY_INVALID
  assert.throws(
    () => registry.join('prot-room', 'guest2', undefined, undefined, undefined, 'invalid-key'),
    err => err instanceof RoomAdmissionError && err.code === 'KEY_INVALID'
  );

  // Join with valid key succeeds
  registry.join('prot-room', 'guest2', undefined, undefined, undefined, prot.roomKey);
  assert.equal(registry.peers('prot-room').length, 1);

  // Creator can join with hostCredential without key
  registry.join('prot-room', 'creator', undefined, undefined, prot.hostCredential);
  assert.equal(registry.peers('prot-room').length, 2);

  // Voluntary exit requires key to re-enter
  registry.leave('prot-room', 'guest2', true);
  assert.throws(
    () => registry.join('prot-room', 'guest2'),
    err => err instanceof RoomAdmissionError && err.code === 'KEY_REQUIRED'
  );
});

test('F12: Integration - protected room creation, guest entry with and without key, and terminal codes', async t => {
  const { client } = await setupServer(t);

  // Creator creates protected room
  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');
  assert.ok(created.roomId);
  assert.ok(created.hostCredential);
  assert.ok(created.roomKey);
  assert.ok(created.roomKey.length >= 16);

  // Visitor attempts to join without key
  const vNoKey = await client();
  vNoKey.send({ type: 'join', roomId: created.roomId, peerId: 'v-no-key' });
  const errNoKey = await vNoKey.next('error');
  assert.equal(errNoKey.code, 'KEY_REQUIRED');
  const closeNoKey = await vNoKey.closed;
  assert.equal(closeNoKey.code, WS_CLOSE_CODES.KEY_REQUIRED);
  assert.equal(isTerminalCloseCode(closeNoKey.code), true);

  // Visitor attempts to join with invalid key
  const vWrongKey = await client();
  vWrongKey.send({ type: 'join', roomId: created.roomId, peerId: 'v-wrong-key', roomKey: 'incorrect-secret-token' });
  const errWrongKey = await vWrongKey.next('error');
  assert.equal(errWrongKey.code, 'KEY_INVALID');
  const closeWrongKey = await vWrongKey.closed;
  assert.equal(closeWrongKey.code, WS_CLOSE_CODES.KEY_INVALID);
  assert.equal(isTerminalCloseCode(closeWrongKey.code), true);

  // Visitor joins with valid key
  const vValid = await client();
  vValid.send({ type: 'join', roomId: created.roomId, peerId: 'v-valid', roomKey: created.roomKey });
  const peersMsg = await vValid.next('peers');
  assert.equal(peersMsg.count, 1);
  assert.equal(peersMsg.roomState.isProtected, true);
  assert.ok(peersMsg.reconnectToken);
});

test('F12: Creator with valid hostCredential enters protected room without typing key', async t => {
  const { client } = await setupServer(t);

  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');

  // Creator joins with hostCredential, omitting roomKey
  const hostClient = await client();
  hostClient.send({
    type: 'join',
    roomId: created.roomId,
    peerId: 'host-peer',
    hostCredential: created.hostCredential,
  });

  const hostPeers = await hostClient.next('peers');
  assert.equal(hostPeers.count, 1);
  assert.equal(hostPeers.roomState.hostPeerId, 'host-peer');
  assert.equal(hostPeers.roomState.isProtected, true);
});

test('F12: Reconnection with reconnectToken bypasses key requirement; voluntary leave requires key again', async t => {
  const { client } = await setupServer(t);

  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');

  // Host enters so the room remains occupied when guest leaves
  const host = await client();
  host.send({ type: 'join', roomId: created.roomId, peerId: 'host-staying', hostCredential: created.hostCredential });
  await host.next('peers');

  // Guest enters with valid key
  const guest1 = await client();
  guest1.send({ type: 'join', roomId: created.roomId, peerId: 'guest-recon', roomKey: created.roomKey });
  const peers1 = await guest1.next('peers');
  const token = peers1.reconnectToken;
  assert.ok(token);

  // Involuntary drop (terminate socket without leave)
  guest1.ws.terminate();
  await guest1.closed;

  // Reconnection with token (no roomKey passed)
  const guestReconnected = await client();
  guestReconnected.send({
    type: 'join',
    roomId: created.roomId,
    peerId: 'guest-recon',
    reconnectToken: token,
  });
  const peersRecon = await guestReconnected.next('peers');
  assert.equal(peersRecon.count, 2);

  // Now guest voluntarily leaves
  guestReconnected.send({ type: 'leave' });

  // Guest attempts to rejoin without key -> KEY_REQUIRED
  const guestReentryNoKey = await client();
  guestReentryNoKey.send({ type: 'join', roomId: created.roomId, peerId: 'guest-recon' });
  const errNoKey = await guestReentryNoKey.next('error');
  assert.equal(errNoKey.code, 'KEY_REQUIRED');

  // Guest re-enters with key -> admitted
  const guestReentryWithKey = await client();
  guestReentryWithKey.send({ type: 'join', roomId: created.roomId, peerId: 'guest-recon', roomKey: created.roomKey });
  const peersReentry = await guestReentryWithKey.next('peers');
  assert.equal(peersReentry.count, 2);
});

test('F12: Invalid key rate limiter locks out after 5 failures; missing keys do not consume rate limit', async t => {
  const { client } = await setupServer(t);

  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');

  // Send 10 missing key requests - none should trigger rate limit
  for (let i = 0; i < 10; i++) {
    const c = await client();
    c.send({ type: 'join', roomId: created.roomId, peerId: `probe-missing-${i}` });
    const err = await c.next('error');
    assert.equal(err.code, 'KEY_REQUIRED');
  }

  // Now send 5 invalid key attempts
  for (let i = 0; i < 5; i++) {
    const c = await client();
    c.send({ type: 'join', roomId: created.roomId, peerId: `attacker-${i}`, roomKey: `wrong-${i}` });
    const err = await c.next('error');
    assert.equal(err.code, 'KEY_INVALID');
  }

  // 6th attempt with invalid key must trigger KEY_RATE_LIMIT
  const cRateLimited = await client();
  cRateLimited.send({ type: 'join', roomId: created.roomId, peerId: 'attacker-6', roomKey: 'wrong-6' });
  const errRate = await cRateLimited.next('error');
  assert.equal(errRate.code, 'KEY_RATE_LIMIT');
  const closeRate = await cRateLimited.closed;
  assert.equal(closeRate.code, WS_CLOSE_CODES.KEY_RATE_LIMIT);
  assert.equal(isTerminalCloseCode(closeRate.code), true);
});

test('F12: Information leakage prevention: invalid key into locked or full room returns KEY_INVALID', async t => {
  const { client } = await setupServer(t, { maxParticipantsPerRoom: 1 });

  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');

  // Host joins and locks room
  const host = await client();
  host.send({ type: 'join', roomId: created.roomId, peerId: 'host', hostCredential: created.hostCredential });
  const hostPeers = await host.next('peers');

  const reqId = crypto.randomUUID();
  host.send({ type: 'moderate-room', requestId: reqId, revision: hostPeers.roomState.revision, action: 'lock' });
  await host.next('moderation-result', e => e.requestId === reqId);

  // Attacker attempts to enter locked AND full room with wrong key
  const attacker = await client();
  attacker.send({ type: 'join', roomId: created.roomId, peerId: 'attacker', roomKey: 'wrong-key' });
  const err = await attacker.next('error');
  // Must return KEY_INVALID, NEVER leaking ROOM_LOCKED or ROOM_FULL!
  assert.equal(err.code, 'KEY_INVALID');

  // Visitor with valid key entering locked room gets ROOM_LOCKED
  const validVisitorLocked = await client();
  validVisitorLocked.send({ type: 'join', roomId: created.roomId, peerId: 'valid-locked', roomKey: created.roomKey });
  const errLocked = await validVisitorLocked.next('error');
  assert.equal(errLocked.code, 'ROOM_LOCKED');

  // Host unlocks room; room is still full (maxParticipants = 1, occupied = 1)
  const reqIdUnlock = crypto.randomUUID();
  host.send({ type: 'moderate-room', requestId: reqIdUnlock, revision: hostPeers.roomState.revision + 1, action: 'unlock' });
  await host.next('moderation-result', e => e.requestId === reqIdUnlock);

  // Attacker with wrong key into full unlocked room still gets KEY_INVALID (not ROOM_FULL!)
  const attackerFull = await client();
  attackerFull.send({ type: 'join', roomId: created.roomId, peerId: 'attacker-full', roomKey: 'wrong-key' });
  const errAttackerFull = await attackerFull.next('error');
  assert.equal(errAttackerFull.code, 'KEY_INVALID');

  // Visitor with valid key entering full room gets ROOM_FULL
  const validVisitorFull = await client();
  validVisitorFull.send({ type: 'join', roomId: created.roomId, peerId: 'valid-full', roomKey: created.roomKey });
  const errFull = await validVisitorFull.next('error');
  assert.equal(errFull.code, 'ROOM_FULL');
});

test('F12: Host voluntary departure leaves room protection active for remaining participants', async t => {
  const { client } = await setupServer(t);

  const creator = await client();
  creator.send({ type: 'create-room', isProtected: true });
  const created = await creator.next('room-created');

  // Host joins
  const host = await client();
  host.send({ type: 'join', roomId: created.roomId, peerId: 'host', hostCredential: created.hostCredential });
  await host.next('peers');

  // Guest joins with key
  const guest = await client();
  guest.send({ type: 'join', roomId: created.roomId, peerId: 'guest', roomKey: created.roomKey });
  await guest.next('peers');

  // Host leaves voluntarily
  host.send({ type: 'leave' });
  await guest.next('room-state', s => s.state.hostPeerId === null);

  // New visitor tries to join without key -> still rejected with KEY_REQUIRED!
  const newGuestNoKey = await client();
  newGuestNoKey.send({ type: 'join', roomId: created.roomId, peerId: 'new-guest' });
  const errNoKey = await newGuestNoKey.next('error');
  assert.equal(errNoKey.code, 'KEY_REQUIRED');

  // New visitor with valid key can join
  const newGuestWithKey = await client();
  newGuestWithKey.send({ type: 'join', roomId: created.roomId, peerId: 'new-guest', roomKey: created.roomKey });
  const peers = await newGuestWithKey.next('peers');
  assert.equal(peers.count, 2);
});
