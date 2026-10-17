import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { RoomRegistry } from '../dist/room-state.js';
import { ServerMessageSchema, ClientMessageSchema } from '@screen-room/protocol';

const sharing = (streamId = 's', paused = false) => ({ active: true, paused, streamId, hasAudio: false, audioMuted: false });
const stopped = { active: false, hasAudio: false, audioMuted: false };

test('room-state: only active sharers indicate, targets must be live streams of the same room', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b'); rooms.join('r', 'c'); rooms.join('other', 'x');
  rooms.updateSharing('other', 'x', sharing('x'));
  assert.equal(rooms.indicateStage('r', 'a', 'b'), undefined, 'not sharing');
  rooms.updateSharing('r', 'a', sharing('a')); rooms.updateSharing('r', 'b', sharing('b'));
  assert.equal(rooms.indicateStage('r', 'c', 'a'), undefined, 'spectators cannot indicate');
  assert.equal(rooms.indicateStage('r', 'a', 'c'), undefined, 'target not sharing');
  assert.equal(rooms.indicateStage('r', 'a', 'x'), undefined, 'target from another room');
  assert.equal(rooms.indicateStage('r', 'a', ''), undefined, 'invalid target');
  assert.deepEqual(rooms.indicateStage('r', 'a', 'b'), { targetPeerId: 'b', seq: 1 });
  assert.deepEqual(rooms.indicateStage('r', 'a', 'a'), { targetPeerId: 'a', seq: 2 });
  assert.deepEqual(rooms.indicateStage('r', 'b', 'b', 0), { targetPeerId: 'b', seq: 1 }, 'independent per presenter');
  assert.deepEqual(rooms.getParticipants('r').find(p => p.peerId === 'a').indication, { targetPeerId: 'a', seq: 2 });
  assert.equal(rooms.getParticipants('r').find(p => p.peerId === 'c').indication, undefined);
});

test('room-state: pause and F27 source swap preserve indications; stopping clears them with a growing seq', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b');
  rooms.updateSharing('r', 'a', sharing('a1')); rooms.updateSharing('r', 'b', sharing('b1'));
  rooms.indicateStage('r', 'a', 'b');
  rooms.updateSharing('r', 'b', sharing('b1', true));
  assert.equal(rooms.getIndication('r', 'a')?.targetPeerId, 'b');
  rooms.updateSharing('r', 'b', sharing('b2'));
  assert.equal(rooms.getIndication('r', 'a')?.targetPeerId, 'b');
  rooms.updateSharing('r', 'b', stopped);
  assert.deepEqual(rooms.clearIndications('r', 'b', true), [{ presenterPeerId: 'a', seq: 2 }]);
  assert.equal(rooms.getIndication('r', 'a'), undefined);
  rooms.updateSharing('r', 'b', sharing('b3'));
  assert.equal(rooms.getIndication('r', 'a'), undefined, 'a stopped stream is never resurrected');
  assert.equal(rooms.indicateStage('r', 'a', 'b').seq, 3);
});

test('room-state: involuntary drop reserves the indication; voluntary leave and expired targets do not', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.join('r', 'b'); rooms.join('r', 'c');
  const token = rooms.getReconnectToken('r', 'a');
  for (const id of ['a', 'b', 'c']) rooms.updateSharing('r', id, sharing(id));
  rooms.indicateStage('r', 'a', 'b');
  rooms.clearIndications('r', 'a', false);
  rooms.leave('r', 'a', false, 1000);
  rooms.join('r', 'a', undefined, token);
  assert.deepEqual(rooms.getIndication('r', 'a'), { targetPeerId: 'b', seq: 1 });
  rooms.leave('r', 'a', false, 1000);
  rooms.clearIndications('r', 'b', true); rooms.leave('r', 'b', true);
  rooms.join('r', 'a', undefined, token);
  assert.equal(rooms.getIndication('r', 'a'), undefined, 'target left while the presenter was away');
  rooms.indicateStage('r', 'a', 'c', 0);
  rooms.clearIndications('r', 'a', true); rooms.leave('r', 'a', true);
  rooms.join('r', 'a');
  assert.equal(rooms.getIndication('r', 'a'), undefined);
  rooms.clearAllRecovery();
});

