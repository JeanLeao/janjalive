import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer } from '../dist/server.js';
import { WS_CLOSE_CODES, isTerminalCloseCode } from '@screen-room/protocol';

function connect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const queue = [];
    const waiters = [];
    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      // F38 snapshots are verified in hands.test.js and qa.test.js; these queues assert presence/relay ordering.
      if (parsed.type === 'hands-snapshot' || parsed.type === 'questions-snapshot' || parsed.type === 'polls-snapshot') return;
      if (waiters.length > 0) {
        waiters.shift()(parsed);
      } else {
        queue.push(parsed);
      }
    });
    socket._nextMessage = (timeoutMs = 2000) => {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((res, rej) => {
        let waiter;
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx !== -1) waiters.splice(idx, 1);
          rej(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
        }, timeoutMs);
        waiter = (msg) => {
          clearTimeout(timer);
          res(msg);
        };
        waiters.push(waiter);
      });
    };
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket, timeoutMs = 2000) {
  return socket._nextMessage(timeoutMs);
}

function waitForClose(socket, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for close after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

test('SEC-03: 1 & 2 - primeiro ingresso sem token e recebimento privado do token', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  t.after(() => { s1.close(); s2.close(); });

  // 1. Primeiro ingresso sem token
  s1.send(JSON.stringify({ type: 'join', roomId: 'sec-room-1', peerId: 'alice', nickname: 'Alice' }));
  const alicePeers = await nextMessage(s1);

  // 2. Recebimento privado do token
  assert.equal(alicePeers.type, 'peers');
  assert.ok(typeof alicePeers.reconnectToken === 'string' && alicePeers.reconnectToken.length >= 16);

  // 9. Ausência de vazamento do token para outros participantes
  s2.send(JSON.stringify({ type: 'join', roomId: 'sec-room-1', peerId: 'bob', nickname: 'Bob' }));
  const bobPeers = await nextMessage(s2);
  const aliceJoinedNotif = await nextMessage(s1);

  // Bob recebe seu próprio token distinto
  assert.ok(typeof bobPeers.reconnectToken === 'string');
  assert.notEqual(bobPeers.reconnectToken, alicePeers.reconnectToken);

  // A mensagem peer-joined enviada para Alice NÃO contém o token de Bob
  assert.equal(aliceJoinedNotif.type, 'peer-joined');
  assert.equal(aliceJoinedNotif.peerId, 'bob');
  assert.equal(aliceJoinedNotif.reconnectToken, undefined, 'Mensagens de presença NUNCA devem vazar reconnectToken');
});

test('SEC-03: 3, 4, 5, 6 - substituição legítima vs ataque sem token e com token inválido', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const aliceSocket = await connect(wsUrl);
  t.after(() => aliceSocket.close());

  aliceSocket.send(JSON.stringify({ type: 'join', roomId: 'sec-room-2', peerId: 'alice', nickname: 'Alice' }));
  const alicePeers = await nextMessage(aliceSocket);
  const legitimateToken = alicePeers.reconnectToken;
  assert.ok(legitimateToken);

  // 4. Tentativa de substituição sem token (ataque de impostor)
  const imposter1 = await connect(wsUrl);
  const imposter1ClosePromise = waitForClose(imposter1);

  imposter1.send(JSON.stringify({ type: 'join', roomId: 'sec-room-2', peerId: 'alice', nickname: 'Imposter1' }));
  const err1 = await nextMessage(imposter1);
  assert.equal(err1.type, 'error');
  assert.equal(err1.code, 'UNAUTHORIZED_RECONNECT');

  const imposter1Close = await imposter1ClosePromise;
  assert.equal(imposter1Close.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);
  assert.equal(imposter1Close.code, 4401);
  assert.equal(isTerminalCloseCode(imposter1Close.code), true);

  // 6. Preservação da sessão original após ataque
  assert.equal(aliceSocket.readyState, WebSocket.OPEN, 'Sessão original da Alice deve permanecer aberta e intocada');

  // 5. Tentativa de substituição com token inválido
  const imposter2 = await connect(wsUrl);
  const imposter2ClosePromise = waitForClose(imposter2);

  imposter2.send(
    JSON.stringify({
      type: 'join',
      roomId: 'sec-room-2',
      peerId: 'alice',
      nickname: 'Imposter2',
      reconnectToken: 'forged-token-abc',
    })
  );
  const err2 = await nextMessage(imposter2);
  assert.equal(err2.type, 'error');
  assert.equal(err2.code, 'UNAUTHORIZED_RECONNECT');

  const imposter2Close = await imposter2ClosePromise;
  assert.equal(imposter2Close.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);
  assert.equal(aliceSocket.readyState, WebSocket.OPEN, 'Alice continua conectada e operacional');

  // 3. Reconexão legítima com token válido
  const aliceNewSocket = await connect(wsUrl);
  t.after(() => aliceNewSocket.close());
  const aliceOldClosePromise = waitForClose(aliceSocket);

  aliceNewSocket.send(
    JSON.stringify({
      type: 'join',
      roomId: 'sec-room-2',
      peerId: 'alice',
      nickname: 'Alice Reconnected',
      reconnectToken: legitimateToken,
    })
  );
  const aliceNewPeers = await nextMessage(aliceNewSocket);
  assert.equal(aliceNewPeers.type, 'peers');
  assert.equal(aliceNewPeers.reconnectToken, legitimateToken, 'Mesmo token preservado para a sessão legítima');

  // O socket antigo da Alice é encerrado com código terminal SUPERSEDED (4000)
  const oldClose = await aliceOldClosePromise;
  assert.equal(oldClose.code, WS_CLOSE_CODES.SUPERSEDED);
  assert.equal(oldClose.code, 4000);
});

