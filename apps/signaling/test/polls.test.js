import { createTestRooms } from './helpers/create-rooms.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { POLL_LIMITS, PollsSnapshotSchema } from '@screen-room/protocol';
import { RoomRegistry } from '../dist/room-state.js';
import { createSignalServer } from '../dist/server.js';

const create = (question = 'Qual caminho?') => ({ type: 'create-poll', requestId: randomUUID(), question, options: ['A', 'B'] });
const vote = (pollId, option = 0) => ({ type: 'vote-poll', requestId: randomUUID(), pollId, option });
const close = pollId => ({ type: 'close-poll', requestId: randomUUID(), pollId });
const sharing = { active: true, hasAudio: false, audioMuted: false };

function fixture() {
  const rooms = new RoomRegistry();
  rooms.createRoom('r');
  for (const peer of ['p', 'q', 'v']) rooms.join('r', peer);
  rooms.updateSharing('r', 'p', sharing);
  rooms.updateSharing('r', 'q', { ...sharing, paused: true });
  let now = 100;
  return { rooms,
    apply: (peer, op) => rooms.polls.apply('r', rooms.pollParticipant('r', peer), op, now += 11000),
    snapshot: (peer = 'p') => rooms.polls.snapshot('r', rooms.pollParticipant('r', peer)),
  };
}

test('poll lifecycle: active presenters, single open poll, votes, changing votes, private results, departed voters, history', () => {
  const { rooms, apply, snapshot } = fixture();
  assert.match(apply('v', create()), /Apenas apresentadores/);
  assert.equal(apply('p', create()), null);
  const id = snapshot().polls[0].id;
  assert.match(apply('q', create()), /Já existe/);
  assert.equal(snapshot('v').polls[0].counts, null);
  assert.deepEqual(snapshot('q').polls[0].counts, [0, 0]);
  assert.match(apply('v', close(id)), /Apenas apresentadores/);
  assert.match(apply('v', vote(id, 2)), /inválida/);
  assert.equal(apply('v', vote(id)), null);
  assert.deepEqual(snapshot('v').polls[0].counts, [1, 0]);
  assert.equal(apply('v', vote(id)), null);
  assert.deepEqual(snapshot().polls[0].counts, [1, 0]);
  assert.equal(apply('v', vote(id, 1)), null);
  assert.equal(snapshot('v').polls[0].ownVote, 1);
  assert.equal(snapshot().polls[0].ownVote, null);
  assert.deepEqual(snapshot().polls[0].counts, [0, 1]);
  assert.equal(apply('p', vote(id)), null);
  rooms.leave('r', 'v');
  rooms.updateSharing('r', 'p', { ...sharing, active: false });
  assert.equal(snapshot('p').polls[0].closedAt, null);
  assert.match(apply('p', close(id)), /Apenas apresentadores/);
  rooms.leave('r', 'p'); // creator leaving does not close the poll
  assert.equal(snapshot('q').polls[0].closedAt, null);
  assert.equal(apply('q', close(id)), null);
  assert.deepEqual(snapshot('q').polls[0].counts, [1, 1]);
  assert.match(apply('q', vote(id)), /encerrada/);
  for (let i = 0; i < 4; i++) {
    assert.equal(apply('q', create(`Enquete ${i}`)), null);
    const current = snapshot('q').polls[0].id;
    assert.equal(apply('q', close(current)), null);
  }
  assert.deepEqual(snapshot('q').polls.map(p => p.question), ['Enquete 3', 'Enquete 2', 'Enquete 1']);
  assert.equal(apply('q', create('Aberta')), null);
  assert.equal(snapshot('q').polls.length, 4);
  assert.equal(PollsSnapshotSchema.safeParse(snapshot('q')).success, true);
});

