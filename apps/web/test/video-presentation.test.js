import test from 'node:test';
import assert from 'node:assert/strict';
import { observeVideoPresentation } from '../src/features/room/diagnostics/video-presentation.ts';

function setup() {
  const stream = {};
  const callbacks = [];
  const cancelled = [];
  let calls = 0;
  const video = { srcObject: stream, paused: false,
    requestVideoFrameCallback(fn) { callbacks.push(fn); return callbacks.length; },
    cancelVideoFrameCallback(id) { cancelled.push(id); },
  };
  const stop = observeVideoPresentation(video, stream, () => calls++);
  return { video, callbacks, cancelled, stop, calls: () => calls };
}

test('presentation is emitted once and observation ends after valid evidence', () => {
  const observation = setup();
  observation.callbacks[0]();
  observation.callbacks[0]();
  assert.equal(observation.calls(), 1);
  assert.equal(observation.callbacks.length, 1);
  observation.stop();
  assert.deepEqual(observation.cancelled, []);
});

test('paused callbacks rearm observation until a frame is presented after resume', () => {
  const observation = setup();
  observation.video.paused = true;
  observation.callbacks[0]();
  assert.equal(observation.calls(), 0);
  assert.equal(observation.callbacks.length, 2);
  observation.callbacks[1]();
  assert.equal(observation.calls(), 0);
  assert.equal(observation.callbacks.length, 3);
  observation.video.paused = false;
  assert.equal(observation.calls(), 0);
  observation.callbacks[2]();
  observation.callbacks[2]();
  assert.equal(observation.calls(), 1);
  assert.equal(observation.callbacks.length, 3);
  observation.stop();
  assert.deepEqual(observation.cancelled, []);
});

test('cleanup before resume cancels the rearmed callback and rejects late evidence', () => {
  const observation = setup();
  observation.video.paused = true;
  observation.callbacks[0]();
  observation.stop();
  assert.deepEqual(observation.cancelled, [2]);
  observation.video.paused = false;
  observation.callbacks[1]();
  assert.equal(observation.calls(), 0);
  assert.equal(observation.callbacks.length, 2);
});

test('cancelled or replaced bindings neither present nor rearm', () => {
  for (const scenario of ['cancelled', 'replaced']) {
    for (const paused of [true, false]) {
      const observation = setup();
      observation.video.paused = paused;
      if (scenario === 'cancelled') observation.stop();
      else observation.video.srcObject = {};
      observation.callbacks[0]();
      assert.equal(observation.calls(), 0);
      assert.equal(observation.callbacks.length, 1);
      observation.stop();
    }
  }
});

test('unsupported presentation API provides no synthetic presentation evidence', () => {
  const stop = observeVideoPresentation({}, {}, () => assert.fail('no evidence'));
  stop();
});

test('cleanup without cancellation API still rejects a late callback', () => {
  const observation = setup();
  delete observation.video.cancelVideoFrameCallback;
  observation.stop();
  observation.callbacks[0]();
  assert.equal(observation.calls(), 0);
  assert.equal(observation.callbacks.length, 1);
});
