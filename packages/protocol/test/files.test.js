import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessageSchema, ServerMessageSchema, FILE_LIMITS } from '../dist/index.js';
const request = { type: 'file-request', id: crypto.randomUUID(), target: 'receiver', file: { name: 'file.html', mime: 'text/html', size: FILE_LIMITS.maxBytes, sha256: 'a'.repeat(64) } };
test('files: metadata boundary, arbitrary declared MIME, no sender spoofing or content', () => {
  assert.equal(ClientMessageSchema.safeParse(request).success, true);
  for (const file of [{ size: FILE_LIMITS.maxBytes + 1 }, { size: -1 }, { size: 0.5 }, { name: '../x' }, { name: 'x\u202eexe' }, { sha256: 'abc' }, { mime: 'a\nb' }]) {
    assert.equal(ClientMessageSchema.safeParse({ ...request, file: { ...request.file, ...file } }).success, false);
  }
  for (const extra of [{ from: 'victim' }, { bytes: 'secret' }]) assert.equal(ClientMessageSchema.safeParse({ ...request, ...extra }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'file-control', id: request.id, target: 'sender', action: 'accept' }).success, true);
  assert.equal(ServerMessageSchema.safeParse({ type: 'file-event', id: request.id, from: 'sender', to: 'receiver', action: 'request', file: request.file }).success, true);
});
