import test from 'node:test';
import assert from 'node:assert/strict';
import { Clips } from '../dist/clips.js';
const sharing = { active: true, streamId: 'capture', hasAudio: false, audioMuted: false };
const operation = (action, extra = {}) => ({ action, type: 'clip-operation', seq: 1, presenterId: 'presenter', streamId: 'capture', recordingId: 'fcfa187e-c9b7-478a-959c-0e2ef8ea6f70', version: 1, ...extra });
function setup(t) {
  const events = []; const clips = new Clips(s => events.push(s));
  t.after(() => clips.dispose()); clips.sharing('room', 'presenter', sharing);
  return { clips, events };
}
test('clips: deny by default, owner records without permission, pending is private, duplicates rejected', t => {
  const { clips } = setup(t);
  assert.match(clips.apply('room', 'viewer', operation('request'), sharing), /autorizou/);
  assert.equal(clips.apply('room', 'presenter', operation('request'), sharing), null);
  assert.deepEqual(clips.snapshot('room').recordings, []);
  assert.match(clips.apply('room', 'presenter', operation('request'), sharing), /já tem/);
  assert.equal(clips.apply('room', 'presenter', operation('started'), sharing), null);
  assert.equal(clips.snapshot('room').recordings.length, 1);
  assert.match(clips.apply('room', 'presenter', operation('started'), sharing), /expirada/);
});
test('clips: consent owner only, revoke active and pending, old grants remain invalid after re-enable', t => {
  const { clips } = setup(t);
  assert.ok(clips.apply('room', 'host', operation('permission', { allowed: true }), sharing));
  assert.equal(clips.apply('room', 'presenter', operation('permission', { allowed: true }), sharing), null);
  const version = clips.snapshot('room').permissions[0].version;
  assert.equal(clips.apply('room', 'viewer', operation('request', { version }), sharing), null);
  assert.equal(clips.apply('room', 'viewer', operation('started', { version }), sharing), null);
  assert.equal(clips.snapshot('room').recordings.length, 1); // late join snapshot
  assert.equal(clips.apply('room', 'presenter', operation('permission', { version, allowed: false }), sharing), null);
  assert.equal(clips.snapshot('room').recordings.length, 0);
  const revoked = clips.snapshot('room').permissions[0].version;
  clips.apply('room', 'presenter', operation('permission', { version: revoked, allowed: true }), sharing);
  assert.ok(clips.apply('room', 'viewer', operation('started', { version }), sharing));
});
for (const change of [{ ...sharing, paused: true }, { ...sharing, active: false }, { ...sharing, streamId: 'new' }]) {
  test(`clips: invalidates recording on ${JSON.stringify(change)}`, t => {
    const { clips } = setup(t);
    clips.apply('room', 'presenter', operation('request'), sharing);
    clips.apply('room', 'presenter', operation('started'), sharing);
    clips.sharing('room', 'presenter', change);
    assert.equal(clips.snapshot('room').recordings.length, 0);
    assert.ok(clips.apply('room', 'presenter', operation('started'), change));
    if (change.streamId === 'new') assert.equal(clips.snapshot('room').permissions[0].allowed, false);
  });
}
test('clips: disconnect removes grants, permissions and active metadata; no automatic restart', t => {
  const { clips } = setup(t);
  clips.apply('room', 'presenter', operation('request'), sharing);
  clips.depart('room', 'presenter');
  assert.equal(clips.snapshot('room').permissions.length, 0);
  assert.ok(clips.apply('room', 'presenter', operation('started'), sharing));
  clips.delete('room'); assert.equal(clips.snapshot('room').revision, 0);
});
test('clips: pending expiry and active maximum duration', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { clips } = setup(t);
  clips.apply('room', 'presenter', operation('request'), sharing);
  t.mock.timers.tick(5001);
  assert.ok(clips.apply('room', 'presenter', operation('started'), sharing));
  clips.apply('room', 'presenter', operation('request'), sharing);
  clips.apply('room', 'presenter', operation('started'), sharing);
  t.mock.timers.tick(60_001);
  assert.equal(clips.snapshot('room').recordings.length, 0);
});

import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { createTestRooms } from './helpers/create-rooms.js';
async function connect(app, roomId, peerId, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const client = { ws, events, send(message) { ws.send(JSON.stringify(message)); }, async next(type, predicate = () => true) {
    for (let i = 0; i < 150; i++) {
      const index = events.findIndex(event => event.type === type && predicate(event));
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  }};
  client.send({ type: 'join', roomId, peerId, ...(reconnectToken ? { reconnectToken } : {}) });
  client.peers = await client.next('peers'); client.snapshot = await client.next('clips-snapshot');
  return client;
}
test('wire clips: socket identity, monotonic sequence, rate limit, late join, disconnect and isolation', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready; t.after(() => app.close());
  const ids = await createTestRooms(app, ['room', 'other']);
  const p = await connect(app, ids.room, 'presenter'), v = await connect(app, ids.room, 'viewer');
  const other = await connect(app, ids.other, 'other');
  p.send({ type: 'update-sharing', ...sharing });
  const initial = await p.next('clips-snapshot', s => s.permissions.length === 1);
  const permission = operation('permission', { version: initial.permissions[0].version, allowed: true });
  v.send(permission); assert.equal((await v.next('clip-result')).ok, false);
  p.send(permission); assert.equal((await p.next('clip-result')).ok, true);
  const allowed = await p.next('clips-snapshot', s => s.permissions[0]?.allowed);
  const request = operation('request', { seq: 2, version: allowed.permissions[0].version });
  v.send(request); assert.equal((await v.next('clip-result')).ok, true);
  v.send(request); assert.equal((await v.next('clip-result')).ok, false);
  const late = await connect(app, ids.room, 'late');
  assert.equal(late.events.some(s => s.type === 'clips-snapshot' && s.recordings.length), false);
  v.send({ ...request, action: 'started', seq: 3 }); assert.equal((await v.next('clip-result')).ok, true);
  const active = await p.next('clips-snapshot', s => s.recordings.length === 1);
  assert.equal(active.recordings[0].recorderId, 'viewer');
  const newcomer = await connect(app, ids.room, 'newcomer');
  assert.equal(newcomer.snapshot.recordings[0].recordingId, request.recordingId);
  assert.equal(newcomer.peers.count, 4);
  assert.equal(other.events.some(s => s.type === 'clips-snapshot' && s.recordings.length), false);
  for (let seq = 4; seq <= 35; seq++) v.send({ ...request, seq });
  await v.next('clip-result', result => /frequência/.test(result.message));
  v.send({ ...request, action: 'stop', seq: 36 });
  await p.next('clips-snapshot', s => s.revision > active.revision && s.recordings.length === 0);
  const token = v.peers.reconnectToken; v.ws.terminate();
  await p.next('peer-left', s => s.peerId === 'viewer');
  const restored = await connect(app, ids.room, 'viewer', token);
  restored.send({ ...request, action: 'started', seq: 1 }); assert.equal((await restored.next('clip-result')).ok, false);
});
test('clips: presenter can revoke even while paused; resume does not restore consent', t => {
  const { clips } = setup(t);
  clips.apply('room', 'presenter', operation('permission', { allowed: true }), sharing);
  const version = clips.snapshot('room').permissions[0].version;
  clips.sharing('room', 'presenter', { ...sharing, paused: true });
  assert.equal(clips.apply('room', 'presenter', operation('permission', { version, allowed: false }), { ...sharing, paused: true }), null);
  clips.sharing('room', 'presenter', sharing);
  assert.equal(clips.snapshot('room').permissions[0].allowed, false);
});
