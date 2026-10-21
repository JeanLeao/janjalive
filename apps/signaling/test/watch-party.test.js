import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchParties } from '../dist/watch-party.js';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { createTestRooms } from './helpers/create-rooms.js';
const id = '628e19de-801e-4513-b27e-19f3df97c641';
const file = { name: 'video.webm', mime: 'video/webm', size: 123, sha256: 'a'.repeat(64) };
const op = (action, revision = 0, extra = {}) => ({ type: 'watch-operation', action, revision, requestId: id, sessionId: id, ...extra });
test('watch: spectator authority, concurrent create, stale commands, seeks, departure and expiry', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const events = []; const watch = new WatchParties(s => events.push(s));
  assert.equal(watch.apply('room', 'spectator', op('create', 0, { file, duration: 60 })), null);
  assert.ok(watch.apply('room', 'host', op('create', 1, { file, duration: 60 })));
  assert.ok(watch.apply('room', 'host', op('play', 1)));
  assert.equal(watch.apply('room', 'spectator', op('play', 1)), null);
  t.mock.timers.tick(5000);
  assert.equal(watch.apply('room', 'spectator', op('pause', 2)), null);
  assert.equal(watch.snapshot('room').state.position, 5);
  assert.ok(watch.apply('room', 'spectator', op('play', 2)));
  assert.ok(watch.apply('room', 'spectator', op('seek', 3, { position: 61 })));
  assert.equal(watch.apply('room', 'spectator', op('seek', 3, { position: 20 })), null);
  assert.equal(watch.snapshot('room').state.position, 20);
  watch.depart('room', 'viewer'); assert.ok(watch.snapshot('room').state);
  watch.depart('room', 'spectator'); assert.equal(watch.snapshot('room').state, null);
  assert.ok(watch.apply('room', 'spectator', op('play', 5)));
  assert.equal(watch.apply('room', 'new', op('create', 5, { file, duration: 60, sessionId: 'new' })), null);
  assert.ok(watch.apply('room', 'spectator', op('seek', 6, { position: 1 })));
  watch.delete('room'); assert.equal(watch.snapshot('room').revision, 0);
  watch.dispose(); assert.ok(events.length >= 5);
});
test('watch: F15 session and metadata authorization preserves normal transfers', () => {
  const watch = new WatchParties(() => {});
  watch.apply('room', 'sender', op('create', 0, { file, duration: 60 }));
  const request = { type: 'file-request', id, target: 'viewer', watchSessionId: id, file };
  assert.equal(watch.authorizeFile('room', 'sender', request), true);
  assert.equal(watch.authorizeFile('room', 'other', request), false);
  assert.equal(watch.authorizeFile('other-room', 'sender', request), false);
  assert.equal(watch.authorizeFile('room', 'sender', { ...request, file: { ...file, sha256: 'b'.repeat(64) } }), false);
  assert.equal(watch.authorizeFile('room', 'other', { ...request, watchSessionId: undefined }), true);
  watch.depart('room', 'sender'); assert.equal(watch.authorizeFile('room', 'sender', request), false);
});
async function connect(app, roomId, peerId) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = []; ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const client = { ws, send: message => ws.send(JSON.stringify(message)), async next(type) {
    for (let i = 0; i < 150; i++) {
      const index = events.findIndex(e => e.type === type);
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  }};
  client.send({ type: 'join', roomId, peerId }); client.peers = await client.next('peers'); return client;
}
test('wire watch: active socket identity, late join, consent, clock, departure, room isolation', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready;
  t.after(() => app.close());
  const rooms = await createTestRooms(app, ['room', 'other']);
  const a = await connect(app, rooms.room, 'a'), b = await connect(app, rooms.room, 'b');
  const other = await connect(app, rooms.other, 'other');
  a.send(op('create', 0, { file, duration: 60 })); assert.equal((await a.next('watch-result')).ok, true);
  assert.equal((await b.next('watch-snapshot')).state.controllerId, 'a');
  b.send(op('play', 1)); assert.equal((await b.next('watch-result')).ok, false);
  const late = await connect(app, rooms.room, 'late'); assert.equal(late.peers.watch.state.sessionId, id);
  b.send({ type: 'file-request', id, target: 'a', file, watchSessionId: id });
  assert.equal((await b.next('file-event')).action, 'error');
  a.send({ type: 'file-request', id, target: 'b', file, watchSessionId: id });
  assert.equal((await b.next('file-event')).action, 'request');
  b.send({ type: 'file-control', id, target: 'a', action: 'accept' });
  assert.equal((await b.next('file-event')).action, 'accept');
  assert.equal(other.peers.watch.state, null);
  late.send({ type: 'watch-clock', sentAt: 123 }); assert.equal((await late.next('watch-clock-reply')).sentAt, 123);
  a.ws.close(1000); // skip b's rejection refresh, then observe controller departure
  let ended; do { ended = await b.next('watch-snapshot'); } while (ended.state);
  assert.equal(ended.state, null);
  for (const client of [b, late, other]) client.ws.close();
});

test('watch readiness: informational state is session-scoped and never changes the authoritative timeline', () => {
  const events = [];
  const watch = new WatchParties(() => {}, e => events.push(e));
  watch.apply('room', 'controller', op('create', 0, { file, duration: 60 }));
  watch.readiness('room', 'viewer', 'old', 'ready'); assert.equal(events.length, 0);
  watch.readiness('room', 'viewer', id, 'ready');
  watch.readiness('room', 'viewer', id, 'ready'); assert.equal(events.length, 1);
  watch.readiness('room', 'viewer', id, 'buffering');
  assert.equal(watch.snapshot('room').revision, 1);
  assert.equal(watch.snapshot('room').availability[0].status, 'buffering');
  watch.depart('room', 'viewer'); assert.equal(events.at(-1).status, 'unavailable');
  assert.equal(watch.snapshot('room').availability.length, 0); assert.ok(watch.snapshot('room').state);
  watch.depart('room', 'controller'); assert.equal(watch.snapshot('room').state, null);
});
