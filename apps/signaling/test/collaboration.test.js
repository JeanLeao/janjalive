import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { RoomRegistry } from '../dist/room-state.js';
import { COLLABORATION_LIMITS as L } from '@screen-room/protocol';
const laser = (seq, streamId = 's') => ({ type: 'laser', seq, streamId, eventId: randomUUID(), point: { x: .2, y: .8 } });
const sharing = (streamId = 's', paused = false) => ({ active: true, paused, streamId, hasAudio: false, audioMuted: false });
test('operational limits are independent, bounded, owner/capture checked and pause preserves identity', () => {
  const rooms = new RoomRegistry(); rooms.join('r', 'a'); rooms.join('r', 'b');
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(1), 0), false);
  rooms.updateSharing('r', 'a', sharing());
  assert.equal(rooms.acceptCollaboration('r', 'b', laser(1), 0), false);
  assert.equal(rooms.acceptCollaboration('other', 'a', laser(1), 0), false);
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(1, 'wrong'), 0), false);
  for (let i = 1; i <= L.laserPerSecond; i++) assert.ok(rooms.acceptCollaboration('r', 'a', laser(i), 0));
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(26), 0), false);
  assert.ok(rooms.acceptCollaboration('r', 'a', laser(26), 1000));
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(26), 1001), false);
  const draw = { ...laser(27), type: 'drawing', strokeId: randomUUID(), index: 0, phase: 'start', points: [{ x: .5, y: .5 }] }; delete draw.point;
  for (let i = 0; i < L.drawingPerSecond; i++) assert.ok(rooms.acceptCollaboration('r', 'a', { ...draw, seq: 27 + i }, 1001));
  assert.equal(rooms.acceptCollaboration('r', 'a', { ...draw, seq: 60 }, 1001), false);
  const clear = { type: 'clear-annotations', seq: 61, eventId: randomUUID(), streamId: 's' };
  rooms.updateSharing('r', 'a', sharing('s', true));
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(60), 1002), false);
  for (let i = 0; i < L.clearPerSecond; i++) assert.ok(rooms.acceptCollaboration('r', 'a', { ...clear, seq: 61 + i }, 1002));
  assert.equal(rooms.acceptCollaboration('r', 'a', { ...clear, seq: 65 }, 1002), false);
  rooms.updateSharing('r', 'a', sharing()); assert.ok(rooms.acceptCollaboration('r', 'a', laser(66), 2002));
  rooms.updateSharing('r', 'a', sharing('new')); assert.equal(rooms.acceptCollaboration('r', 'a', laser(67), 2003), false);
  assert.ok(rooms.acceptCollaboration('r', 'a', laser(68, 'new'), 2003));
  rooms.updateSharing('r', 'a', { active: false, hasAudio: false, audioMuted: false });
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(69, 'new'), 2004), false);
});
async function connect(app, roomId, peerId, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`), events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const send = m => ws.send(JSON.stringify(m));
  const next = async type => {
    for (let i = 0; i < 100; i++) {
      const n = events.findIndex(e => e.type === type); if (n >= 0) return events.splice(n, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    } throw new Error(`Missing ${type}`);
  };
  send({ type: 'join', roomId, peerId, ...(reconnectToken ? { reconnectToken } : {}) });
  const peers = await next('peers'); return { ws, events, send, next, peers };
}
test('relay derives socket identity, isolates rooms, skips history, stale sockets and backpressure', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready; t.after(() => app.close());
  const a = await connect(app, 'room', 'a'), b = await connect(app, 'room', 'b'), other = await connect(app, 'other', 'c');
  a.send({ type: 'update-sharing', ...sharing() }); await b.next('sharing-updated');
  a.send(laser(1)); const received = await b.next('collaboration');
  assert.equal(received.peerId, 'a'); assert.equal(received.roomId, 'room'); assert.equal(received.event.seq, 1);
  b.send(laser(1)); a.send({ ...laser(2), peerId: 'b' }); await a.next('error');
  a.send(laser(1));
  const late = await connect(app, 'room', 'late');
  const original = [...app.wss.clients].find(s => s.meta?.peerId === 'a');
  const replacement = await connect(app, 'room', 'a', a.peers.reconnectToken);
  original.emit('message', Buffer.from(JSON.stringify(laser(3))));
  original.emit('message', Buffer.from(JSON.stringify({ type: 'update-sharing', ...sharing('spoof') })));
  replacement.send(laser(4)); assert.equal((await b.next('collaboration')).event.seq, 4); await late.next('collaboration');
  const blocked = [...app.wss.clients].find(s => s.meta?.peerId === 'b');
  Object.defineProperty(blocked, 'bufferedAmount', { configurable: true, get: () => L.maxBufferedBytes });
  replacement.send(laser(5)); await late.next('collaboration');
  replacement.send({ type: 'update-sharing', ...sharing('new') }); await late.next('sharing-updated');
  replacement.send(laser(6));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(b.events.filter(e => e.type === 'collaboration').length, 0);
  assert.equal(other.events.filter(e => e.type === 'collaboration').length, 0);
  assert.equal(late.events.filter(e => e.type === 'collaboration').length, 0);
  assert.equal(a.events.filter(e => e.type === 'collaboration').length, 0);
});

const pointMsg = (seq, targetPeerId = 'a', streamId = 's', eventId = randomUUID()) => ({
  type: 'point',
  targetPeerId,
  streamId,
  eventId,
  seq,
  point: { x: 0.35, y: 0.65 },
});

test('spectator pointing: default enabled, owner permission control, multi-spectator isolation, deduplication, rate limiting and lifecycle', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a', 'HostA');
  rooms.join('r', 'b', 'ViewerB');
  rooms.join('r', 'c', 'ViewerC');

  // Cannot point when target is not sharing
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1), 0), false);

  // Start sharing (pointingEnabled defaults to enabled)
  rooms.updateSharing('r', 'a', sharing('s1'));
  // Owner cannot point to their own capture via spectator pointing
  assert.equal(rooms.acceptPointing('r', 'a', pointMsg(1, 'a', 's1'), 0), false);
  // Invalid room, unknown sender, unknown target, or wrong streamId rejected
  assert.equal(rooms.acceptPointing('other', 'b', pointMsg(1, 'a', 's1'), 0), false);
  assert.equal(rooms.acceptPointing('r', 'ghost', pointMsg(1, 'a', 's1'), 0), false);
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1, 'ghost', 's1'), 0), false);
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1, 'a', 'wrong-stream'), 0), false);

  // Presenter laser sequence (seq 10) does not collide with spectator pointing sequence (seq 1)
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(10, 's1'), 0), true);
  const firstEvent = pointMsg(1, 'a', 's1');
  assert.equal(rooms.acceptPointing('r', 'b', firstEvent, 0), true);
  // Duplicate seq or duplicate eventId rejected
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1, 'a', 's1'), 0), false);
  assert.equal(rooms.acceptPointing('r', 'b', { ...firstEvent, seq: 2 }, 0), false);

  // Second spectator has independent sequence and rate limit budget
  assert.equal(rooms.acceptPointing('r', 'c', pointMsg(1, 'a', 's1'), 0), true);

  // Presenter sequence remains intact after spectator points
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(10, 's1'), 10), false);
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(11, 's1'), 10), true);

  // Per-spectator rate limit (L.pointPerSecond per 1000ms)
  for (let i = 2; i <= L.pointPerSecond; i++) {
    assert.equal(rooms.acceptPointing('r', 'b', pointMsg(i, 'a', 's1'), 10), true);
  }
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(L.pointPerSecond + 1, 'a', 's1'), 10), false);
  // Spectator C is still allowed while B is rate-limited
  assert.equal(rooms.acceptPointing('r', 'c', pointMsg(2, 'a', 's1'), 10), true);
  // After 1000ms window, B can point again
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(L.pointPerSecond + 1, 'a', 's1'), 1020), true);

  // Owner disables pointing -> blocked on server
  rooms.updateSharing('r', 'a', { ...sharing('s1'), pointingEnabled: false });
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(10, 'a', 's1'), 1030), false);
  assert.equal(rooms.acceptPointing('r', 'c', pointMsg(10, 'a', 's1'), 1030), false);

  // Pause and resume of same capture preserves disabled permission when omitted
  rooms.updateSharing('r', 'a', sharing('s1', true));
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.pointingEnabled, false);
  rooms.updateSharing('r', 'a', sharing('s1', false));
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.pointingEnabled, false);
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(11, 'a', 's1'), 1040), false);

  // Owner re-enables pointing -> allowed when not paused, blocked while paused
  rooms.updateSharing('r', 'a', { ...sharing('s1', false), pointingEnabled: true });
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(12, 'a', 's1'), 1050), true);
  rooms.updateSharing('r', 'a', sharing('s1', true));
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(13, 'a', 's1'), 1060), false);

  // New capture (new streamId) resets permission to enabled and clears old pointing sequence
  rooms.updateSharing('r', 'a', { ...sharing('s1', false), pointingEnabled: false });
  rooms.updateSharing('r', 'a', sharing('s2', false));
  assert.notEqual(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.pointingEnabled, false);
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1, 'a', 's2'), 1070), true);
});

test('spectator pointing relay: delivers to presenter and spectators, preserves disabled permission across reconnect and blocks cross-stream tampering', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const hostA = await connect(app, 'room-pt', 'a');
  const hostB = await connect(app, 'room-pt', 'b');
  const viewer = await connect(app, 'room-pt', 'v');
  hostA.send({ type: 'update-nickname', nickname: 'Host A' });
  viewer.send({ type: 'update-nickname', nickname: 'Nina' });
  await hostA.next('peer-updated');
  await hostB.next('peer-updated');

  hostA.send({ type: 'update-sharing', ...sharing('stream-a') });
  hostB.send({ type: 'update-sharing', ...sharing('stream-b') });
  await viewer.next('sharing-updated');
  await viewer.next('sharing-updated');

  // Viewer points to Host A -> both Host A (owner) and Host B (spectator of A) receive it with derived sender identity
  viewer.send(pointMsg(1, 'a', 'stream-a'));
  const evtOnA = await hostA.next('collaboration');
  const evtOnB = await hostB.next('collaboration');
  assert.equal(evtOnA.peerId, 'a');
  assert.equal(evtOnA.event.type, 'point');
  assert.equal(evtOnA.event.senderPeerId, 'v');
  assert.equal(evtOnA.event.senderNickname, 'Nina');
  assert.deepEqual(evtOnA.event.point, { x: 0.35, y: 0.65 });
  assert.equal(evtOnB.event.senderPeerId, 'v');

  // Host B (who is also presenting stream-b) points to Host A's stream-a
  hostB.send(pointMsg(1, 'a', 'stream-a'));
  const evtFromPresenterB = await hostA.next('collaboration');
  assert.equal(evtFromPresenterB.peerId, 'a');
  assert.equal(evtFromPresenterB.event.senderPeerId, 'b');

  // Host A disables pointing on stream-a
  hostA.send({ type: 'update-sharing', ...sharing('stream-a'), pointingEnabled: false });
  const updated = await viewer.next('sharing-updated');
  assert.equal(updated.peerId, 'a');
  assert.equal(updated.pointingEnabled, false);

  // Late joiner receives pointingEnabled: false in initial peers snapshot
  const late = await connect(app, 'room-pt', 'late');
  assert.equal(late.peers.participants.find(p => p.peerId === 'a').sharing.pointingEnabled, false);

  // Manual point attempt by viewer to stream-a is blocked on server, while stream-b remains enabled
  viewer.send(pointMsg(2, 'a', 'stream-a'));
  viewer.send(pointMsg(1, 'b', 'stream-b'));
  const evtOnStreamB = await hostB.next('collaboration');
  assert.equal(evtOnStreamB.peerId, 'b');
  assert.equal(evtOnStreamB.event.streamId, 'stream-b');
  assert.equal(hostA.events.filter(e => e.type === 'collaboration').length, 1);
  assert.equal(hostA.events.find(e => e.type === 'collaboration').peerId, 'b');
  hostA.events.length = 0;

  // Reconnect of Host A (both active session replacement and involuntary drop recovery) preserves pointingEnabled: false without opening a window
  const reconnectedA = await connect(app, 'room-pt', 'a', hostA.peers.reconnectToken);
  viewer.send(pointMsg(3, 'a', 'stream-a'));
  reconnectedA.send({ type: 'update-sharing', ...sharing('stream-a') }); // even if update-sharing omits pointingEnabled
  await viewer.next('sharing-updated');
  viewer.send(pointMsg(4, 'a', 'stream-a'));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(reconnectedA.events.filter(e => e.type === 'collaboration').length, 0);
});

const specDrawMsg = (seq, targetPeerId = 'a', streamId = 's', strokeId = randomUUID(), phase = 'start', index = 0, eventId = randomUUID()) => ({
  type: 'spectator-drawing',
  targetPeerId,
  streamId,
  eventId,
  strokeId,
  seq,
  phase,
  index,
  points: [{ x: 0.25, y: 0.75 }],
});

const clearCollabMsg = (seq, streamId = 's', eventId = randomUUID()) => ({
  type: 'clear-collaborative-drawings',
  streamId,
  eventId,
  seq,
});

test('collaborative drawing: initially disabled, owner toggle, multi-spectator isolation, rate limits, revocation and presenter clear', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a', 'HostA');
  rooms.join('r', 'b', 'ViewerB');
  rooms.join('r', 'c', 'ViewerC');

  // Start sharing: drawingEnabled is initially false by default
  rooms.updateSharing('r', 'a', sharing('s1'));
  const participantA = rooms.getParticipants('r').find(p => p.peerId === 'a');
  assert.equal(participantA.sharing.drawingEnabled, undefined); // omitted / false
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', specDrawMsg(1, 'a', 's1'), 0), false);

  // Presenter cannot draw on their own capture via delegated spectator-drawing
  assert.equal(rooms.acceptSpectatorDrawing('r', 'a', specDrawMsg(1, 'a', 's1'), 0), false);

  // Spectator cannot clear collaborative drawings
  assert.equal(rooms.acceptClearCollaborativeDrawings('r', 'b', clearCollabMsg(1, 's1'), 0), false);

  // Presenter enables collaborative drawing
  rooms.updateSharing('r', 'a', { ...sharing('s1'), drawingEnabled: true });
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.drawingEnabled, true);

  // Spectator drawing now accepted
  const strokeB = randomUUID();
  const firstEvt = specDrawMsg(1, 'a', 's1', strokeB, 'start', 0);
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', firstEvt, 0), true);

  // Reject duplicate seq or duplicate eventId
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', firstEvt, 0), false);
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', { ...firstEvt, seq: 2 }, 0), false);

  // Second spectator drawing accepted concurrently with independent sequence and stroke
  const strokeC = randomUUID();
  assert.equal(rooms.acceptSpectatorDrawing('r', 'c', specDrawMsg(1, 'a', 's1', strokeC, 'start', 0), 0), true);

  // Presenter laser, drawing and pointing sequences are completely isolated from spectator drawing
  assert.equal(rooms.acceptCollaboration('r', 'a', laser(5, 's1'), 0), true);
  assert.equal(rooms.acceptPointing('r', 'b', pointMsg(1, 'a', 's1'), 0), true);

  // Spectator B rate limit (L.spectatorDrawingPerSecond per 1000ms)
  for (let i = 2; i <= L.spectatorDrawingPerSecond; i++) {
    assert.equal(rooms.acceptSpectatorDrawing('r', 'b', specDrawMsg(i, 'a', 's1', strokeB, 'move', i - 1), 10), true);
  }
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', specDrawMsg(L.spectatorDrawingPerSecond + 1, 'a', 's1', strokeB, 'move', 31), 10), false);
  // Spectator C is still allowed while B is rate-limited
  assert.equal(rooms.acceptSpectatorDrawing('r', 'c', specDrawMsg(2, 'a', 's1', strokeC, 'move', 1), 10), true);

  // Pause blocks spectator drawing
  rooms.updateSharing('r', 'a', sharing('s1', true));
  assert.equal(rooms.acceptSpectatorDrawing('r', 'c', specDrawMsg(3, 'a', 's1', strokeC, 'move', 2), 1010), false);

  // Resume preserves drawingEnabled: true
  rooms.updateSharing('r', 'a', sharing('s1', false));
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.drawingEnabled, true);
  assert.equal(rooms.acceptSpectatorDrawing('r', 'c', specDrawMsg(3, 'a', 's1', strokeC, 'move', 2), 1020), true);

  // Presenter clears collaborative drawings
  assert.equal(rooms.acceptClearCollaborativeDrawings('r', 'a', clearCollabMsg(1, 's1'), 1030), true);
  // Rate limited clears
  for (let i = 2; i <= L.clearPerSecond; i++) {
    assert.equal(rooms.acceptClearCollaborativeDrawings('r', 'a', clearCollabMsg(i, 's1'), 1030), true);
  }
  assert.equal(rooms.acceptClearCollaborativeDrawings('r', 'a', clearCollabMsg(L.clearPerSecond + 1, 's1'), 1030), false);

  // Revocation: presenter disables collaborative drawing
  rooms.updateSharing('r', 'a', { ...sharing('s1'), drawingEnabled: false });
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', specDrawMsg(100, 'a', 's1'), 1040), false);
  assert.equal(rooms.acceptSpectatorDrawing('r', 'c', specDrawMsg(100, 'a', 's1'), 1040), false);

  // New capture resets drawingEnabled to disabled
  rooms.updateSharing('r', 'a', { ...sharing('s1'), drawingEnabled: true });
  rooms.updateSharing('r', 'a', sharing('s2', false));
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'a').sharing.drawingEnabled, undefined);
  assert.equal(rooms.acceptSpectatorDrawing('r', 'b', specDrawMsg(1, 'a', 's2'), 1050), false);
});

test('collaborative drawing relay: distributes server-derived identity, honors revocation and presenter clear', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const host = await connect(app, 'room-cd', 'h');
  const viewer1 = await connect(app, 'room-cd', 'v1');
  const viewer2 = await connect(app, 'room-cd', 'v2');
  host.send({ type: 'update-nickname', nickname: 'Host Aldo' });
  viewer1.send({ type: 'update-nickname', nickname: 'Viewer Bob' });
  await host.next('peer-updated');
  await viewer1.next('peer-updated');

  // Start sharing with drawingEnabled: true
  host.send({ type: 'update-sharing', ...sharing('stream-1'), drawingEnabled: true });
  await viewer1.next('sharing-updated');
  await viewer2.next('sharing-updated');

  // Viewer 1 draws
  const stroke1 = randomUUID();
  viewer1.send(specDrawMsg(1, 'h', 'stream-1', stroke1, 'start', 0));
  const evtOnHost = await host.next('collaboration');
  const evtOnV2 = await viewer2.next('collaboration');

  assert.equal(evtOnHost.peerId, 'h');
  assert.equal(evtOnHost.event.type, 'spectator-drawing');
  assert.equal(evtOnHost.event.senderPeerId, 'v1');
  assert.equal(evtOnHost.event.senderNickname, 'Viewer Bob');
  assert.equal(evtOnHost.event.strokeId, stroke1);
  assert.equal(evtOnV2.event.senderPeerId, 'v1');

  // Presenter clears collaborative drawings
  host.send(clearCollabMsg(1, 'stream-1'));
  const clearOnV1 = await viewer1.next('collaboration');
  const clearOnV2 = await viewer2.next('collaboration');
  assert.equal(clearOnV1.peerId, 'h');
  assert.equal(clearOnV1.event.type, 'clear-collaborative-drawings');
  assert.equal(clearOnV2.event.type, 'clear-collaborative-drawings');

  // Revoke permission
  host.send({ type: 'update-sharing', ...sharing('stream-1'), drawingEnabled: false });
  const updateV1 = await viewer1.next('sharing-updated');
  assert.equal(updateV1.drawingEnabled, false);

  // Drawing after revocation blocked
  viewer1.send(specDrawMsg(2, 'h', 'stream-1', stroke1, 'move', 1));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(host.events.filter(e => e.type === 'collaboration').length, 0);
});