test('SEC-03: 7 - reconexão com dez participantes na sala sem ultrapassar capacidade', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1', maxParticipantsPerRoom: 10 });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = 'room-10-sec';
  const participants = [];

  // Conecta 10 participantes legítimos
  for (let i = 1; i <= 10; i++) {
    const s = await connect(wsUrl);
    const peerId = `user-${i}`;
    s.send(JSON.stringify({ type: 'join', roomId, peerId, nickname: `User ${i}` }));
    const peersMsg = await nextMessage(s);
    participants.push({ peerId, socket: s, token: peersMsg.reconnectToken });
  }

  // Impostor tenta usurpar a vaga do user-5 sem token -> Rejeitado com 4401
  const imposter = await connect(wsUrl);
  const imposterClosePromise = waitForClose(imposter);
  imposter.send(JSON.stringify({ type: 'join', roomId, peerId: 'user-5' }));
  const imposterErr = await nextMessage(imposter);
  assert.equal(imposterErr.code, 'UNAUTHORIZED_RECONNECT');
  const impClose = await imposterClosePromise;
  assert.equal(impClose.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);

  // Reconexão legítima do user-5 com seu token quando a sala tem 10 participantes
  const target = participants[4];
  const oldSocketClosePromise = waitForClose(target.socket);
  const newSocket = await connect(wsUrl);
  t.after(() => newSocket.close());

  newSocket.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: target.peerId,
      nickname: 'User 5 Reconnected',
      reconnectToken: target.token,
    })
  );

  const newPeers = await nextMessage(newSocket);
  assert.equal(newPeers.type, 'peers');
  assert.equal(newPeers.count, 10, 'Reconexão legítima não deve estourar a capacidade nem consumir vaga adicional');

  const targetOldClose = await oldSocketClosePromise;
  assert.equal(targetOldClose.code, WS_CLOSE_CODES.SUPERSEDED);

  // Limpa sockets
  for (const p of participants) p.socket.close();
});

test('SEC-03: 8 - saída e encerramento de sessão limpam credenciais efêmeras', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const s1 = await connect(wsUrl);
  s1.send(JSON.stringify({ type: 'join', roomId: 'exit-room', peerId: 'alice' }));
  const peers1 = await nextMessage(s1);
  const oldToken = peers1.reconnectToken;
  assert.ok(oldToken);

  // Alice sai definitivamente
  s1.close();
  await new Promise((r) => setTimeout(r, 50));

  // Novo ingresso com peerId alice: a sessão anterior foi destruída, novo token deve ser emitido
  const s2 = await connect(wsUrl);
  t.after(() => s2.close());
  s2.send(JSON.stringify({ type: 'join', roomId: 'exit-room', peerId: 'alice' }));
  const peers2 = await nextMessage(s2);
  assert.equal(peers2.type, 'peers');
  assert.notEqual(peers2.reconnectToken, oldToken, 'Novo ingresso em sessão limpa gera um novo token criptográfico');
});

test('SEC-03: 10 - ausência de loops de reconexão para códigos terminais', () => {
  // WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT (4401) é código terminal
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT), true);
  assert.equal(isTerminalCloseCode(4401), true);

  // Códigos terminais reconhecidos
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.NORMAL), true);
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.POLICY_VIOLATION), true);
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.SUPERSEDED), true);
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.ROOM_FULL), true);
  assert.equal(isTerminalCloseCode(WS_CLOSE_CODES.FORBIDDEN_ORIGIN), true);

  // Códigos transitórios que DEVEM permitir reconexão com backoff
  assert.equal(isTerminalCloseCode(1006), false); // Queda de rede
  assert.equal(isTerminalCloseCode(1011), false); // Erro temporário
});

