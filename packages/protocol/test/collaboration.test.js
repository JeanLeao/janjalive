import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClientMessageSchema, CollaborationEventSchema } from '../dist/index.js';
const laser = { type: 'laser', streamId: 'capture', eventId: randomUUID(), seq: 1, point: { x: 0, y: 1 } };
test('collaboration schemas enforce bounded finite normalized coordinates and trusted identity', () => {
  assert.ok(ClientMessageSchema.safeParse(laser).success);
  for (const point of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: -.1, y: 0 }, { x: 0, y: 1.01 }]) assert.equal(ClientMessageSchema.safeParse({ ...laser, point }).success, false);
  for (const extra of [{ peerId: 'victim' }, { roomId: 'other' }, { seq: 0 }, { eventId: 'bad' }, { streamId: '' }]) assert.equal(ClientMessageSchema.safeParse({ ...laser, ...extra }).success, false);
  const draw = { type: 'drawing', streamId: 'capture', eventId: randomUUID(), seq: 2, strokeId: randomUUID(), phase: 'start', index: 0, points: [{ x: .5, y: .5 }] };
  assert.ok(ClientMessageSchema.safeParse(draw).success);
  assert.equal(ClientMessageSchema.safeParse({ ...draw, points: Array(17).fill(laser.point) }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ ...draw, index: 513 }).success, false);
  assert.ok(CollaborationEventSchema.safeParse({ type: 'collaboration', roomId: 'r', peerId: 'p', timestamp: 100, event: laser }).success);
});
