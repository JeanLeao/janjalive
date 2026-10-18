import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queue = [];
    const waiters = [];
    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      // F38 snapshots are verified in hands.test.js and qa.test.js; these queues assert presence/relay ordering.
      if (parsed.type === 'hands-snapshot' || parsed.type === 'questions-snapshot') return;
      if (waiters.length > 0) {
        waiters.shift()(parsed);
      } else {
        queue.push(parsed);
      }
    });
    socket._nextMessage = () => {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('Mensagem não recebida')), 1000);
        waiters.push((msg) => { clearTimeout(timer); res(msg); });
      });
    };
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket) {
  return socket._nextMessage();
}

test('signaling: reports presence count and broadcast peer-joined to existing peers', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const url = `ws://127.0.0.1:${app.port}/signal`;
  const host = await connect(url);
  const viewer = await connect(url);
  const third = await connect(url);
  t.after(() => [host, viewer, third].forEach((socket) => socket.close()));

  host.send(JSON.stringify({ type: 'join', roomId: 'demo', peerId: 'host' }));
  const hostPeers = await nextMessage(host);
  assert.equal(hostPeers.type, 'peers');
  assert.deepEqual(hostPeers.peers, []);
  assert.equal(hostPeers.count, 1);
  assert.deepEqual(hostPeers.participants, [{ peerId: 'host' }]);
  assert.ok(typeof hostPeers.reconnectToken === 'string' && hostPeers.reconnectToken.length >= 16);

  viewer.send(JSON.stringify({ type: 'join', roomId: 'demo', peerId: 'viewer' }));
  const viewerPeers = await nextMessage(viewer);
  assert.equal(viewerPeers.type, 'peers');
  assert.deepEqual(viewerPeers.peers, ['host']);
  assert.equal(viewerPeers.count, 2);
  assert.deepEqual(viewerPeers.participants, [{ peerId: 'host' }, { peerId: 'viewer' }]);
  assert.ok(typeof viewerPeers.reconnectToken === 'string' && viewerPeers.reconnectToken.length >= 16);
  assert.deepEqual(await nextMessage(host), { type: 'peer-joined', peerId: 'viewer', count: 2 });

  third.send(JSON.stringify({ type: 'join', roomId: 'demo', peerId: 'third' }));
  const thirdPeers = await nextMessage(third);
  assert.equal(thirdPeers.type, 'peers');
  assert.deepEqual(thirdPeers.peers, ['host', 'viewer']);
  assert.equal(thirdPeers.count, 3);
  assert.deepEqual(thirdPeers.participants, [{ peerId: 'host' }, { peerId: 'viewer' }, { peerId: 'third' }]);
  assert.ok(typeof thirdPeers.reconnectToken === 'string' && thirdPeers.reconnectToken.length >= 16);
  assert.deepEqual(await nextMessage(host), { type: 'peer-joined', peerId: 'third', count: 3 });
  assert.deepEqual(await nextMessage(viewer), { type: 'peer-joined', peerId: 'third', count: 3 });
});

test('signaling: registers and broadcasts temporary nicknames', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const url = `ws://127.0.0.1:${app.port}/signal`;
  const host = await connect(url);
  const viewer = await connect(url);
  t.after(() => [host, viewer].forEach((socket) => socket.close()));

  host.send(JSON.stringify({ type: 'join', roomId: 'nick-room', peerId: 'p1', nickname: 'Aldo' }));
  const hostPeers = await nextMessage(host);
  assert.equal(hostPeers.type, 'peers');
  assert.deepEqual(hostPeers.peers, []);
  assert.equal(hostPeers.count, 1);
  assert.deepEqual(hostPeers.participants, [{ peerId: 'p1', nickname: 'Aldo' }]);
  assert.ok(typeof hostPeers.reconnectToken === 'string');

  viewer.send(JSON.stringify({ type: 'join', roomId: 'nick-room', peerId: 'p2', nickname: 'Marina' }));
  const viewerPeers = await nextMessage(viewer);
  assert.equal(viewerPeers.type, 'peers');
  assert.deepEqual(viewerPeers.peers, ['p1']);
  assert.equal(viewerPeers.count, 2);
  assert.deepEqual(viewerPeers.participants, [{ peerId: 'p1', nickname: 'Aldo' }, { peerId: 'p2', nickname: 'Marina' }]);
  assert.ok(typeof viewerPeers.reconnectToken === 'string');

  const broadcastedToHost = await nextMessage(host);
  assert.deepEqual(broadcastedToHost, {
    type: 'peer-joined',
    peerId: 'p2',
    count: 2,
    nickname: 'Marina',
  });
});

