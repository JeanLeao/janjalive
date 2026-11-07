import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { RoomRegistry } from '../dist/room-state.js';
import { createSignalServer } from '../dist/server.js';
import { ClientMessageSchema, CameraAccessSchema } from '@screen-room/protocol';

function fixture() {
  const rooms = new RoomRegistry();
  const created = rooms.createRoom();
  const room = created.roomId;
  rooms.join(room, 'host', undefined, undefined, created.hostCredential);
  rooms.join(room, 'viewer'); rooms.join(room, 'other');
  const request = () => { rooms.requestCamera(room, 'viewer', randomUUID()); return rooms.cameraAccessSnapshot(room).entries[0]; };
  return { rooms, room, created, request };
}

test('camera grants: pending cannot publish; only the host can approve the current server nonce', () => {
  const { rooms, room, request } = fixture();
  assert.equal(rooms.updateCamera(room, 'viewer', true).active, false);
  const entry = request();
  assert.equal(rooms.updateCamera(room, 'viewer', true).active, false);
  assert.throws(() => rooms.decideCamera(room, 'other', 'viewer', entry.requestId, true), /líder/);
  assert.throws(() => rooms.decideCamera(room, 'host', 'viewer', randomUUID(), true), /mudou/);
  rooms.decideCamera(room, 'host', 'viewer', entry.requestId, true);
  assert.equal(rooms.updateCamera(room, 'viewer', true).active, true);
  assert.equal(CameraAccessSchema.safeParse(rooms.cameraAccessSnapshot(room)).success, true);
});

test('denial, cancellation and revocation remove grants; stale decisions never approve a new request', () => {
  const { rooms, room, request } = fixture();
  const first = request(); rooms.cancelCameraRequest(room, 'viewer', first.requestId);
  // Even reusing a client UUID yields a new authoritative server nonce.
  rooms.requestCamera(room, 'viewer', first.requestId);
  const second = rooms.cameraAccessSnapshot(room).entries[0];
  assert.notEqual(second.requestId, first.requestId);
  assert.throws(() => rooms.decideCamera(room, 'host', 'viewer', first.requestId, true));
  rooms.decideCamera(room, 'host', 'viewer', second.requestId, false);
  const third = request(); rooms.decideCamera(room, 'host', 'viewer', third.requestId, true);
  rooms.updateCamera(room, 'viewer', true);
  rooms.decideCamera(room, 'host', 'viewer', third.requestId, false, true);
  assert.equal(rooms.getParticipants(room).find(p => p.peerId === 'viewer').camera.active, false);
  assert.equal(rooms.cameraAccessSnapshot(room).entries.length, 0);
  assert.equal(rooms.updateCamera(room, 'viewer', true).active, false);
});

for (const who of ['viewer', 'host']) test(`camera grants expire on ${who} disconnect and do not return on recovery`, () => {
  const { rooms, room, created, request } = fixture();
  const entry = request(); rooms.decideCamera(room, 'host', 'viewer', entry.requestId, true);
  rooms.updateCamera(room, 'viewer', true);
  const token = rooms.getReconnectToken(room, who);
  rooms.leave(room, who, false);
  assert.equal(rooms.cameraAccessSnapshot(room).entries.length, 0);
  rooms.join(room, who, undefined, token, who === 'host' ? created.hostCredential : undefined);
  assert.equal(rooms.updateCamera(room, 'viewer', true).active, false);
  rooms.clearAllRecovery();
});

test('socket replacement, late join, room isolation, request limits and presenter compatibility', () => {
  const { rooms, room, request } = fixture();
  const entry = request(); rooms.decideCamera(room, 'host', 'viewer', entry.requestId, true);
  rooms.join(room, 'late'); assert.equal(rooms.cameraAccessSnapshot(room).entries[0].status, 'approved');
  const otherRoom = rooms.createRoom().roomId;
  assert.throws(() => rooms.decideCamera(otherRoom, 'host', 'viewer', entry.requestId, true));
  rooms.join(room, 'viewer', undefined, rooms.getReconnectToken(room, 'viewer'));
  assert.equal(rooms.cameraAccessSnapshot(room).entries.length, 0);
  for (let i = 0; i < 5; i++) {
    rooms.requestCamera(room, 'other', randomUUID(), 100);
    rooms.cancelCameraRequest(room, 'other', rooms.cameraAccessSnapshot(room).entries[0].requestId);
  }
  assert.throws(() => rooms.requestCamera(room, 'other', randomUUID(), 100), /Aguarde/);
  rooms.updateSharing(room, 'host', { active: true, hasAudio: false, audioMuted: false });
  assert.equal(rooms.updateCamera(room, 'host', true).active, true);
  rooms.updateSharing(room, 'host', { active: false, hasAudio: false, audioMuted: false });
  assert.equal(rooms.updateCamera(room, 'host', true).active, false);
  for (const value of [{ type: 'decide-camera', targetPeerId: 'viewer', requestId: 'bad', allowed: true },
    { type: 'request-camera', requestId: randomUUID(), hostAuthorized: true }]) assert.equal(ClientMessageSchema.safeParse(value).success, false);
});

async function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`), events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { ws, send: value => ws.send(JSON.stringify(value)), next: async (type, predicate = () => true) => {
    for (let i = 0; i < 200; i++) {
      const index = events.findIndex(event => event.type === type && predicate(event));
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  } };
}

test('real signaling enforces host socket authority and broadcasts revocation to all participants', async t => {
  const app = createSignalServer({ host: '127.0.0.1', port: 0 }); await app.ready;
  t.after(() => app.close());
  const host = await client(app.port), viewer = await client(app.port), attacker = await client(app.port);
  host.send({ type: 'create-room' }); const created = await host.next('room-created');
  host.send({ type: 'join', roomId: created.roomId, peerId: 'host', hostCredential: created.hostCredential }); await host.next('peers');
  viewer.send({ type: 'join', roomId: created.roomId, peerId: 'viewer' }); await viewer.next('peers');
  attacker.send({ type: 'join', roomId: created.roomId, peerId: 'attacker' }); await attacker.next('peers');
  viewer.send({ type: 'request-camera', requestId: randomUUID() });
  const entry = (await host.next('camera-access', event => event.entries.length === 1)).entries[0];
  attacker.send({ type: 'decide-camera', targetPeerId: 'viewer', requestId: entry.requestId, allowed: true });
  await attacker.next('camera-access-error');
  host.send({ type: 'decide-camera', targetPeerId: 'viewer', requestId: entry.requestId, allowed: true });
  await viewer.next('camera-access', event => event.entries[0]?.status === 'approved');
  viewer.send({ type: 'update-camera', active: true });
  await host.next('camera-updated', event => event.peerId === 'viewer' && event.active);
  host.send({ type: 'revoke-camera', targetPeerId: 'viewer', requestId: entry.requestId });
  await viewer.next('camera-access', event => !event.entries.length);
  await host.next('camera-updated', event => event.peerId === 'viewer' && !event.active);
  viewer.send({ type: 'update-camera', active: true });
  assert.equal((await attacker.next('camera-updated', event => event.peerId === 'viewer' && !event.active)).active, false);
});
