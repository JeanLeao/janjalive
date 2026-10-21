import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedPosition, ServerClock } from '../src/features/room/watch/timeline.ts';
test('watch timeline: authoritative reference, pause, late join, bounds and clock RTT', () => {
  const state = { position: 10, duration: 30, playing: true, referenceTime: 1000 };
  assert.equal(expectedPosition(state, 6000), 15);
  assert.equal(expectedPosition(state, 999999), 30);
  assert.equal(expectedPosition(state, 0), 10);
  assert.equal(expectedPosition({ ...state, playing: false }, 6000), 10);
  const clock = new ServerClock();
  clock.seed(100000, performance.now()); assert.ok(Math.abs(clock.now() - 100000) < 100);
  const now = performance.now(); clock.sample(now - 100, now, 200000);
  assert.ok(Math.abs(clock.now() - 200050) < 100);
  clock.sample(now - 500, now, 999999); assert.ok(clock.now() < 201000);
});