test('room-state: target stopping while presenter is disconnected clears indication in reservation', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'ana'); rooms.join('r', 'bia');
  const tokenAna = rooms.getReconnectToken('r', 'ana');
  rooms.updateSharing('r', 'ana', sharing('a1'));
  rooms.updateSharing('r', 'bia', sharing('b1'));
  rooms.indicateStage('r', 'ana', 'bia');
  assert.deepEqual(rooms.getIndication('r', 'ana'), { targetPeerId: 'bia', seq: 1 });

  // Ana desconecta involuntariamente
  rooms.clearIndications('r', 'ana', false);
  rooms.leave('r', 'ana', false, 1000);

  // Bia encerra e reinicia a transmissão antes de Ana retornar
  rooms.updateSharing('r', 'bia', stopped);
  rooms.clearIndications('r', 'bia', true);
  rooms.updateSharing('r', 'bia', sharing('b2'));

  // Ana reconecta
  rooms.join('r', 'ana', undefined, tokenAna);
  rooms.updateSharing('r', 'ana', sharing('a1'));

  // A indicação antiga NÃO é restaurada
  assert.equal(rooms.getIndication('r', 'ana'), undefined);
  rooms.clearAllRecovery();
});

test('room-state: indications are rate limited and a self-target is cleared when the presenter leaves', () => {
  const rooms = new RoomRegistry();
  rooms.join('r', 'a'); rooms.updateSharing('r', 'a', sharing('a'));
  for (let i = 0; i < 5; i++) assert.ok(rooms.indicateStage('r', 'a', 'a', 0));
  assert.equal(rooms.indicateStage('r', 'a', 'a', 999), undefined);
  assert.ok(rooms.indicateStage('r', 'a', 'a', 1000));
  assert.equal(rooms.clearIndications('r', 'a', false).length, 1);
});

test('protocol: strict schemas reject extra identity fields and malformed stage messages', () => {
  assert.ok(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: 'b' }).success);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: 'b', peerId: 'spoof' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: '' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'indicate-stage', targetPeerId: null }).success, false);
  assert.ok(ServerMessageSchema.safeParse({ type: 'stage-indicated', peerId: 'a', targetPeerId: null, seq: 3 }).success);
  assert.equal(ServerMessageSchema.safeParse({ type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: -1 }).success, false);
});