test('signaling: propagates nickname updates and removal, avoiding redundant updates', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const url = `ws://127.0.0.1:${app.port}/signal`;
  const host = await connect(url);
  const viewer = await connect(url);
  t.after(() => [host, viewer].forEach((socket) => socket.close()));

  host.send(JSON.stringify({ type: 'join', roomId: 'nick-sync', peerId: 'p1', nickname: 'Aldo' }));
  await nextMessage(host); // peers message

  viewer.send(JSON.stringify({ type: 'join', roomId: 'nick-sync', peerId: 'p2', nickname: 'Marina' }));
  await nextMessage(viewer); // peers message
  await nextMessage(host); // peer-joined message

  // 1. Viewer updates nickname
  viewer.send(JSON.stringify({ type: 'update-nickname', nickname: '  Marina Silva  ' }));
  const hostReceivedUpdate = await nextMessage(host);
  assert.deepEqual(hostReceivedUpdate, {
    type: 'peer-updated',
    peerId: 'p2',
    nickname: 'Marina Silva',
  });

  // 2. Viewer sends redundant update with same nickname - should NOT be broadcast
  viewer.send(JSON.stringify({ type: 'update-nickname', nickname: 'Marina Silva' }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 3. Viewer removes nickname (empty string)
  viewer.send(JSON.stringify({ type: 'update-nickname', nickname: '' }));
  const hostReceivedRemoval = await nextMessage(host);
  assert.deepEqual(hostReceivedRemoval, {
    type: 'peer-updated',
    peerId: 'p2',
  });

  // 4. Host updates nickname
  host.send(JSON.stringify({ type: 'update-nickname', nickname: 'Aldo M.' }));
  const viewerReceivedHostUpdate = await nextMessage(viewer);
  assert.deepEqual(viewerReceivedHostUpdate, {
    type: 'peer-updated',
    peerId: 'p1',
    nickname: 'Aldo M.',
  });
});

test('signaling: relays targeted signaling data', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const url = `ws://127.0.0.1:${app.port}/signal`;
  const host = await connect(url);
  const viewer = await connect(url);
  t.after(() => [host, viewer].forEach((socket) => socket.close()));

  host.send(JSON.stringify({ type: 'join', roomId: 'relay', peerId: 'host' }));
  await nextMessage(host);

  viewer.send(JSON.stringify({ type: 'join', roomId: 'relay', peerId: 'viewer' }));
  await nextMessage(viewer);
  await nextMessage(host);

  const offer = { type: 'signal', target: 'viewer', data: { type: 'offer', sdp: 'fake-sdp' } };
  const received = nextMessage(viewer);
  host.send(JSON.stringify(offer));

  assert.deepEqual(await received, { type: 'signal', from: 'host', data: offer.data });
});

test('signaling: responds with turn credentials on /turn-credentials', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const response = await fetch(`http://127.0.0.1:${app.port}/turn-credentials`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(Array.isArray(data.iceServers), true);
  assert.equal(data.iceServers.length > 0, true);
  // Must NOT send wildcard *
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('signaling: origin policy allows allowed origins and rejects unauthorized origins on /turn-credentials', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: ['http://trusted.local:3001'],
  });
  await app.ready;
  t.after(() => app.close());

  // Allowed origin
  const allowedRes = await fetch(`http://127.0.0.1:${app.port}/turn-credentials`, {
    headers: { origin: 'http://trusted.local:3001' },
  });
  assert.equal(allowedRes.status, 200);
  assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'http://trusted.local:3001');

  // Unauthorized origin
  const rejectedRes = await fetch(`http://127.0.0.1:${app.port}/turn-credentials`, {
    headers: { origin: 'http://evil.hacker.com' },
  });
  assert.equal(rejectedRes.status, 403);
  assert.equal(rejectedRes.headers.get('access-control-allow-origin'), null);
});

test('signaling: origin policy rejects WebSocket connection from untrusted origin', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: ['http://trusted.local:3001'],
  });
  await app.ready;
  t.after(() => app.close());

  const url = `ws://127.0.0.1:${app.port}/signal`;

  // Attempt connection with evil origin
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: { origin: 'http://evil.hacker.com' },
      });
      socket.on('open', () => reject(new Error('Should not have opened')));
      socket.on('close', (code) => {
        if (code === 4403) resolve(code);
        else reject(new Error(`Closed with unexpected code: ${code}`));
      });
      socket.on('error', () => {});
    }),
  );
});

test('signaling: returns 200 on /healthz and 404 for unknown HTTP paths', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const healthRes = await fetch(`http://127.0.0.1:${app.port}/healthz`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'ok');

  const notFoundRes = await fetch(`http://127.0.0.1:${app.port}/`);
  assert.equal(notFoundRes.status, 404);

  const unknownRes = await fetch(`http://127.0.0.1:${app.port}/random-path`);
  assert.equal(unknownRes.status, 404);
});

test('sharing updates belong to socket identity and are included in late join snapshots', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());
  const url = `ws://127.0.0.1:${app.port}/signal`;
  const host = await connect(url), viewer = await connect(url), late = await connect(url);
  t.after(() => [host, viewer, late].forEach(socket => socket.close()));
  host.send(JSON.stringify({ type: 'join', roomId: 'sharing-state', peerId: 'host' }));
  await nextMessage(host);
  viewer.send(JSON.stringify({ type: 'join', roomId: 'sharing-state', peerId: 'viewer' }));
  await nextMessage(viewer); await nextMessage(host);
  const sharing = { active: true, streamId: 'screen-1', hasAudio: true, audioMuted: false };
  host.send(JSON.stringify({ type: 'update-sharing', peerId: 'viewer', ...sharing }));
  assert.deepEqual(await nextMessage(viewer), { type: 'sharing-updated', peerId: 'host', ...sharing });
  late.send(JSON.stringify({ type: 'join', roomId: 'sharing-state', peerId: 'late' }));
  const snapshot = await nextMessage(late);
  assert.deepEqual(snapshot.participants.find(p => p.peerId === 'host').sharing, sharing);
  assert.equal(snapshot.participants.find(p => p.peerId === 'viewer').sharing, undefined);
  await nextMessage(host); await nextMessage(viewer);
  host.send(JSON.stringify({ type: 'update-sharing', active: false, hasAudio: false, audioMuted: false }));
  assert.equal((await nextMessage(viewer)).active, false);
  assert.equal((await nextMessage(late)).active, false);
});
