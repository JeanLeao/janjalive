import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QUALITY, normalizeQuality, resolveQuality, validFrameRates, downgradeQuality } from '../dist/index.js';

test('approved quality matrix and default', () => {
  assert.deepEqual(DEFAULT_QUALITY, { priority: 'sharpness', profile: 'balanced', fps: 30 });
  const rows = [
    ['sharpness', 'economy', 1280, 720, 1600000, [20, 30]],
    ['sharpness', 'balanced', 1920, 1080, 3000000, [20, 30]],
    ['sharpness', 'ultra', 2560, 1440, 6000000, [20, 30]],
    ['motion', 'economy', 1280, 720, 2000000, [30]],
    ['motion', 'balanced', 1280, 720, 4000000, [30, 60]],
    ['motion', 'ultra', 1920, 1080, 8000000, [30, 60]],
  ];
  for (const [priority, profile, width, height, maxBitrate, rates] of rows) {
    assert.deepEqual(validFrameRates(priority, profile), rates);
    for (const fps of rates) {
      const actual = resolveQuality({ priority, profile, fps });
      assert.deepEqual([actual.width, actual.height, actual.maxBitrate, actual.maxFramerate], [width, height, maxBitrate, fps]);
      assert.equal(actual.contentHint, priority === 'sharpness' ? 'text' : 'motion');
      assert.equal(actual.degradationPreference, priority === 'sharpness' ? 'maintain-resolution' : 'maintain-framerate');
    }
  }
});
test('transitions preserve valid choices and clamp invalid FPS; downgrade preserves priority', () => {
  assert.equal(normalizeQuality({ ...DEFAULT_QUALITY, priority: 'motion' }).fps, 30);
  assert.equal(normalizeQuality({ priority: 'sharpness', profile: 'ultra', fps: 60 }).fps, 30);
  assert.equal(normalizeQuality({ priority: 'motion', profile: 'economy', fps: 60 }).fps, 30);
  const ultra = { priority: 'motion', profile: 'ultra', fps: 60 };
  const balanced = downgradeQuality(ultra);
  assert.deepEqual(balanced, { ...ultra, profile: 'balanced' });
  assert.deepEqual(downgradeQuality(balanced), { priority: 'motion', profile: 'economy', fps: 30 });
  assert.equal(normalizeQuality({ ...DEFAULT_QUALITY, profile: 'ultra' }).fps, 30);
  assert.equal(normalizeQuality({ priority: 'sharpness', profile: 'ultra', fps: 20 }).fps, 20);
});

test('automatic recovery respects each manual ceiling and restores the original normalized FPS', async () => {
  const { recoverQuality } = await import('../dist/index.js');
  for (const priority of ['sharpness', 'motion']) for (const profile of ['economy', 'balanced', 'ultra']) {
    for (const fps of validFrameRates(priority, profile)) {
      const preference = { priority, profile, fps };
      let current = downgradeQuality(downgradeQuality(preference));
      assert.equal(current.profile, 'economy');
      current = recoverQuality(current, preference);
      assert.equal(current.profile, profile === 'economy' ? 'economy' : 'balanced');
      current = recoverQuality(current, preference);
      assert.deepEqual(current, preference);
      assert.deepEqual(recoverQuality(current, preference), preference);
    }
  }
});
