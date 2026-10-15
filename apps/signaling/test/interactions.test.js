import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';

async function connect(app) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`);
  const events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  return { ws, events, send: message => ws.send(JSON.stringify(message)), async next(type) {
    for (let i = 0; i < 100; i++) {
      const index = events.findIndex(event => event.type === type);
      if (index >= 0) return events.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Missing ${type}`);
  }};
}
const chat = (text = 'Olá') => ({ type: 'send-chat', requestId: randomUUID(), text });
const reaction = (r = 'like') => ({ type: 'send-reaction', requestId: randomUUID(), reaction: r });

test('interactions: authoritative identity, isolation, no history, validation, limits and recovery', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());
  const a = await connect(app), b = await connect(app), other = await connect(app);
  a.send(chat());
  assert.match((await a.next('interaction-rejected')).message, /Entre/);
  a.send({ type: 'join', roomId: 'talk', peerId: 'a', nickname: 'Ana' });
  const peers = await a.next('peers');
  const originalSocket = [...app.wss.clients].find(socket => socket.meta?.peerId === 'a');
  b.send({ type: 'join', roomId: 'talk', peerId: 'b' }); await b.next('peers');
  other.send({ type: 'join', roomId: 'other', peerId: 'c' }); await other.next('peers');
  const message = chat('<b>texto</b>'); a.send(message);
  const accepted = await a.next('chat-message');
  assert.equal(accepted.peerId, 'a'); assert.equal(accepted.nickname, 'Ana');
  assert.deepEqual(await b.next('chat-message'), accepted);
  a.send(message); await a.next('interaction-rejected');
  a.send({ ...chat(), peerId: 'spoof' }); await a.next('error');
  a.send(chat('\u0000')); await a.next('error');
  a.send(chat('x'.repeat(1001))); await a.next('error');
  for (let i = 0; i < 3; i++) { a.send(chat()); await a.next('chat-message'); await b.next('chat-message'); }
  a.send(chat()); await a.next('interaction-rejected');
  const sampleReactions = ['applause', 'like', 'heart', 'celebrate', 'brazil', 'dislike', 'middle-finger', 'bubbles'];
  for (const r of sampleReactions) {
    a.send(reaction(r));
    const recA = await a.next('reaction');
    const recB = await b.next('reaction');
    assert.equal(recA.reaction, r);
    assert.equal(recB.reaction, r);
  }
  a.send(reaction('rocket')); await a.next('interaction-rejected');
  const replacement = await connect(app);
  replacement.send({ type: 'join', roomId: 'talk', peerId: 'a', reconnectToken: peers.reconnectToken });
  await replacement.next('peers');
  originalSocket.emit('message', Buffer.from(JSON.stringify(chat('stale socket'))));
  originalSocket.emit('message', Buffer.from(JSON.stringify(reaction())));
  replacement.send(chat()); await replacement.next('interaction-rejected');
  replacement.ws.terminate();
  await new Promise(resolve => setTimeout(resolve, 40));
  const recovered = await connect(app);
  recovered.send({ type: 'join', roomId: 'talk', peerId: 'a', reconnectToken: peers.reconnectToken }); await recovered.next('peers');
  recovered.send(reaction()); await recovered.next('interaction-rejected');
  b.send(chat('Resposta')); assert.equal((await recovered.next('chat-message')).nickname, undefined); await b.next('chat-message');
  const late = await connect(app); late.send({ type: 'join', roomId: 'talk', peerId: 'late' }); await late.next('peers');
  recovered.send({ type: 'leave' }); recovered.send(chat()); await recovered.next('interaction-rejected');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(other.events.some(e => ['chat-message', 'reaction'].includes(e.type)), false);
  assert.equal(late.events.some(e => ['chat-message', 'reaction'].includes(e.type)), false);
  assert.equal(b.events.filter(e => e.type === 'chat-message').length, 0);
});