test('private identities survive recovery and replacement, but voluntary/new sessions cannot inherit another vote', async () => {
  const { rooms, apply, snapshot } = fixture();
  apply('p', create()); const id = snapshot().polls[0].id;
  apply('v', vote(id));
  const token = rooms.getReconnectToken('r', 'v');
  const identity = rooms.pollParticipant('r', 'v').pollIdentity;
  rooms.leave('r', 'v', false, 1000);
  assert.throws(() => rooms.join('r', 'v'), /Credencial/);
  rooms.join('r', 'v', undefined, token);
  assert.equal(rooms.pollParticipant('r', 'v').pollIdentity, identity);
  assert.equal(snapshot('v').polls[0].ownVote, 0);
  rooms.join('r', 'v', undefined, token);
  apply('v', vote(id, 1));
  assert.deepEqual(snapshot().polls[0].counts, [0, 1]);
  rooms.leave('r', 'v'); rooms.join('r', 'v');
  assert.notEqual(rooms.pollParticipant('r', 'v').pollIdentity, identity);
  assert.equal(snapshot('v').polls[0].ownVote, null);
  assert.equal(snapshot('v').polls[0].counts, null);
  apply('v', vote(id));
  assert.deepEqual(snapshot().polls[0].counts, [1, 1]);
  // Entire room disappears only after its final recovery reservation expires.
  rooms.leave('r', 'p'); rooms.leave('r', 'q'); rooms.leave('r', 'v', false, 20);
  assert.equal(rooms.polls.snapshot('r').polls.length, 1);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(rooms.has('r'), false);
  assert.deepEqual(rooms.polls.snapshot('r').polls, []);
  rooms.createRoom('r');
  rooms.join('r', 'v'); assert.equal(snapshot('v').polls.length, 0);
  rooms.leave('r', 'v');
});

test('poll memory, frequency and request replay limits are independent of Q&A and survive reconnection', () => {
  const { rooms, apply, snapshot } = fixture();
  apply('p', create()); const id = snapshot().polls[0].id;
  const meta = rooms.pollParticipant('r', 'v');
  const operation = vote(id);
  assert.equal(rooms.polls.apply('r', meta, operation, 200), null);
  assert.match(rooms.polls.apply('r', meta, operation, 201), /já foi processada/);
  for (let i = 2; i < POLL_LIMITS.burst; i++) assert.equal(rooms.polls.apply('r', meta, vote(id), 202), null);
  assert.match(rooms.polls.apply('r', meta, vote(id), 203), /Muitas ações/);
  assert.equal(rooms.submitQuestion('r', 'v', randomUUID(), 'Pergunta independente', 203).ok, true);
  const token = rooms.getReconnectToken('r', 'v');
  rooms.leave('r', 'v', false); rooms.join('r', 'v', undefined, token);
  assert.match(rooms.polls.apply('r', rooms.pollParticipant('r', 'v'), vote(id), 204), /Muitas ações/);
  // Churn can exceed room capacity over time, but retained identities have a fixed bound.
  for (let i = 1; i < POLL_LIMITS.votersPerPoll; i++) {
    assert.equal(rooms.polls.apply('r', { pollIdentity: `identity-${i}` }, vote(id), 1000), null);
  }
  assert.match(rooms.polls.apply('r', { pollIdentity: 'overflow' }, vote(id), 1000), /Limite de votos/);
  assert.equal(rooms.polls.apply('r', meta, vote(id, 1), 20000), null);
  assert.deepEqual(snapshot().polls[0].counts, [9999, 1]);
  rooms.clearAllRecovery();
});

async function connect(app) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  return { ws, events, send: message => ws.send(JSON.stringify(message)), async next(type, predicate = () => true) {
    for (let i = 0; i < 150; i++) {
      const index = events.findIndex(event => event.type === type && predicate(event));
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  }};
}

