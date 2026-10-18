import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClientMessageSchema, ServerMessageSchema, QA_LIMITS } from '../dist/messages.js';

test('F38 Q&A schemas validate client intents, text bounds, and server snapshots', () => {
  const reqId = randomUUID();
  const qId = randomUUID();

  // Valid submit-question
  assert.ok(ClientMessageSchema.safeParse({
    type: 'submit-question',
    requestId: reqId,
    text: '  Como funciona o P2P?  ',
  }).success);

  // Rejects empty, oversized, control chars, or spoofed peerId
  for (const invalid of [
    { type: 'submit-question', requestId: reqId, text: '   ' },
    { type: 'submit-question', requestId: reqId, text: 'a'.repeat(QA_LIMITS.questionLength + 1) },
    { type: 'submit-question', requestId: reqId, text: 'olá\u0000mundo' },
    { type: 'submit-question', requestId: reqId, text: 'ok', peerId: 'spoof' },
  ]) {
    assert.equal(ClientMessageSchema.safeParse(invalid).success, false);
  }

  // Valid withdraw-question
  assert.ok(ClientMessageSchema.safeParse({
    type: 'withdraw-question',
    requestId: reqId,
    questionId: qId,
  }).success);

  // Valid update-question actions
  assert.ok(ClientMessageSchema.safeParse({
    type: 'update-question',
    requestId: reqId,
    questionId: qId,
    action: 'answer-text',
    answerText: 'Via RTCPeerConnection direto entre pares.',
  }).success);

  for (const action of ['answer-verbal', 'reopen', 'highlight', 'unhighlight']) {
    assert.ok(ClientMessageSchema.safeParse({
      type: 'update-question',
      requestId: reqId,
      questionId: qId,
      action,
    }).success);
  }

  // Rejects answer-text without answerText or non-answer-text with answerText
  assert.equal(ClientMessageSchema.safeParse({
    type: 'update-question',
    requestId: reqId,
    questionId: qId,
    action: 'answer-text',
  }).success, false);

  assert.equal(ClientMessageSchema.safeParse({
    type: 'update-question',
    requestId: reqId,
    questionId: qId,
    action: 'highlight',
    answerText: 'não permitido',
  }).success, false);

  // Server snapshot validation
  const snapshot = {
    type: 'questions-snapshot',
    roomId: 'room-1',
    revision: 1,
    highlightedQuestionId: qId,
    questions: [
      {
        id: qId,
        order: 1,
        authorPeerId: 'peer_a',
        authorNickname: 'Ana',
        text: 'Como funciona o P2P?',
        createdAt: Date.now(),
        status: 'answered-text',
        answer: {
          text: 'Malha WebRTC.',
          answeredByPeerId: 'peer_b',
          answeredByNickname: 'Bruno',
          answeredAt: Date.now(),
        },
      },
    ],
  };
  assert.ok(ServerMessageSchema.safeParse(snapshot).success);
  assert.ok(ServerMessageSchema.safeParse({
    type: 'question-accepted',
    roomId: 'room-1',
    requestId: reqId,
    questionId: qId,
  }).success);
});