test('SEC-03: 11 - recuperação após remoção abrupta do socket protege contra sequestro e restaura sessão legítima', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = 'sec-recovery-room';

  // 1. Alice ingressa na sala e recebe seu peerId e reconnectToken
  const aliceSocket = await connect(wsUrl);
  aliceSocket.send(JSON.stringify({ type: 'join', roomId, peerId: 'alice', nickname: 'Alice Original' }));
  const alicePeers = await nextMessage(aliceSocket);
  assert.equal(alicePeers.type, 'peers');
  const aliceToken = alicePeers.reconnectToken;
  assert.ok(aliceToken, 'Alice deve receber um token de reconexão válido');

  // 2. Outros participantes (Bob) conhecem o peerId público de Alice
  const bobSocket = await connect(wsUrl);
  t.after(() => bobSocket.close());
  bobSocket.send(JSON.stringify({ type: 'join', roomId, peerId: 'bob', nickname: 'Bob' }));
  const bobPeers = await nextMessage(bobSocket);
  assert.equal(bobPeers.type, 'peers');
  const aliceBobJoined = await nextMessage(aliceSocket);
  assert.equal(aliceBobJoined.type, 'peer-joined');
  assert.equal(aliceBobJoined.peerId, 'bob');

  // 3. Alice perde abruptamente sua conexão (queda de rede, terminate)
  aliceSocket.terminate();

  // 4. O servidor detecta a perda e remove o socket ativo; Bob recebe peer-left
  const bobPeerLeft = await nextMessage(bobSocket);
  assert.equal(bobPeerLeft.type, 'peer-left');
  assert.equal(bobPeerLeft.peerId, 'alice');
  assert.equal(bobPeerLeft.count, 1);

  // 5. Antes de Alice reconectar, um segundo cliente (impostor) tenta ingressar usando o mesmo peerId sem o token de Alice
  const imposterSocket = await connect(wsUrl);
  const imposterClosePromise = waitForClose(imposterSocket);
  imposterSocket.send(JSON.stringify({ type: 'join', roomId, peerId: 'alice', nickname: 'Imposter' }));

  const imposterErr = await nextMessage(imposterSocket);
  assert.equal(imposterErr.type, 'error');
  assert.equal(imposterErr.code, 'UNAUTHORIZED_RECONNECT');
  const impClose = await imposterClosePromise;
  assert.equal(impClose.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);
  assert.equal(impClose.code, 4401);

  // Bob NÃO recebe nenhuma notificação espúria de entrada do impostor
  let spurious = null;
  try {
    spurious = await nextMessage(bobSocket, 50);
  } catch {
    // Timeout esperado
  }
  assert.equal(spurious, null, 'Bob não deve receber peer-joined para impostor rejeitado');

  // 6. Alice recupera sua sessão utilizando seu token legítimo
  const aliceRecoveredSocket = await connect(wsUrl);
  t.after(() => aliceRecoveredSocket.close());
  aliceRecoveredSocket.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: 'alice',
      reconnectToken: aliceToken,
    })
  );

  const aliceRecoveredPeers = await nextMessage(aliceRecoveredSocket);
  assert.equal(aliceRecoveredPeers.type, 'peers');
  assert.equal(aliceRecoveredPeers.count, 2);
  assert.equal(aliceRecoveredPeers.reconnectToken, aliceToken, 'Token original deve ser mantido');

  // Bob recebe notificação legítima do retorno de Alice com o nickname original preservado
  const bobAliceRejoined = await nextMessage(bobSocket);
  assert.equal(bobAliceRejoined.type, 'peer-joined');
  assert.equal(bobAliceRejoined.peerId, 'alice');
  assert.equal(bobAliceRejoined.count, 2);
  assert.equal(bobAliceRejoined.nickname, 'Alice Original');
});

test('SEC-03: 12 - saída voluntária via mensagem leave limpa imediatamente reserva e vaga', async (t) => {
  const app = createSignalServer({ port: 0, host: '127.0.0.1' });
  await app.ready;
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = 'sec-voluntary-room';

  const s1 = await connect(wsUrl);
  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'charlie', nickname: 'Charlie' }));
  const p1 = await nextMessage(s1);
  const oldToken = p1.reconnectToken;
  assert.ok(oldToken);

  // Envia mensagem voluntária de saída
  s1.send(JSON.stringify({ type: 'leave' }));
  s1.close(WS_CLOSE_CODES.NORMAL);
  await new Promise((r) => setTimeout(r, 50));

  // Novo participante ingressando com o mesmo peerId entra como nova sessão limpa
  const s2 = await connect(wsUrl);
  t.after(() => s2.close());
  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'charlie' }));
  const p2 = await nextMessage(s2);
  assert.equal(p2.type, 'peers');
  assert.notEqual(p2.reconnectToken, oldToken, 'Nova sessão gera novo token sem exigir recuperação');
});
