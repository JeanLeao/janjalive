import { createTestRooms } from './helpers/create-rooms.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import {
  createSignalServer,
  isAllowedOrigin,
  parseAllowedOrigins,
  normalizeOrigin,
} from '../dist/server.js';
import {
  loadTurnConfig,
  createTurnCredentialsProvider,
  turnCredentials,
} from '../dist/turn.js';

function connect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const queue = [];
    const waiters = [];
    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      // F38 snapshots are verified in hands.test.js and qa.test.js; these queues assert presence/relay ordering.
      if (parsed.type === 'clips-snapshot' || parsed.type === 'room-state' || parsed.type === 'hands-snapshot' || parsed.type === 'questions-snapshot' || parsed.type === 'polls-snapshot') return;
      if (waiters.length > 0) {
        waiters.shift()(parsed);
      } else {
        queue.push(parsed);
      }
    });
    socket._nextMessage = (timeoutMs = 1000) => {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('Mensagem não recebida no tempo limite')), timeoutMs);
        waiters.push((msg) => { clearTimeout(timer); res(msg); });
      });
    };
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket, timeoutMs = 1000) {
  return socket._nextMessage(timeoutMs);
}

// ---------------------------------------------------------------------------
// SEC-01 & CFG-02: Origin Validation and Host Forgery Prevention
// ---------------------------------------------------------------------------

test('SEC-01: origin validation rejects forged Host header bypass', async () => {
  const allowed = ['http://trusted.local:3000', 'https://app.janjalive.com'];

  // Attacker attempts to forge Host: evil.attacker.com matching Origin: http://evil.attacker.com
  const isAllowed = isAllowedOrigin('http://evil.attacker.com', 'evil.attacker.com', allowed);
  assert.equal(isAllowed, false, 'Forged Host header must NOT bypass origin validation');

  // Attacker attempts to forge Host: app.janjalive.com while sending untrusted Origin
  const isAllowed2 = isAllowedOrigin('http://evil.attacker.com', 'app.janjalive.com', allowed);
  assert.equal(isAllowed2, false, 'Legitimate Host header must NOT authorize untrusted origin');
});

test('CFG-02: normalizeOrigin normalizes valid origins and rejects malformed ones', () => {
  assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeOrigin('https://example.com/'), 'https://example.com');
  assert.equal(normalizeOrigin('  https://APP.example.COM:8443/  '), 'https://app.example.com:8443');
  assert.equal(normalizeOrigin('javascript:alert(1)'), null);
  assert.equal(normalizeOrigin('ftp://ftp.example.com'), null);
  assert.equal(normalizeOrigin('not-a-url'), null);
  assert.equal(normalizeOrigin(''), null);
});

test('CFG-02: parseAllowedOrigins cleans trailing slashes and handles multiple origins', () => {
  const parsed = parseAllowedOrigins(['http://localhost:3000/', '  https://room.example.com/  ', 'invalid-origin']);
  assert.deepEqual(parsed, ['http://localhost:3000', 'https://room.example.com']);
});

test('SEC-01 & CFG-02: rejects forged Host on /turn-credentials and /signal', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: ['http://trusted.local:3000'],
  });
  await app.ready;
  t.after(() => app.close());

  // 1. HTTP /turn-credentials with forged Host
  const response = await fetch(`http://127.0.0.1:${app.port}/turn-credentials`, {
    headers: {
      origin: 'http://evil.attacker.com',
      host: 'evil.attacker.com',
    },
  });
  assert.equal(response.status, 403);

  // 2. WebSocket /signal with forged Host
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${app.port}/signal`, {
        headers: {
          origin: 'http://evil.attacker.com',
          host: 'evil.attacker.com',
        },
      });
      socket.on('open', () => reject(new Error('Should not connect')));
      socket.on('close', (code) => {
        if (code === 4403) resolve(code);
        else reject(new Error(`Closed with unexpected code: ${code}`));
      });
      socket.on('error', () => {});
    })
  );

  // 3. Missing origin header is allowed without presumption of authentication
  const noOriginRes = await fetch(`http://127.0.0.1:${app.port}/turn-credentials`);
  assert.equal(noOriginRes.status, 200);
});

// ---------------------------------------------------------------------------
// CFG-01 & PERF-01: TURN Configuration and Secret Caching
// ---------------------------------------------------------------------------

test('CFG-01: fails fast when TURN secret is configured without TURN_HOST', () => {
  assert.throws(
    () => loadTurnConfig({ TURN_SECRET: 'supersecret' }),
    /TURN_HOST é obrigatório/
  );
});

