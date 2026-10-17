import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { RoomRegistry } from '../dist/room-state.js';
import { ServerMessageSchema, ClientMessageSchema } from '@screen-room/protocol';

const sharing = (streamId = 's', paused = false) => ({ active: true, paused, streamId, hasAudio: false, audioMuted: false });
const stopped = { active: false, hasAudio: false, audioMuted: false };

test('room-state: only active sharers indicate, targets must be live streams of the same room', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b'); rooms.join('r', 'c'); rooms.join('other', 'x');
  rooms.updateSharing('other', 'x', sharing('x'));
  assert.equal(rooms.indicateStage('r', 'a', 'b'), undefined, 'not sharing');
  rooms.updateSharing('r', 'a', sharing('a')); rooms.updateSharing('r', 'b', sharing('b'));
  assert.equal(rooms.indicateStage('r', 'c', 'a'), undefined, 'spectators cannot indicate');
  assert.equal(rooms.indicateStage('r', 'a', 'c'), undefined, 'target not sharing');
  assert.equal(rooms.indicateStage('r', 'a', 'x'), undefined, 'target from another room');
  assert.equal(rooms.indicateStage('r', 'a', ''), undefined, 'invalid target');
  assert.deepEqual(rooms.indicateStage('r', 'a', 'b'), { targetPeerId: 'b', seq: 1 });
  assert.deepEqual(rooms.indicateStage('r', 'a', 'a'), { targetPeerId: 'a', seq: 2 });
  assert.deepEqual(rooms.indicateStage('r', 'b', 'b', 0), { targetPeerId: 'b', seq: 1 }, 'independent per presenter');
  assert.deepEqual(rooms.getParticipants('r').find(p => p.peerId === 'a').indication, { targetPeerId: 'a', seq: 2 });
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'c').indication, undefined);
});

test('room-state: pause and F27 source swap preserve indications; stopping clears them with a growing seq', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b');
  rooms.updateSharing('r', 'a', sharing('a1')); rooms.updateSharing('r', 'b', sharing('b1'));
  rooms.indicateStage('r', 'a', 'b');
  rooms.updateSharing('r', 'b', sharing('b1', true));
  assert.equal(rooms.getIndication('r', 'a')?.targetPeerId, 'b');
  rooms.updateSharing('r', 'b', sharing('b2'));
  assert.equal(rooms.getIndication('r', 'a')?.targetPeerId, 'b');
  rooms.updateSharing('r', 'b', stopped);
  assert.deepEqual(rooms.clearIndications('r', 'b', true), [{ presenterPeerId: 'a', seq: 2 }]);
  assert.equal(rooms.getIndication('r', 'a'), undefined);
  rooms.updateSharing('r', 'b', sharing('b3'));
  assert.equal(rooms.getIndication('r', 'a'), undefined, 'a stopped stream is never resurrected');
  assert.equal(rooms.indicateStage('r', 'a', 'b').seq, 3);
});

test('room-state: involuntary drop reserves the indication; voluntary leave and expired targets do not', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b'); rooms.join('r', 'c');
  const token = rooms.getReconnectToken('r', 'a');
  for (const id of ['a', 'b', 'c']) rooms.updateSharing('r', id, sharing(id));
  rooms.indicateStage('r', 'a', 'b');
  rooms.clearIndications('r', 'a', false);
  rooms.leave('r', 'a', false, 1000);
  rooms.join('r', 'a', undefined, token);
  assert.deepEqual(rooms.getIndication('r', 'a'), { targetPeerId: 'b', seq: 1 });
  rooms.leave('r', 'a', false, 1000);
  rooms.clearIndications('r', 'b', true); rooms.leave('r', 'b', true);
  rooms.join('r', 'a', undefined, token);
  assert.equal(rooms.getIndication('r', 'a'), undefined, 'target left while the presenter was away');
  rooms.indicateStage('r', 'a', 'c', 0);
  rooms.clearIndications('r', 'a', true); rooms.leave('r', 'a', true);
  rooms.join('r', 'a');
  assert.equal(rooms.getIndication('r', 'a'), undefined);
  rooms.clearAllRecovery();
});

