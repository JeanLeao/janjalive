import test from 'node:test';
import assert from 'node:assert/strict';
import { observeVideoPresentation } from '../src/features/room/diagnostics/video-presentation.ts';

test('presentation uses one callback and ignores cancelled, paused or replaced bindings', () => {
  for (const scenario of ['presented', 'cancelled', 'paused', 'replaced']) {
    const stream = {};
    let callback, calls = 0, cancelled;
    const video = { srcObject: stream, paused: false,
      requestVideoFrameCallback(fn) { callback = fn; return 7; },
      cancelVideoFrameCallback(id) { cancelled = id; },
    };
    const stop = observeVideoPresentation(video, stream, () => calls++);
    if (scenario === 'cancelled') stop();
    if (scenario === 'paused') video.paused = true;
    if (scenario === 'replaced') video.srcObject = {};
    callback();
    assert.equal(calls, scenario === 'presented' ? 1 : 0);
    stop(); assert.equal(cancelled, 7);
  }
});

test('unsupported presentation API provides no synthetic presentation evidence', () => {
  const stop = observeVideoPresentation({}, {}, () => assert.fail('no evidence'));
  stop();
});

test('cleanup without cancellation API still rejects a late callback', () => {
  const stream = {};
  let callback;
  const video = { srcObject: stream, paused: false, requestVideoFrameCallback(fn) { callback = fn; return 1; } };
  observeVideoPresentation(video, stream, () => assert.fail('obsolete binding'))();
  callback();
});
