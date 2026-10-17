import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessageSchema, ServerMessageSchema } from '../dist/messages.js';

test('F38 validates boolean intent and bounded versions, rejecting arbitrary identities', () => {
  const valid = { type: 'set-hand', raised: true, version: 0 };
  assert.ok(ClientMessageSchema.safeParse(valid).success);
  for (const invalid of [{ ...valid, peerId: 'other' }, { ...valid, raised: 1 }, { ...valid, version: -1 }, { ...valid, version: 0.5 }, { ...valid, version: Infinity }]) {
    assert.equal(ClientMessageSchema.safeParse(invalid).success, false);
  }
  const snapshot = { type: 'hands-snapshot', roomId: 'room', revision: 1, hands: [{ peerId: 'a', order: 1, version: 1 }] };
  assert.ok(ServerMessageSchema.safeParse(snapshot).success);
  assert.equal(ServerMessageSchema.safeParse({ ...snapshot, hands: [{ peerId: 'a', order: 0, version: 1 }] }).success, false);
});