test('CFG-01: returns STUN-only mode when TURN secret is not configured', () => {
  const config = loadTurnConfig({});
  assert.equal(config.enabled, false);

  const provider = createTurnCredentialsProvider(config);
  const creds = provider();
  assert.equal(creds.iceServers.length, 1);
  assert.ok(creds.iceServers[0].urls.toString().includes('stun:'));
});

test('CFG-01: generates valid TURN credentials when host and secret are provided', () => {
  const config = loadTurnConfig({
    TURN_SECRET: 'testsecret123',
    TURN_HOST: 'turn.janjalive.example',
  });
  assert.equal(config.enabled, true);
  assert.equal(config.host, 'turn.janjalive.example');

  const provider = createTurnCredentialsProvider(config);
  const creds = provider();
  assert.equal(creds.iceServers.length, 2);
  const turnServer = creds.iceServers[1];
  assert.ok(Array.isArray(turnServer.urls));
  assert.ok(turnServer.urls[0].includes('turn.janjalive.example'));
  assert.ok(turnServer.username);
  assert.ok(turnServer.credential);
});

test('CFG-01: loads secret from TURN_SECRET_FILE and throws if file is missing', () => {
  const tempFile = join(tmpdir(), `turn-test-${Date.now()}.txt`);
  writeFileSync(tempFile, 'file-secret-value');
  try {
    const config = loadTurnConfig({
      TURN_SECRET_FILE: tempFile,
      TURN_HOST: 'turn.file.example',
    });
    assert.equal(config.enabled, true);
    assert.equal(config.secret, 'file-secret-value');
  } finally {
    unlinkSync(tempFile);
  }

  // Missing file throws
  assert.throws(
    () => loadTurnConfig({ TURN_SECRET_FILE: '/nonexistent/turn/secret' }),
    /Arquivo de segredo TURN não encontrado/
  );
});

// ---------------------------------------------------------------------------
// DOS-01: Payload Limits and Message Validation
// ---------------------------------------------------------------------------

test('DOS-01: handles invalid JSON gracefully without server crash', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const socket = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => socket.close());

  socket.send('{ invalid json');
  const msg = await nextMessage(socket);
  assert.deepEqual(msg, { type: 'error', message: 'Mensagem inválida.' });
});

test('DOS-01: rejects payloads exceeding maxPayload without server crash', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', maxPayload: 1024 }); // 1 KiB limit for test
  await app.ready;
  const ids = await createTestRooms(app, ["room"]);
  t.after(() => app.close());

  const socket = await connect(`ws://127.0.0.1:${app.port}/signal`);

  const giantMessage = JSON.stringify({
    type: 'join',
    roomId: ids["room"],
    peerId: 'peer',
    nickname: 'x'.repeat(2048),
  });

  const closed = new Promise((resolve) => {
    socket.on('close', (code) => resolve(code));
  });

  socket.send(giantMessage);
  const closeCode = await closed;
  // ws closes with 1009 (Message Too Big)
  assert.equal(closeCode, 1009);
});

test('DOS-01: validates message types and fields against protocol schema', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  const ids = await createTestRooms(app, ["only-room", "r1"]);
  t.after(() => app.close());

  const socket = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => socket.close());

  // Unknown message type
  socket.send(JSON.stringify({ type: 'unknown-command', foo: 'bar' }));
  let err = await nextMessage(socket);
  assert.deepEqual(err, { type: 'error', message: 'Mensagem malformada ou campos inválidos.' });

  // Missing required fields
  socket.send(JSON.stringify({ type: 'join', roomId: ids["only-room"] }));
  err = await nextMessage(socket);
  assert.deepEqual(err, { type: 'error', message: 'Mensagem malformada ou campos inválidos.' });

  // Nickname exceeding 32 chars
  socket.send(JSON.stringify({ type: 'join', roomId: ids["r1"], peerId: 'p1', nickname: 'a'.repeat(33) }));
  err = await nextMessage(socket);
  assert.deepEqual(err, { type: 'error', message: 'Mensagem malformada ou campos inválidos.' });
});

test('DOS-01: rejects messages sent before join', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const socket = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => socket.close());

  // Send signal before join
  socket.send(JSON.stringify({ type: 'signal', target: 'someone', data: { type: 'offer' } }));
  const err = await nextMessage(socket);
  assert.deepEqual(err, {
    type: 'error',
    message: 'Socket não associado a uma sala. Envie join primeiro.',
  });
});

