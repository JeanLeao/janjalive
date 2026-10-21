import test from 'node:test';
import assert from 'node:assert/strict';
import { FileTransfers } from '../dist/file-transfers.js';
const file = { name: 'x', mime: '', size: 3, sha256: 'a'.repeat(64) };
const request = (target, id = crypto.randomUUID()) => ({ type: 'file-request', target, id, file });
const control = (id, target, action) => ({ type: 'file-control', id, target, action });
function setup(t) { const events = []; const files = new FileTransfers((room, peer, event) => events.push({ room, peer, ...event })); t.after(() => files.dispose()); return { files, events, apply: (from, m, connected = () => true) => files.apply('room', from, m, connected) }; }
test('files: multiple recipients independently accept, reject, complete; requester cannot consent', t => {
  const { apply, events } = setup(t); const b = request('b'), c = request('c');
  apply('a', b); apply('a', c);
  apply('a', control(b.id, 'b', 'accept')); assert.equal(events.at(-1).action, 'error');
  apply('c', control(c.id, 'a', 'reject')); assert.equal(events.at(-1).action, 'reject');
  apply('b', control(b.id, 'a', 'accept')); assert.equal(events.at(-1).action, 'accept');
  apply('b', control(b.id, 'a', 'complete')); assert.equal(events.at(-1).action, 'complete');
  apply('b', control(b.id, 'a', 'complete')); assert.equal(events.at(-1).action, 'error');
  apply('a', b); assert.equal(events.at(-1).action, 'error');
});
test('files: unauthorized target, identity, pre-consent completion and stale reconnect controls rejected', t => {
  const { apply, files, events } = setup(t); const b = request('b');
  apply('a', b, () => false); assert.equal(events.at(-1).action, 'error');
  apply('a', b); apply('c', control(b.id, 'a', 'accept')); assert.equal(events.at(-1).action, 'error');
  apply('b', control(b.id, 'a', 'complete')); assert.equal(events.at(-1).action, 'error');
  files.depart('room', 'a'); assert.equal(events.at(-1).action, 'cancel');
  apply('b', control(b.id, 'a', 'accept')); assert.equal(events.at(-1).action, 'error');
});
test('files: pending caps, request timeout and accepted lifetime', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { apply, events } = setup(t);
  const b = request('b'); apply('a', b); apply('b', control(b.id, 'a', 'accept'));
  for (let i = 0; i < 7; i++) apply('a', request(`c${i}`));
  apply('a', request('overflow')); assert.equal(events.at(-1).action, 'error');
  t.mock.timers.tick(60_001); assert.equal(events.filter(e => e.id === b.id && e.action === 'cancel').length, 0);
  t.mock.timers.tick(540_000); assert.equal(events.filter(e => e.id === b.id && e.action === 'cancel').length, 2);
});

import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { createTestRooms } from './helpers/create-rooms.js';
async function connect(app, roomId, peerId, reconnectToken, hostCredential) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`), events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const client = { ws, events, send: m => ws.send(JSON.stringify(m)), async next(type, predicate = () => true) {
    for (let i = 0; i < 150; i++) { const at = events.findIndex(m => m.type === type && predicate(m)); if (at >= 0) return events.splice(at, 1)[0]; await new Promise(r => setTimeout(r, 10)); }
    throw new Error(`Missing ${type}`);
  } };
  client.send({ type: 'join', roomId, peerId, ...(reconnectToken ? { reconnectToken } : {}), ...(hostCredential ? { hostCredential } : {}) }); client.peers = await client.next('peers'); return client;
}
test('wire files: same-room connected identity, schema rejection, socket replacement invalidates consent', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready; t.after(() => app.close());
  const rooms = await createTestRooms(app, ['files', 'other']);
  const a = await connect(app, rooms.files, 'a'), b = await connect(app, rooms.files, 'b');
  const outsider = await connect(app, rooms.other, 'other');
  const r = request('b'); a.send({ ...r, from: 'other' }); await a.next('error');
  a.send(request('other')); assert.equal((await a.next('file-event')).action, 'error');
  a.send(r); const event = await b.next('file-event'); assert.equal(event.from, 'a'); assert.deepEqual(event.file, file); assert.equal(event.action, 'request');
  b.send(control(r.id, 'a', 'accept')); await a.next('file-event', e => e.action === 'accept');
  const restored = await connect(app, rooms.files, 'b', b.peers.reconnectToken);
  await a.next('file-event', e => e.action === 'cancel');
  restored.send(control(r.id, 'a', 'complete')); assert.equal((await restored.next('file-event')).action, 'error');
  assert.equal(outsider.events.some(e => e.type === 'file-event'), false);
  const second = request('b'); a.send(second); await restored.next('file-event', e => e.id === second.id);
  restored.ws.terminate(); await a.next('file-event', e => e.id === second.id && e.action === 'cancel');
});

test('wire files: moderation and voluntary departure cancel accepted or pending deliveries', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready; t.after(() => app.close());
  const creator = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  await new Promise(resolve => creator.once('open', resolve));
  const creation = new Promise(resolve => creator.once('message', raw => resolve(JSON.parse(raw.toString()))));
  creator.send(JSON.stringify({ type: 'create-room' })); const room = await creation; creator.close();
  const host = await connect(app, room.roomId, 'host', undefined, room.hostCredential), receiver = await connect(app, room.roomId, 'receiver');
  const r = request('receiver'); host.send(r); await receiver.next('file-event', e => e.action === 'request');
  receiver.send(control(r.id, 'host', 'accept')); await host.next('file-event', e => e.action === 'accept');
  host.send({ type: 'moderate-room', requestId: crypto.randomUUID(), revision: receiver.peers.roomState.revision, action: 'remove', targetPeerId: 'receiver' });
  assert.equal((await host.next('moderation-result')).ok, true);
  await host.next('file-event', e => e.id === r.id && e.action === 'cancel'); await receiver.next('error', e => e.code === 'REMOVED');
  const other = await connect(app, room.roomId, 'other'), pending = request('other');
  host.send(pending); await other.next('file-event', e => e.action === 'request'); other.send({ type: 'leave' });
  await host.next('file-event', e => e.id === pending.id && e.action === 'cancel');
});