async function connect(app, roomId, peerId, reconnectToken) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/signal`), events = [];
  ws.on('message', raw => events.push(JSON.parse(raw.toString())));
  await new Promise(resolve => ws.once('open', resolve));
  const send = m => ws.send(JSON.stringify(m));
  const next = async (type, match = () => true) => {
    for (let i = 0; i < 100; i++) {
      const n = events.findIndex(e => e.type === type && match(e)); if (n >= 0) return events.splice(n, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    } throw new Error(`Missing ${type}`);
  };
  const quiet = async type => { await new Promise(resolve => setTimeout(resolve, 60)); return !events.some(e => e.type === type); };
  send({ type: 'join', roomId, peerId, ...(reconnectToken ? { reconnectToken } : {}) });
  const peers = await next('peers'); return { ws, events, send, next, quiet, peers };
}

test('integration: broadcast, late join snapshot, stop, spoofing, isolation and reconnect', async t => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 500 }); await app.ready; t.after(() => app.close());
  const a = await connect(app, 'room', 'a'), b = await connect(app, 'room', 'b'), v = await connect(app, 'room', 'v');
  const other = await connect(app, 'other', 'o');
  a.send({ type: 'indicate-stage', targetPeerId: 'b' });
  v.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.ok(await v.quiet('stage-indicated'), 'not sharing: ignored');
  a.send({ type: 'update-sharing', ...sharing('a') }); b.send({ type: 'update-sharing', ...sharing('b') });
  await v.next('sharing-updated'); await v.next('sharing-updated'); await a.next('sharing-updated');
  v.send({ type: 'indicate-stage', targetPeerId: 'b' });
  a.send({ type: 'indicate-stage', targetPeerId: 'b', peerId: 'b' });
  a.send({ type: 'indicate-stage', targetPeerId: 'ghost' });
  a.send({ type: 'indicate-stage', targetPeerId: 'o' });
  assert.ok(await v.quiet('stage-indicated'));
  a.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.deepEqual(await v.next('stage-indicated'), { type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: 1 });
  await a.next('stage-indicated'); await b.next('stage-indicated');
  assert.ok(await other.quiet('stage-indicated'), 'isolated room');
  b.send({ type: 'indicate-stage', targetPeerId: 'b' });
  assert.equal((await v.next('stage-indicated')).peerId, 'b');

  const late = await connect(app, 'room', 'late');
  assert.deepEqual(late.peers.participants.find(p => p.peerId === 'a').indication, { targetPeerId: 'b', seq: 1 });
  assert.deepEqual(late.peers.participants.find(p => p.peerId === 'b').indication, { targetPeerId: 'b', seq: 1 });
  assert.equal(late.peers.participants.find(p => p.peerId === 'v').indication, undefined);

  // A presenter's involuntary drop keeps the reservation, and the reconnect restores its indication.
  const token = a.peers.reconnectToken;
  a.ws.terminate();
  const left = await v.next('peer-left', e => e.peerId === 'a');
  assert.equal(left.reconnectGraceMs, 500);
  const a2 = await connect(app, 'room', 'a', token);
  a2.send({ type: 'update-sharing', ...sharing('a') });
  assert.deepEqual(await v.next('stage-indicated', e => e.peerId === 'a'), { type: 'stage-indicated', peerId: 'a', targetPeerId: 'b', seq: 1 });

  // The target stopping clears every indication that points at it.
  b.send({ type: 'update-sharing', ...stopped });
  const cleared = await v.next('stage-indicated', e => e.peerId === 'a' && e.targetPeerId === null);
  assert.equal(cleared.seq, 2);
  const clearedSelf = await v.next('stage-indicated', e => e.peerId === 'b' && e.targetPeerId === null);
  assert.equal(clearedSelf.seq, 2);

  // A voluntary leave is final and announces no grace period.
  a2.send({ type: 'leave' });
  assert.equal((await v.next('peer-left', e => e.peerId === 'a')).reconnectGraceMs, undefined);
});

test('integration: Ana indica Bia -> Ana desconecta involuntariamente -> Bia encerra e reinicia -> Ana reconecta: indicação antiga não é restaurada nem retransmitida', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 1000 });
  await app.ready;
  t.after(() => app.close());

  const ana = await connect(app, 'room-swap', 'ana');
  const bia = await connect(app, 'room-swap', 'bia');
  const viewer = await connect(app, 'room-swap', 'viewer');

  ana.send({ type: 'update-sharing', ...sharing('a1') });
  bia.send({ type: 'update-sharing', ...sharing('b1') });
  await viewer.next('sharing-updated');
  await viewer.next('sharing-updated');

  // Ana indica Bia
  ana.send({ type: 'indicate-stage', targetPeerId: 'bia' });
  const indicated = await viewer.next('stage-indicated');
  assert.deepEqual(indicated, { type: 'stage-indicated', peerId: 'ana', targetPeerId: 'bia', seq: 1 });

  // Ana desconecta involuntariamente
  const tokenAna = ana.peers.reconnectToken;
  ana.ws.terminate();
  await viewer.next('peer-left', e => e.peerId === 'ana');

  // Bia encerra a transmissão
  bia.send({ type: 'update-sharing', ...stopped });
  await viewer.next('sharing-updated', e => e.peerId === 'bia' && !e.active);

  // Bia reinicia a transmissão com novo stream
  bia.send({ type: 'update-sharing', ...sharing('b2') });
  await viewer.next('sharing-updated', e => e.peerId === 'bia' && e.active);

  // Ana reconecta com o token de recuperação
  const ana2 = await connect(app, 'room-swap', 'ana', tokenAna);
  ana2.send({ type: 'update-sharing', ...sharing('a2') });
  await viewer.next('sharing-updated', e => e.peerId === 'ana' && e.active);

  // viewer NÃO deve receber indicação antiga retransmitida
  assert.ok(await viewer.quiet('stage-indicated'));
  // E a lista de participantes autoritativa não deve conter indicação
  assert.equal(ana2.peers.participants?.find(p => p.peerId === 'ana')?.indication, undefined);
});

test('integration: peers message reports authoritative reservedPeers and omits voluntary leaves', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', recoveryGraceMs: 2000 });
  await app.ready;
  t.after(() => app.close());

  const host = await connect(app, 'room-res', 'host');
  const dropped = await connect(app, 'room-res', 'dropped');
  const leaver = await connect(app, 'room-res', 'leaver');

  // dropped desconecta involuntariamente
  dropped.ws.terminate();
  await host.next('peer-left', e => e.peerId === 'dropped');

  // leaver sai voluntariamente
  leaver.send({ type: 'leave' });
  await host.next('peer-left', e => e.peerId === 'leaver');

  // Novo participante (ou reconexão do espectador) recebe peers
  const viewer = await connect(app, 'room-res', 'viewer');
  assert.ok(viewer.peers.reservedPeers);
  assert.equal(viewer.peers.reservedPeers.length, 1);
  assert.equal(viewer.peers.reservedPeers[0].peerId, 'dropped');
  assert.ok(viewer.peers.reservedPeers[0].reconnectGraceMs > 0);
  assert.ok(viewer.peers.reservedPeers[0].reconnectGraceMs <= 2000);
  // Garante que nenhum token foi exposto em reservedPeers
  assert.equal(viewer.peers.reservedPeers[0].reconnectToken, undefined);
});
