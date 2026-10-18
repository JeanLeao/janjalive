import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { QA_LIMITS } from '@screen-room/protocol';
import { RoomRegistry } from '../dist/room-state.js';
import { createSignalServer } from '../dist/server.js';

test('F38 RoomRegistry: ordering (open before answered), presenter permissions, author withdraw, multiple presenters, limits and lifecycle', async () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'viewer1', 'Vitor');
  rooms.join('r', 'viewer2', 'Clara');
  rooms.join('r', 'pres1', 'Ana');
  rooms.join('r', 'pres2', 'Bruno');

  rooms.updateSharing('r', 'pres1', { active: true, paused: false, streamId: 's1', hasAudio: false, audioMuted: false });
  rooms.updateSharing('r', 'pres2', { active: true, paused: true, streamId: 's2', hasAudio: false, audioMuted: false });

  // Submit questions from viewers and presenters
  const q1 = rooms.submitQuestion('r', 'viewer1', randomUUID(), 'Pergunta 1', 100);
  const q2 = rooms.submitQuestion('r', 'viewer2', randomUUID(), 'Pergunta 2', 110);
  const q3 = rooms.submitQuestion('r', 'pres1', randomUUID(), 'Pergunta 3 (apresentador)', 120);
  assert.equal(q1.ok && q2.ok && q3.ok, true);
  const q1Id = q1.question.id;
  const q2Id = q2.question.id;
  const q3Id = q3.question.id;

  let snap = rooms.questionsSnapshot('r');
  assert.deepEqual(snap.questions.map(q => q.text), ['Pergunta 1', 'Pergunta 2', 'Pergunta 3 (apresentador)']);

  // Non-presenter cannot answer, highlight, or reopen
  for (const action of ['answer-verbal', 'highlight', 'unhighlight', 'reopen']) {
    const res = rooms.updateQuestion('r', 'viewer1', { type: 'update-question', requestId: randomUUID(), questionId: q1Id, action }, 130);
    assert.equal(res.ok, false);
    assert.match(res.message, /compartilhando tela/);
  }
  const unauthorizedText = rooms.updateQuestion('r', 'viewer1', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q1Id,
    action: 'answer-text',
    answerText: 'Tentativa',
  }, 135);
  assert.equal(unauthorizedText.ok, false);

  // Non-author (even if presenter) cannot withdraw another participant's question
  const wrongWithdraw = rooms.withdrawQuestion('r', 'pres1', randomUUID(), q1Id, 140);
  assert.equal(wrongWithdraw.ok, false);
  assert.match(wrongWithdraw.message, /Apenas o autor/);

  // Presenter 1 answers q1 via text -> q1 moves after open questions (q2, q3)
  const ans1 = rooms.updateQuestion('r', 'pres1', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q1Id,
    action: 'answer-text',
    answerText: 'Resposta escrita da Ana',
  }, 200);
  assert.equal(ans1.ok, true);
  snap = rooms.questionsSnapshot('r');
  assert.deepEqual(snap.questions.map(q => q.id), [q2Id, q3Id, q1Id]);
  assert.equal(snap.questions[2].status, 'answered-text');
  assert.equal(snap.questions[2].answer?.text, 'Resposta escrita da Ana');
  assert.equal(snap.questions[2].answer?.answeredByNickname, 'Ana');

  // Presenter 2 (paused sharing is still active sharing) marks q2 as answered verbally and highlights it
  const ans2 = rooms.updateQuestion('r', 'pres2', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q2Id,
    action: 'answer-verbal',
  }, 210);
  assert.equal(ans2.ok, true);
  const hl2 = rooms.updateQuestion('r', 'pres2', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q2Id,
    action: 'highlight',
  }, 220);
  assert.equal(hl2.ok, true);

  snap = rooms.questionsSnapshot('r');
  assert.equal(snap.highlightedQuestionId, q2Id);
  // Open (q3) comes before answered (q1 order 1, q2 order 2)
  assert.deepEqual(snap.questions.map(q => q.id), [q3Id, q1Id, q2Id]);

  // Highlighting another question replaces the previous highlight (only one at a time)
  rooms.updateQuestion('r', 'pres1', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q3Id,
    action: 'highlight',
  }, 230);
  assert.equal(rooms.questionsSnapshot('r').highlightedQuestionId, q3Id);

  // Author withdraws q3 -> removed and highlight cleared
  const wd3 = rooms.withdrawQuestion('r', 'pres1', randomUUID(), q3Id, 240);
  assert.equal(wd3.ok, true);
  snap = rooms.questionsSnapshot('r');
  assert.equal(snap.highlightedQuestionId, null);
  assert.deepEqual(snap.questions.map(q => q.id), [q1Id, q2Id]);

  // Presenter 1 reopens q2 -> q2 returns to open queue ahead of answered q1
  assert.equal(rooms.updateQuestion('r', 'pres1', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q2Id,
    action: 'reopen',
  }, 250).ok, true);
  snap = rooms.questionsSnapshot('r');
  assert.deepEqual(snap.questions.map(q => q.id), [q2Id, q1Id]);

  // Questions survive presenter stopping sharing and author leaving while room exists
  rooms.updateSharing('r', 'pres1', { active: false, hasAudio: false, audioMuted: false });
  assert.equal(rooms.updateQuestion('r', 'pres1', {
    type: 'update-question',
    requestId: randomUUID(),
    questionId: q2Id,
    action: 'highlight',
  }, 260).ok, false);
  rooms.leave('r', 'viewer1', true);
  snap = rooms.questionsSnapshot('r');
  assert.equal(snap.questions.length, 2);

  // Nickname update syncs author and answerer nicknames
  rooms.updateNickname('r', 'pres1', 'Ana Paula');
  snap = rooms.questionsSnapshot('r');
  assert.equal(snap.questions.find(q => q.id === q1Id)?.answer?.answeredByNickname, 'Ana Paula');

  // Room capacity & rate limit protection
  for (let i = 0; i < QA_LIMITS.burst; i++) {
    const r = rooms.submitQuestion('r', 'viewer2', randomUUID(), `Burst ${i}`, 20_000);
    assert.equal(r.ok, true);
  }
  const throttled = rooms.submitQuestion('r', 'viewer2', randomUUID(), 'Overflow burst', 20_000);
  assert.equal(throttled.ok, false);
  assert.match(throttled.message, /Muitas ações/);

  // Preserved during reconnection grace period, destroyed only when room is destroyed
  rooms.leave('r', 'viewer2', true);
  rooms.leave('r', 'pres1', true);
  rooms.leave('r', 'pres2', false, 30); // involuntary disconnect with 30ms grace
  assert.equal(rooms.questionsSnapshot('r').questions.length > 0, true);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(rooms.has('r'), false);
  rooms.join('r', 'fresh');
  assert.equal(rooms.questionsSnapshot('r').questions.length, 0);
});