test('wire polls: concurrent creation, authoritative snapshots, late join, isolation, replaced sockets and recovery', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' }); await app.ready;
  const ids = await createTestRooms(app, ["r", "other"]);
  t.after(() => app.close());
  const p = await connect(app), q = await connect(app), v = await connect(app), other = await connect(app);
  v.send(create()); await v.next('interaction-rejected');
  for (const [client, peerId, roomId] of [[p, 'p', ids["r"]], [q, 'q', ids["r"]], [v, 'v', ids["r"]], [other, 'o', ids["other"]]]) {
    client.send({ type: 'join', roomId, peerId }); client.peers = await client.next('peers');
    assert.deepEqual((await client.next('polls-snapshot')).polls, []);
  }
  p.send(create()); await p.next('interaction-rejected');
  for (const client of [p, q]) { client.send({ type: 'update-sharing', ...sharing }); await client.next('polls-snapshot'); }
  p.send(create('Concorrente A')); q.send(create('Concorrente B'));
  // Each socket's frames are serialized; whichever reaches the server first owns the open slot.
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal([p, q].flatMap(c => c.events).filter(e => e.type === 'poll-accepted').length, 1);
  assert.equal([p, q].flatMap(c => c.events).filter(e => e.type === 'interaction-rejected').length, 1);
  p.events.length = 0; q.events.length = 0;
  const initial = await v.next('polls-snapshot', e => e.polls.length === 1);
  const id = initial.polls[0].id;
  assert.equal(initial.polls[0].counts, null);
  v.send(vote(id, 1)); await v.next('poll-accepted');
  const voted = await v.next('polls-snapshot', e => e.polls[0]?.ownVote === 1);
  assert.deepEqual(voted.polls[0].counts, [0, 1]);
  const presenter = await p.next('polls-snapshot', e => e.polls[0]?.counts?.[1] === 1);
  assert.equal(presenter.polls[0].ownVote, null);
  assert.equal(JSON.stringify(presenter).includes('pollIdentity'), false);
  assert.equal(JSON.stringify(presenter).includes('votes'), false);
  const original = [...app.wss.clients].find(s => s.meta?.peerId === 'v');
  const replacement = await connect(app);
  replacement.send({ type: 'join', roomId: ids["r"], peerId: 'v', reconnectToken: v.peers.reconnectToken });
  await replacement.next('peers');
  assert.equal((await replacement.next('polls-snapshot')).polls[0].ownVote, 1);
  for (const operation of [create('stale'), vote(id), close(id)]) original.emit('message', Buffer.from(JSON.stringify(operation)));
  const late = await connect(app); late.send({ type: 'join', roomId: ids["r"], peerId: 'late' }); await late.next('peers');
  const lateSnap = await late.next('polls-snapshot'); assert.equal(lateSnap.polls[0].ownVote, null); assert.equal(lateSnap.polls[0].counts, null);
  late.send(vote(id)); await late.next('poll-accepted');
  assert.deepEqual((await late.next('polls-snapshot')).polls[0].counts, [1, 1]);
  replacement.ws.terminate(); await new Promise(resolve => setTimeout(resolve, 40));
  const recovered = await connect(app); recovered.send({ type: 'join', roomId: ids["r"], peerId: 'v', reconnectToken: v.peers.reconnectToken });
  await recovered.next('peers'); assert.equal((await recovered.next('polls-snapshot')).polls[0].ownVote, 1);
  recovered.send(vote(id)); await recovered.next('poll-accepted');
  assert.deepEqual((await recovered.next('polls-snapshot')).polls[0].counts, [2, 0]);
  other.send(vote(id)); await other.next('interaction-rejected');
  q.send(close(id)); await q.next('poll-accepted');
  assert.deepEqual((await recovered.next('polls-snapshot', s => s.polls[0]?.closedAt !== null)).polls[0].counts, [2, 0]);
  assert.equal(other.events.some(e => e.type === 'polls-snapshot'), false);
  // Payload contracts reject spoofed identities and malformed requests.
  recovered.send({ ...vote(id), peerId: 'spoof' }); await recovered.next('error');
});