test('room-state: indications are rate limited and a self-target is cleared when the presenter leaves', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.updateSharing('r', 'a', sharing('a'));
  for (let i = 0; i < 5; i++) assert.ok(rooms.indicateStage('r', 'a', 'a', 0));
  assert.equal(rooms.indicateStage('r', 'a', 'a', 999), undefined);
  assert.ok(rooms.indicateStage('r', 'a', 'a', 1000));
  assert.equal(rooms.clearIndications('r', 'a', false).length, 1);
});

test('protocol: strict schemas reject extra identity fields and malformed stage messages', () => {
  assert.ok(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: 'b' }).success);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: 'b', peerId: 'spoof' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: '' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: null }).success, false);
  assert.ok(ServerMessageSchema.safeParse({ type: 'stage-indicated', peerId: 'a', targetPeerId: null, seq: 3 }).success);
  assert.equal(ServerMessageSchema.safeParse({ type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: -1 }).success, false);
});

async function connect(app, roomId, peerId, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`), events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const send = m => ws.send(JSON.stringify(m));
  const next = async (type, match = () => true) => {
    for (let i = 0; i < 100; i++) {
      const n = events.findIndex(e => e.type === type && match(e)); if (n >= 0) return events.splice(n, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    } throw new Error(`Missing ${type}`);
  };
  const quiet = async type => { await new Promise(resolve => setTimeout(resolve, 60)); return !events.some(e => e.type === type); };
  send({ type: 'join', roomId, peerId, ...(reconnectToken ? { reconnectToken } : {}) });
  const peers = await next('peers'); return { ws, events, send, next, quiet, peers };
}

test('integration: broadcast, late join snapshot, stop, spoofing, isolation and reconnect', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 500 }); await app.ready; t.after(() => app.close());
  const a = await connect(app, 'room', 'a'), b = await connect(app, 'room', 'b'), v = await connect(app, 'room', 'v');
  const other = await connect(app, 'other', 'o');
  a.send({ type: 'indicate-stage', targetPeerId: 'b' });
  v.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.ok(await v.quiet('stage-indicated'), 'not sharing: ignored');
  a.send({ type: 'update-sharing', ...sharing('a') }); b.send({ type: 'update-sharing', ...sharing('b') });
  await v.next('sharing-updated'); await v.next('sharing-updated'); await a.next('sharing-updated');
  v.send({ type: 'indicate-stage', targetPeerId: 'b' });
  a.send({ type: 'indicate-stage', targetPeerId: 'b', peerId: 'b' });
  a.send({ type: 'indicate-stage', targetPeerId: 'ghost' });
  a.send({ type: 'indicate-stage', targetPeerId: 'o' });
  assert.ok(await v.quiet('stage-indicated'));
  a.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.deepEqual(await v.next('stage-indicated'), { type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: 1 });
  await a.next('stage-indicated'); await b.next('stage-indicated');
  assert.ok(await other.quiet('stage-indicated'), 'isolated room');
  b.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.equal((await v.next('stage-indicated')).peerId, 'b');

  const late = await connect(app, 'room', 'late');
  assert.deepEqual(late.peers.participants.find(p => p.peerId === 'a').indication, { targetPeerId: 'b', seq: 1 });
  assert.deepEqual(late.peers.participants.find(p => p.peerId === 'b').indication, { targetPeerId: 'b', seq: 1 });
  assert.equal(late.peers.participants.find(p => p.peerId === 'v').indication, undefined);

  // A presenter's involuntary drop keeps the reservation, and the reconnect restores its indication.
  const token = a.peers.reconnectToken;
  a.ws.terminate();
  const left = await v.next('peer-left', e => e.peerId === 'a');
  assert.equal(left.reconnectGraceMs, 500);
  const a2 = await connect(app, 'room', 'a', token);
  a2.send({ type: 'update-sharing', ...sharing('a') });
  assert.deepEqual(await v.next('stage-indicated', e => e.peerId === 'a'), { type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: 1 });

  // The target stopping clears every indication that points at it.
  b.send({ type: 'update-sharing', ...stopped });
  const cleared = await v.next('stage-indicated', e => e.peerId === 'a' && e.targetPeerId === null);
  assert.equal(cleared.seq, 2);
  const clearedSelf = await v.next('stage-indicated', e => e.peerId === 'b' && e.targetPeerId === null);
  assert.equal(clearedSelf.seq, 2);

  // A voluntary leave is final and announces no grace period.
  a2.send({ type: 'leave' });
  assert.equal((await v.next('peer-left', e => e.peerId === 'a')).reconnectGraceMs, undefined);
});
