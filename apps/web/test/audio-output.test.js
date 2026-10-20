import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioOutputRouter } from '../src/features/room/media/audio-output.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const calls = [];
  const video = { muted: false, sinkId: '', setSinkId(id) {
    return new Promise((resolve, reject) => calls.push({ id, resolve: () => { video.sinkId = id; resolve(); }, reject }));
  } };
  const router = new AudioOutputRouter();
  let resumed = 0;
  const remove = router.register(video, () => resumed++);
  return { router, video, calls, remove, resumed: () => resumed };
}
test('rapid selections serialize writes and keep sound suspended until latest sink applies', async () => {
  const { router, video, calls, resumed } = setup();
  router.select('a'); router.select('b'); router.select('c');
  assert.equal(calls.length, 1);
  assert.equal(video.muted, true);
  assert.equal(router.allowed(video), false);
  calls[0].resolve(); await tick();
  assert.equal(calls[1].id, 'c');
  assert.equal(resumed(), 0);
  calls[1].resolve(); await tick();
  assert.equal(video.sinkId, 'c');
  assert.equal(router.allowed(video), true);
  assert.equal(resumed(), 1);
});
test('failure and removal latch silence; explicit default recovers', async () => {
  const { router, video, calls } = setup();
  router.select('a'); calls[0].reject(new Error('denied')); await tick();
  assert.equal(router.unavailable, true);
  assert.equal(video.muted, true);
  router.select(''); calls[1].resolve(); await tick();
  assert.equal(router.allowed(video), true);
  router.select('a'); calls[2].resolve(); await tick();
  router.suspend();
  assert.equal(router.allowed(video), false);
  assert.equal(video.muted, true);
  const other = { muted: false };
  router.register(other, () => assert.fail('must remain suspended'));
  assert.equal(other.muted, true);
});
test('same element reattachment waits for old writes; detached completion never resumes', async () => {
  const { router, video, calls, remove, resumed } = setup();
  router.select('a'); remove(); router.select('b');
  let newResumes = 0;
  router.register(video, () => newResumes++);
  assert.equal(calls.length, 1);
  calls[0].resolve(); await tick();
  assert.equal(resumed(), 0);
  assert.equal(calls[1].id, 'b');
  calls[1].resolve(); await tick();
  assert.equal(video.sinkId, 'b');
  assert.equal(newResumes, 1);
});
test('default works without API; explicit preference fails closed on recreated elements', async () => {
  const router = new AudioOutputRouter();
  const video = { muted: false };
  router.register(video, () => {});
  assert.equal(router.allowed(video), true);
  router.select('a'); await tick();
  assert.equal(router.unavailable, true);
  assert.equal(video.muted, true);
});
test('stale rejection does not suspend newer choice; default reattachment stays gated behind old call', async () => {
  const { router, video, calls, remove } = setup();
  router.select('a'); router.select('b');
  calls[0].reject(new Error('old denial')); await tick();
  assert.equal(router.unavailable, false);
  calls[1].resolve(); await tick();
  assert.equal(router.allowed(video), true);
  router.select('c'); remove(); router.select('');
  router.register(video, () => {});
  assert.equal(router.allowed(video), false);
  calls[2].resolve(); await tick();
  assert.equal(calls[3].id, '');
  assert.equal(router.allowed(video), false);
  calls[3].resolve(); await tick();
  assert.equal(router.allowed(video), true);
  assert.equal(video.sinkId, '');
});
test('independent element promises resolving out of order never enable an obsolete route', async () => {
  const first = setup(); const second = setup();
  first.router.register(second.video, () => {});
  first.router.select('a'); first.router.select('b');
  second.calls[0].resolve(); await tick();
  second.calls[1].resolve(); await tick();
  assert.equal(first.router.allowed(second.video), true);
  assert.equal(first.router.allowed(first.video), false);
  first.calls[0].resolve(); await tick();
  assert.equal(first.router.allowed(first.video), false);
  first.calls[1].resolve(); await tick();
  assert.equal(first.video.sinkId, 'b');
  assert.equal(second.video.sinkId, 'b');
});
test('reused element with a previously applied non-default sink must apply explicit default', async () => {
  const { router, video, calls, remove } = setup();
  router.select('a'); calls[0].resolve(); await tick();
  remove(); router.select('');
  router.register(video, () => {});
  assert.equal(router.allowed(video), false);
  assert.equal(calls[1].id, '');
  calls[1].resolve(); await tick();
  assert.equal(video.sinkId, '');
  assert.equal(router.allowed(video), true);
});
