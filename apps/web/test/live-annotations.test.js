import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveAnnotations } from '../src/features/room/collaboration/live-annotations.ts';
import { COLLABORATION_LIMITS as L } from '@screen-room/protocol';
const point = { x: .2, y: .3 };
const drawing = (seq, phase = 'start', extra = {}) => ({ type: 'drawing', seq, streamId: 's', strokeId: 'stroke', phase, index: phase === 'start' ? 0 : 1, points: [point], ...extra });
test('expiry uses start deadline, frees resources without receiving more events, independent presenters', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0; const store = new LiveAnnotations(() => now); t.after(() => store.reset());
  store.setCapture('a', 's'); store.setCapture('b', 's');
  store.apply('a', drawing(1)); store.apply('b', drawing(1));
  now = 4000; t.mock.timers.tick(4000); store.apply('a', drawing(2, 'move'));
  assert.equal(store.captures.get('a').strokes.get('stroke').expires, 8000);
  now = 8000; t.mock.timers.tick(4000);
  assert.equal(store.captures.get('a').strokes.size, 0); assert.equal(store.captures.get('b').strokes.size, 0);
  store.apply('a', drawing(3, 'end', { index: 2 })); assert.equal(store.captures.get('a').strokes.size, 0);
});
test('missing, duplicate, out of order, cleared, stale capture and reconnect events do not create segments', t => {
  const store = new LiveAnnotations(); t.after(() => store.reset()); store.setCapture('a', 's');
  store.apply('a', drawing(2, 'move')); assert.equal(store.captures.get('a').strokes.size, 0);
  store.apply('a', drawing(1)); assert.equal(store.captures.get('a').strokes.size, 0);
  store.apply('a', drawing(3)); store.apply('a', drawing(3));
  assert.equal(store.captures.get('a').strokes.size, 1);
  store.apply('a', drawing(4, 'move', { index: 5 })); assert.equal(store.captures.get('a').strokes.size, 0);
  store.apply('a', drawing(5)); store.apply('a', { type: 'clear-annotations', streamId: 's', seq: 6 });
  store.apply('a', drawing(7, 'end')); assert.equal(store.captures.get('a').strokes.size, 0);
  store.setCapture('a', 'new'); store.apply('a', drawing(8)); assert.equal(store.captures.get('a').strokes.size, 0);
  store.reset(); store.setCapture('a', 's'); store.apply('a', drawing(9, 'move')); assert.equal(store.captures.get('a').strokes.size, 0);
  store.apply('a', drawing(10), L.annotationTtlMs); assert.equal(store.captures.get('a').strokes.size, 0);
});
test('bounded memory, manual clear isolation and laser expiry', t => {
  let now = 0; const store = new LiveAnnotations(() => now); t.after(() => store.reset());
  store.setCapture('a', 's'); store.setCapture('b', 's');
  for (let i = 1; i <= 100; i++) store.apply('a', drawing(i, 'start', { strokeId: String(i) }));
  assert.equal(store.captures.get('a').strokes.size, L.strokesPerCapture);
  store.apply('b', drawing(1)); store.apply('a', { type: 'clear-annotations', seq: 101, streamId: 's' });
  assert.equal(store.captures.get('a').strokes.size, 0); assert.equal(store.captures.get('b').strokes.size, 1);
  store.apply('a', { type: 'laser', point, seq: 102, streamId: 's' }); now = L.laserTtlMs; store.expire();
  assert.equal(store.captures.get('a').laser, null);
});

const pointerEvt = (seq, senderPeerId = 'v1', extra = {}) => ({
  type: 'point',
  targetPeerId: 'a',
  streamId: 's',
  eventId: `evt-${senderPeerId}-${seq}`,
  seq,
  point,
  senderPeerId,
  senderNickname: `User ${senderPeerId}`,
  ...extra,
});

test('spectator pointing: independent expiry, bounded markers per capture, presenter sequence isolation and clearPointers', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  const store = new LiveAnnotations(() => now);
  t.after(() => store.reset());
  store.setCapture('a', 's');
  store.setCapture('b', 's-other');

  // Presenter draws at seq 5
  store.apply('a', drawing(5));
  assert.equal(store.captures.get('a').seq, 5);

  // Spectator v1 points with seq 1 (must not be rejected by presenter seq 5, nor alter presenter seq)
  store.apply('a', pointerEvt(1, 'v1'));
  assert.equal(store.captures.get('a').pointers.size, 1);
  assert.equal(store.captures.get('a').seq, 5);

  // Duplicate seq or eventId from v1 is ignored; presenter seq 5 duplicate is still ignored while seq 6 is accepted
  store.apply('a', pointerEvt(1, 'v1', { point: { x: 0.9, y: 0.9 } }));
  assert.deepEqual(store.captures.get('a').pointers.get('v1').point, point);
  store.apply('a', drawing(5, 'start', { strokeId: 's2' }));
  assert.equal(store.captures.get('a').strokes.size, 1);
  store.apply('a', drawing(6, 'start', { strokeId: 's2' }));
  assert.equal(store.captures.get('a').strokes.size, 2);

  // Clear annotations by presenter clears strokes/laser but does not wipe spectator pointers; clearPointers clears only pointers
  store.apply('a', { type: 'clear-annotations', streamId: 's', eventId: 'c1', seq: 7 });
  assert.equal(store.captures.get('a').strokes.size, 0);
  assert.equal(store.captures.get('a').pointers.size, 1);
  store.clearPointers('a');
  assert.equal(store.captures.get('a').pointers.size, 0);

  // Bounded markers per capture (L.pointersPerCapture) and isolation between captures
  for (let i = 1; i <= L.pointersPerCapture + 3; i++) {
    store.apply('a', pointerEvt(2, `viewer-${i}`));
  }
  assert.equal(store.captures.get('a').pointers.size, L.pointersPerCapture);
  assert.equal(store.captures.get('a').pointers.has('viewer-1'), false);
  assert.equal(store.captures.get('a').pointers.has(`viewer-${L.pointersPerCapture + 3}`), true);
  assert.equal(store.captures.get('b').pointers.size, 0);

  // Automatic expiration without new events
  now = L.pointTtlMs;
  t.mock.timers.tick(L.pointTtlMs);
  assert.equal(store.captures.get('a').pointers.size, 0);
});
