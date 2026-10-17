import test from 'node:test';
import assert from 'node:assert/strict';
import { StageSelectionPublisher } from '../src/features/room/hooks/stage-selection-publisher.ts';
import { RoomRegistry } from '../../signaling/dist/room-state.js';
import { followReducer, followTarget, initialFollowState } from '../src/features/room/hooks/follow-presenter.ts';

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const sent = [];
  let connected = true, valid = true, transport = true;
  const publisher = new StageSelectionPublisher({
    canSend: () => connected,
    isValidTarget: () => valid,
    send: id => { sent.push(id); return transport; },
  });
  return { publisher, sent, disconnect: () => { connected = false; }, invalidate: () => { valid = false; }, fail: () => { transport = false; } };
}

test('rapid choices retain only the latest intent and stop sending after acknowledgement', t => {
  const { publisher: p, sent } = setup(t);
  p.select('a'); p.acknowledge('a', 1);
  for (let i = 0; i < 100; i++) p.select(i % 2 ? 'b' : 'a');
  t.mock.timers.tick(1099); assert.deepEqual(sent, ['a']);
  t.mock.timers.tick(1); assert.deepEqual(sent, ['a', 'b']);
  p.acknowledge('b', 2);
  p.select('b');
  t.mock.timers.tick(10000); assert.deepEqual(sent, ['a', 'b']);
});

test('unconfirmed attempts retry the latest choice; obsolete acknowledgements cannot clear it', t => {
  const { publisher: p, sent } = setup(t);
  p.select('a'); p.select('b');
  t.mock.timers.tick(1100); assert.deepEqual(sent, ['a', 'b']);
  p.acknowledge('a', 1);
  t.mock.timers.tick(1100); assert.deepEqual(sent, ['a', 'b', 'b']);
  p.acknowledge('b', 2); p.acknowledge('a', 1);
  t.mock.timers.tick(10000); assert.equal(sent.length, 3);
});

test('returning to a confirmed choice still corrects a different in-flight selection', t => {
  const { publisher: p, sent } = setup(t);
  p.select('a'); p.acknowledge('a', 1);
  t.mock.timers.tick(1100); p.select('b'); p.select('a');
  p.acknowledge('b', 2);
  t.mock.timers.tick(1100); assert.deepEqual(sent, ['a', 'b', 'a']);
  p.acknowledge('a', 3);
  t.mock.timers.tick(10000); assert.equal(sent.length, 3);
});

for (const reason of ['capture stop', 'disconnect', 'session cleanup', 'target ended', 'target left', 'invalid at flush', 'not ready at flush', 'transport failure']) {
  test(`pending intent is discarded on ${reason}`, t => {
    const x = setup(t), p = x.publisher;
    p.select('a'); p.acknowledge('a', 1); p.select('b');
    if (['capture stop', 'disconnect', 'session cleanup'].includes(reason)) p.cancel();
    else if (['target ended', 'target left'].includes(reason)) p.invalidate('b');
    else if (reason === 'invalid at flush') x.invalidate();
    else if (reason === 'not ready at flush') x.disconnect();
    else x.fail();
    t.mock.timers.tick(1100);
    // Even if the same peer starts sharing again, the discarded intent is not resurrected.
    t.mock.timers.tick(10000);
    assert.deepEqual(x.sent, reason === 'transport failure' ? ['a', 'b'] : ['a']);
  });
}

test('stop/start preserves the socket budget; a new session has no inherited intent', t => {
  const { publisher: p, sent } = setup(t);
  p.select('a'); p.cancel(); p.select('b');
  t.mock.timers.tick(1099); assert.deepEqual(sent, ['a']);
  t.mock.timers.tick(1); assert.deepEqual(sent, ['a', 'b']);
  p.cancel();
  const next = new StageSelectionPublisher({ canSend: () => true, isValidTarget: () => true, send: id => { sent.push(id); return true; } });
  t.mock.timers.tick(10000); assert.equal(sent.length, 2);
  next.select('c'); assert.deepEqual(sent, ['a', 'b', 'c']); next.cancel();
});

test('integration: a saturated server budget drops the first attempt but the follower reaches the final choice', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const rooms = new RoomRegistry();
  for (const id of ['a', 'b', 'c']) {
    rooms.join('r', id);
    rooms.updateSharing('r', id, { active: true, paused: false, streamId: id, hasAudio: false, audioMuted: false });
  }
  for (let i = 0; i < 5; i++) assert.ok(rooms.selectStage('r', 'a', 'a'));
  assert.equal(rooms.selectStage('r', 'a', 'b'), undefined, 'server safety limit remains enforced');
  let follower = followReducer(initialFollowState, { type: 'follow', presenterId: 'a' });
  const attempts = [];
  const p = new StageSelectionPublisher({
    canSend: () => true,
    isValidTarget: id => ['a', 'b', 'c'].includes(id),
    send: target => {
      attempts.push(target);
      const selection = rooms.selectStage('r', 'a', target);
      if (selection) {
        follower = followReducer(follower, { type: 'selection', presenterId: 'a', ...selection });
        p.acknowledge(selection.targetPeerId, selection.seq);
      }
      return true; // Socket delivery succeeded even when the server silently rejected it.
    },
  });
  p.select('b');
  for (let i = 0; i < 100; i++) p.select(i % 2 ? 'c' : 'b');
  t.mock.timers.tick(1100);
  assert.deepEqual(attempts, ['b', 'c']);
  assert.equal(rooms.getSelection('r', 'a').targetPeerId, 'c');
  assert.equal(followTarget(follower, { localPeerId: 'viewer', isSharing: () => true }).stageId, 'c');
  t.mock.timers.tick(10000); assert.equal(attempts.length, 2);
});
