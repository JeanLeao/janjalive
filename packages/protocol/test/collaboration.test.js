import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClientMessageSchema, CollaborationEventSchema, COLLABORATION_LIMITS } from '../dist/index.js';
const laser = { type: 'laser', streamId: 'capture', eventId: randomUUID(), seq: 1, point: { x: 0, y: 1 } };
test('collaboration schemas enforce bounded finite normalized coordinates and trusted identity', () => {
  assert.equal(COLLABORATION_LIMITS.trackedPointersPerCapture, 24);
  assert.ok(ClientMessageSchema.safeParse(laser).success);
  for (const point of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: -.1, y: 0 }, { x: 0, y: 1.01 }]) assert.equal(ClientMessageSchema.safeParse({ ...laser, point }).success, false);
  for (const extra of [{ peerId: 'victim' }, { roomId: 'other' }, { seq: 0 }, { eventId: 'bad' }, { streamId: '' }]) assert.equal(ClientMessageSchema.safeParse({ ...laser, ...extra }).success, false);
  const draw = { type: 'drawing', streamId: 'capture', eventId: randomUUID(), seq: 2, strokeId: randomUUID(), phase: 'start', index: 0, points: [{ x: .5, y: .5 }] };
  assert.ok(ClientMessageSchema.safeParse(draw).success);
  assert.equal(ClientMessageSchema.safeParse({ ...draw, points: Array(17).fill(laser.point) }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ ...draw, index: 513 }).success, false);
  assert.ok(CollaborationEventSchema.safeParse({ type: 'collaboration', roomId: 'r', peerId: 'p', timestamp: 100, event: laser }).success);
});

test('spectator pointing schemas enforce targetPeerId, normalized coordinates, strictness and prevent sender identity spoofing', () => {
  const point = {
    type: 'point',
    targetPeerId: 'host-1',
    streamId: 'capture-1',
    eventId: randomUUID(),
    seq: 1,
    point: { x: 0.4, y: 0.6 },
  };
  assert.ok(ClientMessageSchema.safeParse(point).success);
  for (const badCoord of [
    { x: -0.01, y: 0.5 },
    { x: 0.5, y: 1.001 },
    { x: NaN, y: 0.5 },
    { x: 0.5, y: Infinity },
    null,
  ]) {
    assert.equal(ClientMessageSchema.safeParse({ ...point, point: badCoord }).success, false);
  }
  for (const spoof of [
    { senderPeerId: 'spoofed' },
    { senderNickname: 'Admin' },
    { peerId: 'spoofed' },
    { roomId: 'other' },
    { targetPeerId: '' },
    { targetPeerId: 'x'.repeat(65) },
    { streamId: '' },
    { seq: 0 },
    { eventId: 'not-a-uuid' },
  ]) {
    assert.equal(ClientMessageSchema.safeParse({ ...point, ...spoof }).success, false);
  }
  const serverEvent = {
    type: 'collaboration',
    roomId: 'r',
    peerId: 'host-1',
    timestamp: 200,
    event: { ...point, senderPeerId: 'viewer-1', senderNickname: 'Ana' },
  };
  assert.ok(CollaborationEventSchema.safeParse(serverEvent).success);
  assert.equal(
    CollaborationEventSchema.safeParse({
      ...serverEvent,
      event: { ...point }, // missing senderPeerId
    }).success,
    false
  );
  const updateSharing = ClientMessageSchema.safeParse({
    type: 'update-sharing',
    active: true,
    streamId: 'capture-1',
    pointingEnabled: false,
    hasAudio: false,
    audioMuted: false,
  });
  assert.ok(updateSharing.success);
  assert.equal(updateSharing.data.pointingEnabled, false);
  assert.equal(
    ClientMessageSchema.safeParse({
      type: 'update-sharing',
      active: true,
      streamId: 'capture-1',
      pointingEnabled: 'no',
      hasAudio: false,
      audioMuted: false,
    }).success,
    false
  );
});
