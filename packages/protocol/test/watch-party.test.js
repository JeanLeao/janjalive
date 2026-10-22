import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessageSchema, ServerMessageSchema, FILE_LIMITS } from '../dist/index.js';
const id = '628e19de-801e-4513-b27e-19f3df97c641';
const file = { name: 'video.webm', mime: 'video/webm', size: 123, sha256: 'a'.repeat(64) };
const op = { type: 'watch-operation', sessionId: id, requestId: id, revision: 0, action: 'create', file, duration: 60 };
test('watch: strict bounded metadata and finite timelines; no media or forged controller fields', () => {
  assert.equal(ClientMessageSchema.safeParse(op).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'watch-readiness', sessionId: id, status: 'ready' }).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'watch-readiness', sessionId: id, status: 'ready', peerId: 'other' }).success, false);
  for (const change of [{ controllerId: 'host' }, { bytes: 'abc' }, { position: Infinity }, { duration: -1 }, { revision: -1 }, { file: { ...file, size: FILE_LIMITS.maxBytes + 1 } }]) assert.equal(ClientMessageSchema.safeParse({ ...op, ...change }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'file-request', id, target: 'viewer', file, watchSessionId: id }).success, true);
  assert.equal(ServerMessageSchema.safeParse({ type: 'watch-snapshot', roomId: 'room', revision: 1, serverTime: 1, state: null }).success, true);
});
