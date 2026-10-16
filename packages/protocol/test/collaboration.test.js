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

test('spectator drawing and clear collaborative schemas enforce targetPeerId, bounds, strictness and server-derived identity', () => {
  assert.equal(COLLABORATION_LIMITS.spectatorDrawingPerSecond, 30);
  assert.equal(COLLABORATION_LIMITS.aggregateCollaborativeDrawingPerSecond, 120);
  assert.equal(COLLABORATION_LIMITS.collaborativeStrokesPerCapture, 32);
  assert.equal(COLLABORATION_LIMITS.trackedDrawersPerCapture, 24);

  const strokeId = randomUUID();
  const specDraw = {
    type: 'spectator-drawing',
    targetPeerId: 'host-1',
    streamId: 'capture-1',
    eventId: randomUUID(),
    seq: 1,
    strokeId,
    phase: 'start',
    index: 0,
    points: [{ x: 0.2, y: 0.3 }],
  };
  assert.ok(ClientMessageSchema.safeParse(specDraw).success);

  // Validate phase enum
  for (const phase of ['start', 'move', 'end', 'cancel']) {
    assert.ok(ClientMessageSchema.safeParse({ ...specDraw, phase }).success);
  }
  assert.equal(ClientMessageSchema.safeParse({ ...specDraw, phase: 'invalid' }).success, false);

  // Bounds on points and index
  assert.equal(
    ClientMessageSchema.safeParse({
      ...specDraw,
      points: Array(17).fill({ x: 0.2, y: 0.3 }),
    }).success,
    false
  );
  assert.equal(
    ClientMessageSchema.safeParse({
      ...specDraw,
      index: COLLABORATION_LIMITS.pointsPerStroke + 1,
    }).success,
    false
  );
  assert.equal(
    ClientMessageSchema.safeParse({
      ...specDraw,
      index: -1,
    }).success,
    false
  );

  // Normalized coordinates bounds
  for (const badCoord of [
    { x: -0.01, y: 0.5 },
    { x: 0.5, y: 1.001 },
    { x: NaN, y: 0.5 },
    { x: 0.5, y: Infinity },
  ]) {
    assert.equal(
      ClientMessageSchema.safeParse({
        ...specDraw,
        points: [badCoord],
      }).success,
      false
    );
  }

  // Reject spoofed identity or extra attributes
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
    { strokeId: 'not-a-uuid' },
  ]) {
    assert.equal(ClientMessageSchema.safeParse({ ...specDraw, ...spoof }).success, false);
  }

  // Clear collaborative drawings schema (presenter action)
  const clearCollab = {
    type: 'clear-collaborative-drawings',
    streamId: 'capture-1',
    eventId: randomUUID(),
    seq: 5,
  };
  assert.ok(ClientMessageSchema.safeParse(clearCollab).success);
  for (const spoof of [
    { peerId: 'spoofed' },
    { roomId: 'other' },
    { targetPeerId: 'host-1' },
    { streamId: '' },
    { seq: 0 },
    { eventId: 'invalid' },
  ]) {
    assert.equal(ClientMessageSchema.safeParse({ ...clearCollab, ...spoof }).success, false);
  }

  // Server event distribution requires senderPeerId
  const serverEvent = {
    type: 'collaboration',
    roomId: 'r',
    peerId: 'host-1',
    timestamp: 300,
    event: { ...specDraw, senderPeerId: 'viewer-1', senderNickname: 'Lucas' },
  };
  assert.ok(CollaborationEventSchema.safeParse(serverEvent).success);
  assert.equal(
    CollaborationEventSchema.safeParse({
      ...serverEvent,
      event: { ...specDraw }, // missing senderPeerId
    }).success,
    false
  );

  // Server event for clear-collaborative-drawings
  const clearServerEvent = {
    type: 'collaboration',
    roomId: 'r',
    peerId: 'host-1',
    timestamp: 301,
    event: clearCollab,
  };
  assert.ok(CollaborationEventSchema.safeParse(clearServerEvent).success);

  // update-sharing with drawingEnabled
  const updateSharing = ClientMessageSchema.safeParse({
    type: 'update-sharing',
    active: true,
    streamId: 'capture-1',
    drawingEnabled: true,
    hasAudio: false,
    audioMuted: false,
  });
  assert.ok(updateSharing.success);
  assert.equal(updateSharing.data.drawingEnabled, true);

  assert.equal(
    ClientMessageSchema.safeParse({
      type: 'update-sharing',
      active: true,
      streamId: 'capture-1',
      drawingEnabled: 'yes',
      hasAudio: false,
      audioMuted: false,
    }).success,
    false
  );
});

