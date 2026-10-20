import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { RoomRegistry } from '../dist/room-state.js';
import { WS_CLOSE_CODES, isTerminalCloseCode, ClientMessageSchema, ServerMessageSchema } from '@screen-room/protocol';

async function setup(t, options = {}) {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', ...options });
  await app.ready;
  t.after(() => app.close());
  async function client(headers) {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`, { headers });
    const events = [];
    ws.on('message', raw => events.push(JSON.parse(raw.toString())));
    const closed = new Promise(resolve => ws.once('close', code => resolve(code)));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    t.after(() => ws.close());
    return { ws, events, closed,
      send: message => ws.send(JSON.stringify(message)),
      next: async (type, predicate = () => true) => {
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          const index = events.findIndex(e => e.type === type && predicate(e));
          if (index >= 0) return events.splice(index, 1)[0];
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        throw new Error(`Missing ${type}`);
      },
    };
  }
  const creator = await client();
  creator.send({ type: 'create-room' });
  const created = await creator.next('room-created');
  const join = async (c, peerId, extra = {}, roomId = created.roomId) => {
    c.send({ type: 'join', roomId, peerId, ...extra });
    return c.next('peers');
  };
  const moderate = async (c, state, action, targetPeerId, stale = false) => {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (!stale) state = c.events.filter(e => e.type === 'room-state').at(-1)?.state ?? state;
    const requestId = crypto.randomUUID();
    c.send({ type: 'moderate-room', requestId, revision: state.revision, action, ...(targetPeerId ? { targetPeerId } : {}) });
    return c.next('moderation-result', e => e.requestId === requestId);
  };
  return { app, client, creator, created, join, moderate };
}

test('F11: first visitor, forged identity, independent credentials, cross-room and replaced sockets', async t => {
  const { client, creator, created, join, moderate } = await setup(t);
  const guest = await client();
  const guestPeers = await join(guest, 'guest');
  assert.equal(guestPeers.roomState.hostPeerId, null);
  assert.equal((await moderate(guest, guestPeers.roomState, 'lock')).ok, false);
  const hostPeers = await join(creator, 'host', { hostCredential: created.hostCredential });
  assert.equal(hostPeers.roomState.hostPeerId, 'host');
  assert.equal(JSON.stringify(guest.events).includes(created.hostCredential), false);
  for (const action of ['lock', 'unlock', 'remove']) {
    guest.send({ type: 'moderate-room', requestId: action, revision: hostPeers.roomState.revision, action, targetPeerId: 'host', peerId: 'host' });
    assert.equal((await guest.next('error')).message.includes('malformada'), true);
    assert.equal((await moderate(guest, hostPeers.roomState, action, 'host')).ok, false);
  }
  const forged = await client();
  forged.send({ type: 'join', roomId: created.roomId, peerId: 'host', reconnectToken: hostPeers.reconnectToken });
  assert.equal((await forged.next('error')).code, 'UNAUTHORIZED_HOST');
  const another = await client(); another.send({ type: 'create-room' });
  const second = await another.next('room-created');
  another.send({ type: 'join', roomId: second.roomId, peerId: 'other', hostCredential: created.hostCredential });
  assert.equal((await another.next('error')).code, 'UNAUTHORIZED_HOST');
  const replacement = await client();
  const restored = await join(replacement, 'host', { hostCredential: created.hostCredential, reconnectToken: hostPeers.reconnectToken });
  assert.equal(await creator.closed, WS_CLOSE_CODES.SUPERSEDED);
  assert.equal((await moderate(replacement, restored.roomState, 'lock')).ok, true);
  // Previous socket cannot send frames once superseded; close callbacks do not remove replacement.
  assert.equal((await replacement.next('room-state', e => e.state.locked)).state.hostConnected, true);
});

test('F11: authoritative lock, terminal admission, protected active/reserved recovery and stale commands', async t => {
  const { client, creator, created, join, moderate } = await setup(t);
  const host = await join(creator, 'host', { hostCredential: created.hostCredential });
  const guest = await client(); const peers = await join(guest, 'guest');
  assert.equal((await moderate(creator, host.roomState, 'lock')).ok, true);
  const locked = (await creator.next('room-state', e => e.state.locked)).state;
  assert.equal((await moderate(creator, host.roomState, 'unlock', undefined, true)).ok, false);
  const visitor = await client(); visitor.send({ type: 'join', roomId: created.roomId, peerId: 'new' });
  assert.equal((await visitor.next('error')).code, 'ROOM_LOCKED');
  assert.equal(isTerminalCloseCode(await visitor.closed), true);
  const active = await client(); assert.equal((await join(active, 'guest', { reconnectToken: peers.reconnectToken })).roomState.locked, true);
  active.ws.terminate(); await active.closed;
  await creator.next('peer-left', e => e.peerId === 'guest');
  const reserved = await client(); assert.equal((await join(reserved, 'guest', { reconnectToken: peers.reconnectToken })).roomState.locked, true);
  assert.equal((await moderate(creator, locked, 'unlock')).ok, true);
  const late = await client(); assert.equal((await join(late, 'late')).roomState.locked, false);
});

test('F11: removal invalidates previous recovery, frees capacity and cleans presence without banning', async t => {
  const { client, creator, created, join, moderate } = await setup(t, { maxParticipantsPerRoom: 2 });
  const host = await join(creator, 'host', { hostCredential: created.hostCredential });
  const guest = await client(); const old = await join(guest, 'guest');
  assert.equal((await moderate(creator, host.roomState, 'remove', 'host')).ok, false);
  assert.equal((await moderate(creator, host.roomState, 'remove', 'guest')).ok, true);
  assert.equal((await guest.next('error')).code, 'REMOVED');
  assert.equal(await guest.closed, WS_CLOSE_CODES.REMOVED);
  const left = await creator.next('peer-left'); assert.equal(left.reconnectGraceMs, undefined);
  const previous = await client(); previous.send({ type: 'join', roomId: created.roomId, peerId: 'guest', reconnectToken: old.reconnectToken });
  assert.equal((await previous.next('error')).code, 'UNAUTHORIZED_RECONNECT');
  const fresh = await client(); assert.equal((await join(fresh, 'guest')).count, 2);
  const full = await client(); full.send({ type: 'join', roomId: created.roomId, peerId: 'extra' });
  assert.equal((await full.next('error')).code, 'ROOM_FULL');
});

test('F11: host temporary recovery, reservation expiry, automatic unlock and irrevocable credentials', async t => {
  const { client, creator, created, join, moderate } = await setup(t, { recoveryGraceMs: 200 });
  const host = await join(creator, 'host', { hostCredential: created.hostCredential });
  const guest = await client(); await join(guest, 'guest');
  await moderate(creator, host.roomState, 'lock');
  creator.ws.terminate(); await creator.closed;
  const away = await guest.next('room-state', e => !e.state.hostConnected && e.state.hostPeerId === 'host');
  assert.equal(away.state.locked, true);
  const recovered = await client(); const peers = await join(recovered, 'host', { hostCredential: created.hostCredential, reconnectToken: host.reconnectToken });
  assert.equal(peers.roomState.locked, true);
  recovered.ws.terminate(); await recovered.closed;
  const lost = await guest.next('room-state', e => e.state.hostPeerId === null);
  assert.equal(lost.state.locked, false);
  const revoked = await client(); revoked.send({ type: 'join', roomId: created.roomId, peerId: 'host', hostCredential: created.hostCredential, reconnectToken: host.reconnectToken });
  assert.equal((await revoked.next('error')).code, 'UNAUTHORIZED_HOST');
  const fresh = await client(); assert.equal((await join(fresh, 'host')).roomState.hostPeerId, null);
});

test('F11: voluntary host departure revokes immediately and leaves occupied room open', async t => {
  const { client, creator, created, join, moderate } = await setup(t);
  const host = await join(creator, 'host', { hostCredential: created.hostCredential });
  const guest = await client(); await join(guest, 'guest');
  await moderate(creator, host.roomState, 'lock');
  creator.send({ type: 'leave' });
  assert.equal((await guest.next('room-state', e => e.state.hostPeerId === null)).state.locked, false);
  const retry = await client(); retry.send({ type: 'join', roomId: created.roomId, peerId: 'other', hostCredential: created.hostCredential });
  assert.equal((await retry.next('error')).code, 'UNAUTHORIZED_HOST');
});

test('F11: nonexistent, destroyed and abandoned rooms; bounded creation and forbidden origin', async t => {
  const { client, creator, created, join } = await setup(t, { creationTtlMs: 40 });
  const absent = await client(); absent.send({ type: 'join', roomId: 'never-created', peerId: 'visitor' });
  assert.equal((await absent.next('error')).code, 'ROOM_NOT_FOUND');
  await new Promise(resolve => setTimeout(resolve, 60));
  const abandoned = await client(); abandoned.send({ type: 'join', roomId: created.roomId, peerId: 'visitor' });
  assert.equal((await abandoned.next('error')).code, 'ROOM_NOT_FOUND');
  creator.send({ type: 'create-room' }); const occupied = await creator.next('room-created');
  await join(creator, 'host', { hostCredential: occupied.hostCredential }, occupied.roomId);
  creator.send({ type: 'leave' });
  const destroyed = await client(); destroyed.send({ type: 'join', roomId: occupied.roomId, peerId: 'new' });
  assert.equal((await destroyed.next('error')).code, 'ROOM_NOT_FOUND');
  for (let i = 0; i < 8; i++) { creator.send({ type: 'create-room' }); await creator.next('room-created'); }
  creator.send({ type: 'create-room' }); assert.equal((await creator.next('error')).code, 'CREATE_RATE_LIMIT');
  const forbidden = await client({ origin: 'https://untrusted.invalid' });
  assert.equal(await forbidden.closed, WS_CLOSE_CODES.FORBIDDEN_ORIGIN);
});

test('F11: lazy expiry also revokes host and unblocks admission; protocol rejects malformed commands', () => {
  const rooms = new RoomRegistry(); const created = rooms.createRoom();
  rooms.join(created.roomId, 'host', undefined, undefined, created.hostCredential);
  rooms.join(created.roomId, 'guest');
  rooms.moderate(created.roomId, 'host', rooms.roomState(created.roomId).revision, 'lock');
  rooms.leave(created.roomId, 'host', false, 1000);
  rooms.getRecoveryReservation(created.roomId, 'host').expiresAt = Date.now() - 1;
  rooms.getReservedPeers(created.roomId);
  assert.equal(rooms.roomState(created.roomId).hostPeerId, null);
  assert.equal(rooms.roomState(created.roomId).locked, false);
  assert.throws(() => rooms.join(created.roomId, 'host', undefined, undefined, created.hostCredential));
  for (const command of [{ type: 'moderate-room', action: 'lock' }, { type: 'create-room', hostCredential: 'invalid' }]) assert.equal(ClientMessageSchema.safeParse(command).success, false);
  assert.equal(ServerMessageSchema.safeParse({ type: 'room-state', state: rooms.roomState(created.roomId) }).success, true);
  rooms.clearAllRecovery();
});


test('F11: membership races and duplicate requests cannot affect a new participant session', async t => {
  const { client, creator, created, join, moderate } = await setup(t);
  await join(creator, 'host', { hostCredential: created.hostCredential });
  const guest = await client(); const old = await join(guest, 'guest');
  const before = (await creator.next('room-state', e => e.state.revision === old.roomState.revision)).state;
  const replacement = await client(); await join(replacement, 'guest', { reconnectToken: old.reconnectToken });
  assert.equal((await moderate(creator, before, 'remove', 'guest', true)).ok, false);
  await creator.next('room-state', e => e.state.revision > before.revision);
  const latest = replacement.events.filter(e => e.type === 'room-state').at(-1)?.state;
  const request = { type: 'moderate-room', requestId: 'same-command', revision: latest.revision, action: 'lock' };
  creator.send(request); assert.equal((await creator.next('moderation-result')).ok, true);
  const locked = await creator.next('room-state', e => e.state.locked);
  creator.send({ ...request, revision: locked.state.revision, action: 'remove', targetPeerId: 'guest' });
  assert.equal((await creator.next('moderation-result')).ok, false);
  assert.equal(replacement.ws.readyState, WebSocket.OPEN);
});

test('F11: expired host grant cannot be reclaimed through lazy join before its timer fires', () => {
  const rooms = new RoomRegistry(); const created = rooms.createRoom();
  rooms.join(created.roomId, 'host', undefined, undefined, created.hostCredential);
  rooms.join(created.roomId, 'guest');
  rooms.leave(created.roomId, 'host', false, 1000);
  const reservation = rooms.getRecoveryReservation(created.roomId, 'host');
  reservation.expiresAt = Date.now() - 1;
  assert.throws(() => rooms.join(created.roomId, 'host', undefined, reservation.reconnectToken, created.hostCredential));
  assert.equal(rooms.roomState(created.roomId).hostPeerId, null);
  rooms.clearAllRecovery();
});

test('F11: an unclaimed creation occupied by guests expires without destroying their room', async t => {
  const { client, creator, created, join } = await setup(t, { creationTtlMs: 150 });
  const guest = await client(); await join(guest, 'guest');
  await guest.next('room-state', e => e.state.revision >= 2);
  creator.send({ type: 'join', roomId: created.roomId, peerId: 'creator', hostCredential: created.hostCredential });
  assert.equal((await creator.next('error')).code, 'UNAUTHORIZED_HOST');
  const late = await client();
  const snapshot = await join(late, 'late');
  assert.equal(snapshot.count, 2);
  assert.equal(snapshot.roomState.hostPeerId, null);
  assert.equal(snapshot.roomState.locked, false);
});
