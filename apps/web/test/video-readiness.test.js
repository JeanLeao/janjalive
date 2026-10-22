import test from 'node:test';
import assert from 'node:assert/strict';
import { videoReadiness } from '../src/features/room/watch/video-readiness.ts';
import { prepareVideo } from '../src/features/room/watch/prepare-video.ts';

function media({ recover = true, seekable = true } = {}) {
  const positions = [];
  let position = 0;
  const video = { duration: Infinity, videoWidth: 640, videoHeight: 360, readyState: 2, seeking: false,
    get currentTime() { return position; },
    set currentTime(value) {
      positions.push(value); this.seeking = true;
      queueMicrotask(() => {
        if (!seekable) return;
        if (recover) this.duration = 4;
        position = Math.min(value, 4); this.seeking = false; this.onseeked?.();
      });
    },
  };
  return { video, positions };
}
test('WebM recovery waits for completed end, probe and return seeks; bytes and hash remain original', async t => {
  const { video, positions } = media();
  video.canPlayType = () => 'probably'; video.pause = () => {}; video.removeAttribute = () => {}; video.load = () => {};
  const old = globalThis.document; globalThis.document = { createElement: () => video };
  t.after(() => { globalThis.document = old; });
  const revoked = []; t.mock.method(URL, 'createObjectURL', () => 'blob:original'); t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  const file = new File(['original recorded bytes'], 'clip.webm', { type: 'video/webm;codecs=vp9,opus' });
  const result = await prepareVideo(file, new AbortController().signal, true);
  assert.equal(result.duration, 4); assert.deepEqual(positions, [1e10, 1, 0]);
  assert.equal(await result.source.text(), await file.text()); assert.equal(result.metadata.size, file.size);
  const { createHash } = await import('node:crypto');
  assert.equal(result.metadata.sha256, createHash('sha256').update(await file.text()).digest('hex'));
  assert.deepEqual(revoked, ['blob:original']); assert.equal(video.onseeked, null); assert.equal(video.onloadeddata, null);
});
test('finite decoded media passes directly; Infinity requires explicit recovery', async () => {
  const { video, positions } = media(); video.duration = 4;
  assert.equal(await videoReadiness(video, new AbortController().signal), 4); assert.deepEqual(positions, []);
  video.duration = Infinity;
  await assert.rejects(videoReadiness(video, new AbortController().signal), /duração/);
});
test('unrecoverable, inconsistent, dimensionless and invalid media are rejected', async () => {
  for (const change of [v => {}, v => { v.duration = 0; }, v => { v.videoWidth = 0; }, v => { v.duration = NaN; }, v => { v.duration = 100; }]) {
    const { video } = media({ recover: false }); change(video);
    await assert.rejects(videoReadiness(video, new AbortController().signal, { recoverWebmDuration: true, expectedDuration: 4 }), /duração/);
  }
});
test('assigning currentTime or durationchange alone cannot validate seek; timeout cleans handlers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { video } = media({ seekable: false });
  const pending = videoReadiness(video, new AbortController().signal, { recoverWebmDuration: true });
  video.duration = 4; video.ondurationchange?.();
  const rejected = assert.rejects(pending, /decodificar|duração/);
  t.mock.timers.tick(15000); await rejected;
  assert.equal(video.onseeked, null); assert.equal(video.onerror, null);
});
test('abort during recovery and already aborted signals release all handlers', async () => {
  for (const immediate of [false, true]) {
    const { video } = media({ seekable: false }); const abort = new AbortController();
    if (immediate) abort.abort();
    const pending = videoReadiness(video, abort.signal, { recoverWebmDuration: true });
    abort.abort(); await assert.rejects(pending, /cancelada/);
    assert.equal(video.onseeked, null); assert.equal(video.onloadeddata, null);
  }
});
test('empty and oversized files fail before a temporary element or URL is needed', async () => {
  for (const size of [0, 20 * 1048576 + 1]) {
    await assert.rejects(prepareVideo(new File([new Uint8Array(size)], 'clip.webm'), new AbortController().signal, true), /20 MiB/);
  }
});
