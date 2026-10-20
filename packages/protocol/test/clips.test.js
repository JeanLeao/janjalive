import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessageSchema, ServerMessageSchema } from '../dist/messages.js';
test('F16 strict bounded intents reject identity injection and invalid sequence', () => {
  const message = { type: 'clip-operation', action: 'request', seq: 1, presenterId: 'p', streamId: 's', version: 1, recordingId: 'fcfa187e-c9b7-478a-959c-0e2ef8ea6f70' };
  assert.equal(ClientMessageSchema.safeParse(message).success, true);
  for (const extra of [{ recorderId: 'spoof' }, { seq: 0 }, { seq: Infinity }, { streamId: '' }, { recordingId: 'old' }]) assert.equal(ClientMessageSchema.safeParse({ ...message, ...extra }).success, false);
  assert.equal(ServerMessageSchema.safeParse({ type: 'clips-snapshot', roomId: 'r', revision: 1, permissions: [], recordings: [] }).success, true);
});