async function connect(app, roomId, peerId, nickname, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  ws.send(JSON.stringify({ type: 'join', roomId, peerId, nickname, reconnectToken }));
  return {
    ws,
    events,
    send: message => ws.send(JSON.stringify(message)),
    async next(type, predicate = () => true) {
      for (let i = 0; i < 150; i++) {
        const index = events.findIndex(e => e.type === type && predicate(e));
        if (index >= 0) return events.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Missing ${type}`);
    },
  };
}

test('F38 WebSocket server: synchronization, late join, reconnect, duplicate requestId rejection, and room isolation', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 200 });
  await app.ready;
  t.after(() => app.close());

  const pres = await connect(app, 'qa-room', 'pres', 'Apresentadora');
  const presPeers = await pres.next('peers');
  await pres.next('questions-snapshot');

  const viewer = await connect(app, 'qa-room', 'viewer', 'Participante');
  await viewer.next('peers');
  await viewer.next('questions-snapshot');

  const otherRoom = await connect(app, 'other-room', 'outsider', 'Outro');
  await otherRoom.next('peers');
  await otherRoom.next('questions-snapshot');

  // Viewer submits a question
  const reqId = randomUUID();
  viewer.send({ type: 'submit-question', requestId: reqId, text: 'Qual a latência média?' });
  const accepted = await viewer.next('question-accepted');
  assert.equal(accepted.requestId, reqId);

  const snapPres = await pres.next('questions-snapshot', s => s.questions.length === 1);
  const snapViewer = await viewer.next('questions-snapshot', s => s.questions.length === 1);
  assert.deepEqual(snapPres, snapViewer);
  const qId = snapPres.questions[0].id;

  // Duplicate requestId is rejected
  viewer.send({ type: 'submit-question', requestId: reqId, text: 'Duplicada' });
  const dup = await viewer.next('interaction-rejected');
  assert.equal(dup.requestId, reqId);

  // Viewer cannot highlight or answer
  const badReq = randomUUID();
  viewer.send({ type: 'update-question', requestId: badReq, questionId: qId, action: 'highlight' });
  const rejected = await viewer.next('interaction-rejected');
  assert.equal(rejected.requestId, badReq);

  // Presenter starts sharing and answers + highlights
  pres.send({ type: 'update-sharing', active: true, paused: false, streamId: 'stream-1', hasAudio: false, audioMuted: false });
  await viewer.next('sharing-updated');

  pres.send({ type: 'update-question', requestId: randomUUID(), questionId: qId, action: 'highlight' });
  await pres.next('question-accepted');
  await viewer.next('questions-snapshot', s => s.highlightedQuestionId === qId);

  pres.send({
    type: 'update-question',
    requestId: randomUUID(),
    questionId: qId,
    action: 'answer-text',
    answerText: 'Cerca de 35ms em rede local.',
  });
  await pres.next('question-accepted');
  const answeredSnap = await viewer.next('questions-snapshot', s => s.questions[0]?.status === 'answered-text');
  assert.equal(answeredSnap.questions[0].answer?.text, 'Cerca de 35ms em rede local.');

  // Late joiner receives full current Q&A snapshot
  const late = await connect(app, 'qa-room', 'late', 'Atrasado');
  const lateSnap = await late.next('questions-snapshot');
  assert.equal(lateSnap.highlightedQuestionId, qId);
  assert.equal(lateSnap.questions.length, 1);
  assert.equal(lateSnap.questions[0].answer?.text, 'Cerca de 35ms em rede local.');

  // Presenter disconnects involuntarily and reconnects with token -> state intact
  pres.ws.terminate();
  await new Promise(resolve => setTimeout(resolve, 30));
  const presRecovered = await connect(app, 'qa-room', 'pres', 'Apresentadora', presPeers.reconnectToken);
  const recSnap = await presRecovered.next('questions-snapshot');
  assert.equal(recSnap.questions.length, 1);
  assert.equal(recSnap.highlightedQuestionId, qId);

  // No leakage to other room
  assert.equal(otherRoom.events.some(e => e.type === 'questions-snapshot'), false);
});
