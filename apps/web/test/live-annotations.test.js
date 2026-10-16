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
  assert.equal(store.captures.get('a').pointerSeqs.size, 0);
});

test('spectator pointing metadata bounds: many successive senders, LRU eviction and deduplication preservation', t => {
  const store = new LiveAnnotations();
  t.after(() => store.reset());
  store.setCapture('a', 's');

  const maxTracked = L.trackedPointersPerCapture;
  assert.equal(maxTracked, 24);

  // Send point events from 100 distinct successive senders
  for (let i = 1; i <= 100; i++) {
    store.apply('a', pointerEvt(1, `viewer-${i}`));
    assert.ok(store.captures.get('a').pointers.size <= L.pointersPerCapture);
    assert.ok(store.captures.get('a').pointerSeqs.size <= maxTracked);
    assert.ok(store.captures.get('a').pointerEventIds.length <= 32);
  }

  const capture = store.captures.get('a');
  // Visual pointers capped at L.pointersPerCapture (8)
  assert.equal(capture.pointers.size, L.pointersPerCapture);
  // Metadata capped at maxTracked (24)
  assert.equal(capture.pointerSeqs.size, maxTracked);

  // Oldest viewers (1..76) have been evicted; newest (77..100) are retained
  assert.equal(capture.pointerSeqs.has('viewer-1'), false);
  assert.equal(capture.pointerSeqs.has('viewer-76'), false);
  assert.equal(capture.pointerSeqs.has('viewer-77'), true);
  assert.equal(capture.pointerSeqs.has('viewer-100'), true);

  // Deduplication and ordering for preserved senders
  // 1. Duplicate seq is rejected and does not update point
  const originalPoint = capture.pointers.get('viewer-100').point;
  store.apply('a', pointerEvt(1, 'viewer-100', { point: { x: 0.8, y: 0.8 } }));
  assert.deepEqual(capture.pointers.get('viewer-100').point, originalPoint);

  // 2. Out-of-order lower seq is rejected
  store.apply('a', pointerEvt(0, 'viewer-100', { point: { x: 0.8, y: 0.8 } }));
  assert.deepEqual(capture.pointers.get('viewer-100').point, originalPoint);

  // 3. Duplicate eventId is rejected
  store.apply('a', pointerEvt(2, 'viewer-100', { eventId: 'evt-viewer-100-1', point: { x: 0.8, y: 0.8 } }));
  assert.deepEqual(capture.pointers.get('viewer-100').point, originalPoint);

  // 4. Higher seq with new eventId is accepted and updates position
  store.apply('a', pointerEvt(2, 'viewer-100', { point: { x: 0.7, y: 0.7 } }));
  assert.deepEqual(capture.pointers.get('viewer-100').point, { x: 0.7, y: 0.7 });
  assert.equal(capture.pointerSeqs.get('viewer-100').seq, 2);

  // 5. Stale event (ageMs >= L.pointTtlMs) is discarded
  store.apply('a', pointerEvt(3, 'viewer-100', { point: { x: 0.9, y: 0.9 } }), L.pointTtlMs);
  assert.deepEqual(capture.pointers.get('viewer-100').point, { x: 0.7, y: 0.7 });
  assert.equal(capture.pointerSeqs.get('viewer-100').seq, 2);
});

test('spectator pointing metadata cleanup on expiration and rejection of stale events', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  const store = new LiveAnnotations(() => now);
  t.after(() => store.reset());
  store.setCapture('a', 's');

  // 10 viewers point at t=0
  for (let i = 1; i <= 10; i++) {
    store.apply('a', pointerEvt(1, `viewer-${i}`));
  }
  assert.equal(store.captures.get('a').pointers.size, L.pointersPerCapture);
  assert.equal(store.captures.get('a').pointerSeqs.size, 10);

  // Advance time to expiration
  now = L.pointTtlMs;
  t.mock.timers.tick(L.pointTtlMs);

  // Both rendered pointers and pointerSeqs metadata are fully purged
  assert.equal(store.captures.get('a').pointers.size, 0);
  assert.equal(store.captures.get('a').pointerSeqs.size, 0);

  // After expiration, a new point event from viewer-1 is accepted with fresh sequence
  store.apply('a', pointerEvt(2, 'viewer-1', { point: { x: 0.5, y: 0.5 } }));
  assert.equal(store.captures.get('a').pointers.size, 1);
  assert.equal(store.captures.get('a').pointerSeqs.size, 1);
  assert.deepEqual(store.captures.get('a').pointers.get('viewer-1').point, { x: 0.5, y: 0.5 });
});

test('spectator departure: removePeer cleans up pointers and sequence metadata without affecting presenter or other spectators', t => {
  const store = new LiveAnnotations();
  t.after(() => store.reset());
  store.setCapture('a', 's-a');
  store.setCapture('b', 's-b');

  // Presenter A has strokes and laser
  store.apply('a', drawing(1, 'start', { streamId: 's-a', strokeId: 'stroke-a' }));
  store.apply('a', { type: 'laser', point, seq: 2, streamId: 's-a' });

  // Presenter B has strokes and laser
  store.apply('b', drawing(1, 'start', { streamId: 's-b', strokeId: 'stroke-b' }));
  store.apply('b', { type: 'laser', point, seq: 2, streamId: 's-b' });

  // Spectator v1 and v2 point at A; v1 also points at B
  store.apply('a', pointerEvt(1, 'v1', { streamId: 's-a' }));
  store.apply('a', pointerEvt(1, 'v2', { streamId: 's-a' }));
  store.apply('b', pointerEvt(1, 'v1', { streamId: 's-b', targetPeerId: 'b' }));

  assert.equal(store.captures.get('a').strokes.size, 1);
  assert.ok(store.captures.get('a').laser !== null);
  assert.equal(store.captures.get('a').pointers.size, 2);
  assert.equal(store.captures.get('a').pointerSeqs.size, 2);

  assert.equal(store.captures.get('b').strokes.size, 1);
  assert.ok(store.captures.get('b').laser !== null);
  assert.equal(store.captures.get('b').pointers.size, 1);
  assert.equal(store.captures.get('b').pointerSeqs.size, 1);

  // Spectator v1 leaves the room
  store.removePeer('v1');

  // Presenter A's drawing and laser are intact; v1 is removed, v2 is intact
  assert.equal(store.captures.get('a').strokes.size, 1);
  assert.ok(store.captures.get('a').laser !== null);
  assert.equal(store.captures.get('a').seq, 2);
  assert.equal(store.captures.get('a').pointers.has('v1'), false);
  assert.equal(store.captures.get('a').pointerSeqs.has('v1'), false);
  assert.equal(store.captures.get('a').pointers.has('v2'), true);
  assert.equal(store.captures.get('a').pointerSeqs.has('v2'), true);

  // Presenter B's drawing and laser are intact; v1 is removed
  assert.equal(store.captures.get('b').strokes.size, 1);
  assert.ok(store.captures.get('b').laser !== null);
  assert.equal(store.captures.get('b').seq, 2);
  assert.equal(store.captures.get('b').pointers.size, 0);
  assert.equal(store.captures.get('b').pointerSeqs.size, 0);

  // Presenter B leaves the room
  store.removePeer('b');
  assert.equal(store.captures.has('b'), false);
  // Presenter A and v2 pointing are completely untouched
  assert.equal(store.captures.has('a'), true);
  assert.equal(store.captures.get('a').strokes.size, 1);
  assert.equal(store.captures.get('a').pointers.size, 1);
  assert.equal(store.captures.get('a').pointers.has('v2'), true);
});
