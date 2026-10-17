import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendChatMessage, acceptHandsSnapshot } from '../src/features/room/hooks/useRoomInteractions.ts';

test('chat history stays bounded and duplicate accepted events do not evict messages', () => {
  let history = [];
  for (let i = 0; i < 205; i++) history = appendChatMessage(history, {
    type: 'chat-message', id: randomUUID(), requestId: randomUUID(), roomId: 'room', peerId: 'peer', timestamp: i, text: `Message ${i}`,
  });
  assert.equal(history.length, 200);
  assert.equal(history[0].text, 'Message 5');
  assert.equal(history.at(-1).text, 'Message 204');
  assert.equal(appendChatMessage(history, { ...history[100] }), history);
});

test('F38 accepts only newer room snapshots, so delayed events cannot resurrect lowered hands', () => {
  const raised = { type: 'hands-snapshot', roomId: 'room', revision: 2, hands: [{ peerId: 'a', order: 1, version: 1 }] };
  const lowered = { ...raised, revision: 3, hands: [{ peerId: 'a', order: null, version: 2 }] };
  assert.equal(acceptHandsSnapshot(null, raised, 'room'), raised);
  assert.equal(acceptHandsSnapshot(raised, lowered, 'room'), lowered);
  assert.equal(acceptHandsSnapshot(lowered, raised, 'room'), lowered);
  assert.equal(acceptHandsSnapshot(lowered, { ...raised, revision: 3 }, 'room'), lowered);
  assert.equal(acceptHandsSnapshot(lowered, { ...raised, roomId: 'other', revision: 4 }, 'room'), lowered);
});
