import test from 'node:test';
import assert from 'node:assert/strict';
import { followReducer, followStatus, followTarget, initialFollowState } from '../src/features/room/hooks/follow-presenter.ts';

const run = (actions, state = initialFollowState) => actions.reduce(followReducer, state);
const indicate = (presenterId, targetPeerId, seq) => ({ type: 'indication', presenterId, targetPeerId, seq });
const ctx = (...sharing) => ({ localPeerId: 'me', isSharing: id => sharing.includes(id) });

test('following starts off and indications never move the stage of a viewer who is not following', () => {
  const state = run([indicate('a', 'b', 1)]);
  assert.equal(followStatus(state), 'off');
  assert.equal(followTarget(state, ctx('a', 'b')), null);
});

test('only the followed presenter drives the stage, newest indication wins, stale and repeated ones are ignored', () => {
  let state = run([indicate('a', 'b', 1), indicate('c', 'c', 1), { type: 'follow', presenterId: 'a' }]);
  assert.deepEqual(followTarget(state, ctx('a', 'b', 'c')), { stageId: 'b', consumesFallback: false });
  state = run([indicate('c', 'a', 2)], state);
  assert.equal(followTarget(state, ctx('a', 'b', 'c')).stageId, 'b');
  state = run([indicate('a', 'a', 3), indicate('a', 'b', 2), indicate('a', 'b', 3)], state);
  assert.equal(followTarget(state, ctx('a', 'b', 'c')).stageId, 'a');
});

test('without an indication the presenter own stream is highlighted exactly once', () => {
  let state = run([{ type: 'follow', presenterId: 'a' }]);
  assert.equal(followTarget(state, ctx()), null, 'waits until the presenter shares');
  assert.deepEqual(followTarget(state, ctx('a')), { stageId: 'a', consumesFallback: true });
  state = run([{ type: 'fallback-done' }], state);
  assert.equal(followTarget(state, ctx('a')), null);
});

test('an indication targeting the local stream resolves to the local stage', () => {
  const state = run([{ type: 'follow', presenterId: 'a' }, indicate('a', 'me', 1)]);
  assert.equal(followTarget(state, ctx('a', 'me')).stageId, 'local');
  assert.equal(followTarget(state, ctx('a')), null, 'local capture ended');
});

test('manual selection suspends but keeps the presenter; resume reapplies the latest indication; stop keeps manual control', () => {
  let state = run([{ type: 'follow', presenterId: 'a' }, indicate('a', 'b', 1), { type: 'manual-select' }]);
  assert.equal(followStatus(state), 'suspended');
  assert.equal(state.presenterId, 'a');
  state = run([indicate('a', 'a', 2)], state);
  assert.equal(followTarget(state, ctx('a', 'b')), null, 'suspended ignores new indications');
  state = run([{ type: 'resume' }], state);
  assert.equal(followStatus(state), 'active');
  assert.equal(followTarget(state, ctx('a', 'b')).stageId, 'a', 'latest indication, not the one before suspending');
  state = run([{ type: 'stop' }], state);
  assert.equal(followStatus(state), 'off');
  assert.equal(followTarget(state, ctx('a', 'b')), null);
  assert.equal(run([{ type: 'manual-select' }], state), state);
});

test('indicated stream ending stops forcing it and does not fall back to the presenter stream', () => {
  let state = run([{ type: 'follow', presenterId: 'a' }, indicate('a', 'b', 1)]);
  assert.equal(followTarget(state, ctx('a')), null, 'b stopped sharing');
  state = run([indicate('a', null, 2)], state);
  assert.equal(followTarget(state, ctx('a', 'b')), null);
  state = run([indicate('a', 'b', 1)], state);
  assert.equal(followTarget(state, ctx('a', 'b')), null, 'older seq cannot resurrect it');
});

test('involuntary presenter drop suspends temporarily and restores; manual control is respected; final exits end following', () => {
  let state = run([{ type: 'follow', presenterId: 'a' }, indicate('a', 'b', 4), { type: 'presenter-left', presenterId: 'a', reserved: true }]);
  assert.equal(followStatus(state), 'away');
  assert.equal(followTarget(state, ctx('a', 'b')), null);
  assert.equal(state.indications.a, undefined, 'no stale indication survives the drop');
  state = run([{ type: 'presenter-back', presenterId: 'a' }, indicate('a', 'b', 4)], state);
  assert.equal(followStatus(state), 'active');
  assert.equal(followTarget(state, ctx('a', 'b')).stageId, 'b');

  let manual = run([{ type: 'follow', presenterId: 'a' }, { type: 'manual-select' }, { type: 'presenter-left', presenterId: 'a', reserved: true }, { type: 'presenter-back', presenterId: 'a' }]);
  assert.equal(followStatus(manual), 'suspended', 'manual control survives the reconnect');

  assert.equal(run([{ type: 'follow', presenterId: 'a' }, { type: 'presenter-left', presenterId: 'a', reserved: false }]).presenterId, null);
  assert.equal(run([{ type: 'follow', presenterId: 'a' }, { type: 'presenter-left', presenterId: 'a', reserved: true }, { type: 'presenter-expired', presenterId: 'a' }]).presenterId, null);
  assert.equal(run([{ type: 'follow', presenterId: 'a' }, { type: 'presenter-expired', presenterId: 'a' }]).presenterId, 'a', 'expiry only applies to an absent presenter');
  assert.equal(run([{ type: 'follow', presenterId: 'a' }, { type: 'presenter-left', presenterId: 'z', reserved: false }]).presenterId, 'a');
});

test('a snapshot replaces every indication and reset clears the session', () => {
  let state = run([{ type: 'follow', presenterId: 'a' }, indicate('a', 'b', 9), indicate('c', 'c', 9)]);
  state = run([{ type: 'snapshot', indications: { a: { targetPeerId: 'a', seq: 1 } } }], state);
  assert.deepEqual(Object.keys(state.indications), ['a']);
  assert.equal(followTarget(state, ctx('a', 'b')).stageId, 'a', 'seq restarts with the new server snapshot');
  assert.deepEqual(run([{ type: 'reset' }], state), initialFollowState);
});
