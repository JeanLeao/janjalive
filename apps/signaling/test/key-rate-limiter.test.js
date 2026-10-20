import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyRateLimiter } from '../dist/key-rate-limiter.js';

test('F12: saturation retains active counters, blocks untracked keys, and expires', () => {
  const limiter = new KeyRateLimiter();
  for (let i = 0; i < 5000; i++) limiter.recordFailure(`key-${i}`, 0);
  assert.equal(limiter.size, 5000);
  for (let i = 0; i < 100; i++) {
    assert.equal(limiter.isLimited(`overflow-${i}`, 1), true);
    limiter.recordFailure(`overflow-${i}`, 1);
    assert.equal(limiter.size, 5000);
  }
  for (let i = 0; i < 4; i++) {
    assert.equal(limiter.isLimited('key-0', 1000), false);
    limiter.recordFailure('key-0', 1000);
  }
  assert.equal(limiter.isLimited('key-0', 60_000), true);
  assert.equal(limiter.isLimited('new-key', 60_000), false);
  limiter.recordFailure('new-key', 60_000);
  assert.equal(limiter.size, 2);
  assert.equal(limiter.isLimited('key-0', 61_000), false);
  assert.equal(limiter.isLimited('new-key', 120_000), false);
});
