import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomRegistry } from '../dist/room-state.js';
import { createSignalServer } from '../dist/server.js';

const state = (rooms, room = 'r') => rooms.handsSnapshot(room).hands;
test('F38 authoritative order, duplicate/stale intent, abuse limits and media independence', () => {
  const rooms = new RoomRegistry();
  for (const peer of ['a', 'b', 'c']) rooms.join('r', peer);
  rooms.join('other', 'x');
  assert.equal(rooms.setHand('r', 'x', true, 0, 0), false);
  assert.ok(rooms.setHand('r', 'b', true, 0, 0));
  const first = state(rooms).find(h => h.peerId === 'b');
  assert.ok(rooms.setHand('r', 'b', true, 1, 0));
  assert.deepEqual(state(rooms).find(h => h.peerId === 'b'), first);
  assert.ok(rooms.setHand('r', 'a', true, 0, 0));
  assert.ok(state(rooms).find(h => h.peerId === 'a').order > first.order);
  assert.equal(rooms.setHand('r', 'b', false, 0, 0), false);
  for (const peer of ['a', 'b']) {
    for (const sharing of [
      { active: true, paused: false, streamId: peer },
      { active: true, paused: true, streamId: peer },
      { active: true, paused: false, streamId: `${peer}2` },
      { active: false },
    ]) rooms.updateSharing('r', peer, { ...sharing, hasAudio: false, audioMuted: false });
  }
  assert.deepEqual(state(rooms).find(h => h.peerId === 'b'), first);
  assert.ok(rooms.setHand('r', 'b', false, 1, 0));
  assert.ok(rooms.setHand('r', 'b', true, 2, 0));
  assert.ok(state(rooms).find(h => h.peerId === 'b').order > state(rooms).find(h => h.peerId === 'a').order);
  rooms.setHand('r', 'b', true, 3, 0);
  assert.equal(rooms.setHand('r', 'b', false, 3, 0), false);
  assert.ok(rooms.setHand('r', 'b', false, 3, 10_000));
  assert.deepEqual(state(rooms, 'other'), [{ peerId: 'x', order: null, version: 0 }]);
});

test('F38 recovery privately preserves order/version/budget; voluntary exit and expiry discard hands', async () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b');
  const token = rooms.getReconnectToken('r', 'a');
  rooms.setHand('r', 'a', true, 0);
  const original = state(rooms).find(h => h.peerId === 'a');
  rooms.leave('r', 'a', false, 1000);
  assert.equal(state(rooms).some(h => h.peerId === 'a'), false);
  assert.throws(() => rooms.join('r', 'a', undefined, 'invalid'));
  rooms.join('r', 'a', undefined, token);
  assert.deepEqual(state(rooms).find(h => h.peerId === 'a'), original);
  assert.equal(rooms.setHand('r', 'a', false, 0), false);
  rooms.leave('r', 'a', true); rooms.join('r', 'a');
  assert.equal(state(rooms).find(h => h.peerId === 'a').order, null);
  rooms.setHand('r', 'a', true, 0);
  rooms.leave('r', 'a', false, 10); rooms.leave('r', 'b', true);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(rooms.has('r'), false);
  rooms.join('r', 'a');
  assert.deepEqual(state(rooms), [{ peerId: 'a', order: null, version: 0 }]);
  rooms.leave('r', 'a', true);
  assert.equal(rooms.has('r'), false);
});

async function connect(app, roomId, peerId, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  ws.send(JSON.stringify({ type: 'join', roomId, peerId, reconnectToken }));
  return { ws, events, send: message => ws.send(JSON.stringify(message)), async next(type, predicate = () => true) {
    for (let i = 0; i < 150; i++) {
      const index = events.findIndex(e => e.type === type && predicate(e));
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  }};
}
test('F38 WebSocket snapshots synchronize joins, recovery, departure and isolation; stale sockets cannot write', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 200 });
  await app.ready; t.after(() => app.close());
  const a = await connect(app, 'r', 'a');
  const peers = await a.next('peers'); await a.next('hands-snapshot');
  const original = [...app.wss.clients].find(s => s.meta?.peerId === 'a');
  const b = await connect(app, 'r', 'b'); await b.next('hands-snapshot'); await a.next('hands-snapshot');
  const other = await connect(app, 'other', 'x'); await other.next('hands-snapshot');
  a.send({ type: 'set-hand', raised: true, version: 0 });
  const raised = await a.next('hands-snapshot');
  assert.deepEqual(await b.next('hands-snapshot'), raised);
  assert.equal(raised.hands.find(h => h.peerId === 'a').order !== null, true);
  assert.equal(JSON.stringify(raised).includes(peers.reconnectToken), false);
  const late = await connect(app, 'r', 'late');
  assert.deepEqual((await late.next('hands-snapshot')).hands.find(h => h.peerId === 'a'), raised.hands.find(h => h.peerId === 'a'));
  a.send({ type: 'set-hand', raised: false, version: 0 });
  assert.equal((await a.next('error')).code, 'HAND_REJECTED');
  a.send({ type: 'set-hand', raised: false, version: 1, peerId: 'b' }); await a.next('error');
  const replacement = await connect(app, 'r', 'a', peers.reconnectToken);
  await replacement.next('hands-snapshot');
  original.emit('message', Buffer.from(JSON.stringify({ type: 'set-hand', raised: false, version: 1 })));
  replacement.ws.terminate();
  await b.next('hands-snapshot', e => !e.hands.some(h => h.peerId === 'a'));
  const recovered = await connect(app, 'r', 'a', peers.reconnectToken);
  assert.deepEqual((await recovered.next('hands-snapshot')).hands.find(h => h.peerId === 'a'), raised.hands.find(h => h.peerId === 'a'));
  recovered.send({ type: 'leave' });
  await b.next('hands-snapshot', e => !e.hands.some(h => h.peerId === 'a'));
  const fresh = await connect(app, 'r', 'a');
  assert.equal((await fresh.next('hands-snapshot')).hands.find(h => h.peerId === 'a').order, null);
  assert.equal(other.events.some(e => e.type === 'hands-snapshot'), false);
});