test('DOS-01: handles relay to non-existent peer gracefully', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  const ids = await createTestRooms(app, ["room1"]);
  t.after(() => app.close());

  const socket = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => socket.close());

  socket.send(JSON.stringify({ type: 'join', roomId: ids["room1"], peerId: 'p1' }));
  await nextMessage(socket); // peers message

  // Send signal to ghost peer
  socket.send(JSON.stringify({ type: 'signal', target: 'non-existent-peer', data: { type: 'offer' } }));
  const err = await nextMessage(socket);
  assert.deepEqual(err, {
    type: 'error',
    message: 'Participante destinatário não encontrado na sala.',
  });
});

// ---------------------------------------------------------------------------
// REL-01: Heartbeat and Inactive Socket Termination
// ---------------------------------------------------------------------------

test('REL-01: terminates unresponsive sockets and cleans up presence', async (t) => {
  // Use very short heartbeat interval (40ms) for fast test execution
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    heartbeatIntervalMs: 40,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["heartbeat-room"]);
  t.after(() => app.close());

  const host = await connect(`ws://127.0.0.1:${app.port}/signal`);
  const inactiveViewer = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => host.close());

  host.send(JSON.stringify({ type: 'join', roomId: ids["heartbeat-room"], peerId: 'host-1' }));
  await nextMessage(host); // peers

  inactiveViewer.send(JSON.stringify({ type: 'join', roomId: ids["heartbeat-room"], peerId: 'viewer-1' }));
  await nextMessage(inactiveViewer); // peers
  await nextMessage(host); // peer-joined

  // Block pong responses from inactiveViewer to simulate an unresponsive zombie connection
  inactiveViewer.pong = () => {};
  // Prevent default auto-pong behavior in ws
  inactiveViewer._receiver.onPing = () => {};

  // Wait for server heartbeat tick and termination
  const peerLeftMessage = await nextMessage(host, 1500);
  assert.deepEqual(peerLeftMessage, {
    type: 'peer-left',
    reconnectGraceMs: 30000,
    peerId: 'viewer-1',
    count: 1,
  });
});

// ---------------------------------------------------------------------------
// BUG-01: PeerId Collision and Rapid Reconnect
// ---------------------------------------------------------------------------

test('BUG-01: handles peerId collision deterministically and avoids ghost disconnects', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  const ids = await createTestRooms(app, ["col-room"]);
  t.after(() => app.close());

  const observer = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => observer.close());

  observer.send(JSON.stringify({ type: 'join', roomId: ids["col-room"], peerId: 'observer' }));
  await nextMessage(observer); // peers

  // Client 1 connects as peer-alpha
  const socket1 = await connect(`ws://127.0.0.1:${app.port}/signal`);
  socket1.send(JSON.stringify({ type: 'join', roomId: ids["col-room"], peerId: 'peer-alpha', nickname: 'Alpha1' }));
  const socket1Peers = await nextMessage(socket1); // peers
  await nextMessage(observer); // peer-joined

  // Client 2 connects rapidly reusing the same peerId (rapid legitimate reconnect with token)
  const socket2 = await connect(`ws://127.0.0.1:${app.port}/signal`);
  t.after(() => socket2.close());

  const socket1Closed = new Promise((resolve) => {
    socket1.on('close', (code) => resolve(code));
  });

  socket2.send(
    JSON.stringify({
      type: 'join',
      roomId: ids["col-room"],
      peerId: 'peer-alpha',
      nickname: 'Alpha2',
      reconnectToken: socket1Peers.reconnectToken,
    })
  );
  const socket2Peers = await nextMessage(socket2);
  assert.equal(socket2Peers.type, 'peers');

  // Socket 1 must be closed deterministically by the server with code 4000
  const closeCode = await socket1Closed;
  assert.equal(closeCode, 4000);

  // When socket 1 closes, it must NOT trigger peer-left on the observer or corrupt socket 2's session
  // Wait slightly to ensure no false peer-left was broadcast
  let unexpectedMessage = null;
  try {
    unexpectedMessage = await nextMessage(observer, 100);
  } catch {
    // Expected: observer did NOT receive false peer-left
  }
  assert.equal(unexpectedMessage?.type === 'peer-left', false, 'Observer must not receive false peer-left');

  // Socket 2 is still functional and can relay signals
  socket2.send(JSON.stringify({ type: 'signal', target: 'observer', data: { type: 'offer', sdp: 'new-sdp' } }));
  const observerSignal = await nextMessage(observer);
  assert.deepEqual(observerSignal, {
    type: 'signal',
    from: 'peer-alpha',
    data: { type: 'offer', sdp: 'new-sdp' },
  });
});
