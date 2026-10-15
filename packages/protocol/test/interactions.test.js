import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClientMessageSchema, ChatTextSchema, ServerMessageSchema } from '../dist/index.js';

test('ephemeral interactions validate length, controls, enum and reject identity injection', () => {
  const base = { type: 'send-chat', requestId: randomUUID(), text: 'olá\n mundo' };
  assert.equal(ClientMessageSchema.safeParse(base).success, true);
  for (const text of ['', '  ', 'x'.repeat(1001), 'a\0b', 'a\u202eb']) assert.equal(ChatTextSchema.safeParse(text).success, false);
  assert.equal(ClientMessageSchema.safeParse({ ...base, peerId: 'forged' }).success, false);
  const validReactions = ['applause', 'like', 'heart', 'celebrate', 'brazil', 'dislike', 'middle-finger', 'bubbles', 'rocket'];
  for (const reaction of validReactions) {
    assert.equal(ClientMessageSchema.safeParse({ type: 'send-reaction', requestId: randomUUID(), reaction }).success, true);
    assert.equal(ServerMessageSchema.safeParse({ type: 'reaction', id: randomUUID(), requestId: randomUUID(), roomId: 'room', peerId: 'peer', timestamp: Date.now(), reaction }).success, true);
  }
  for (const reaction of ['<script>', 'fire', 'party', 'br', '', null, undefined]) {
    assert.equal(ClientMessageSchema.safeParse({ type: 'send-reaction', requestId: randomUUID(), reaction }).success, false);
  }
  assert.equal(ServerMessageSchema.safeParse({ type: 'chat-message', id: randomUUID(), requestId: base.requestId, roomId: 'room', peerId: 'peer', timestamp: Date.now(), text: '<b>literal</b>' }).success, true);
});
