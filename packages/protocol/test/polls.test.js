import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClientMessageSchema, ServerMessageSchema } from '../dist/index.js';

test('poll contracts bound text, alternatives and payloads; reject identity injection', () => {
  const create = { type: 'create-poll', requestId: randomUUID(), question: '  Pergunta?  ', options: [' A ', 'B'] };
  assert.equal(ClientMessageSchema.parse(create).question, 'Pergunta?');
  for (const patch of [{ question: '' }, { question: 'x'.repeat(301) }, { question: '\u202e' }, { options: ['a'] }, { options: Array(6).fill('a') },
    { options: ['a', 'x'.repeat(121)] }, { options: ['a', ' '] }, { options: ['a', '\u0000'] }, { peerId: 'spoof' }, { roomId: 'other' }]) {
    assert.equal(ClientMessageSchema.safeParse({ ...create, ...patch }).success, false, JSON.stringify(patch));
  }
  const vote = { type: 'vote-poll', requestId: randomUUID(), pollId: randomUUID(), option: 0 };
  assert.equal(ClientMessageSchema.safeParse(vote).success, true);
  for (const option of [-1, 5, 0.5, '0']) assert.equal(ClientMessageSchema.safeParse({ ...vote, option }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'close-poll', requestId: randomUUID(), pollId: vote.pollId }).success, true);
  const poll = { id: vote.pollId, question: 'Pergunta', options: ['A', 'B'], createdAt: 1, closedAt: null, ownVote: null, counts: null };
  const snapshot = { type: 'polls-snapshot', roomId: 'r', revision: 1, polls: [poll] };
  assert.equal(ServerMessageSchema.safeParse(snapshot).success, true);
  assert.equal(ServerMessageSchema.safeParse({ ...snapshot, polls: [{ ...poll, votes: { someone: 0 } }] }).success, false);
  assert.equal(ServerMessageSchema.safeParse({ ...snapshot, polls: Array(5).fill(poll) }).success, false);
});
