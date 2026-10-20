import { createTestRooms } from './helpers/create-rooms.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalServer, parseMaxParticipants } from '../dist/server.js';
import { WS_CLOSE_CODES, isTerminalCloseCode } from '@screen-room/protocol';

function connect(url, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const queue = [];
    const waiters = [];
    socket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      // F38 snapshots are verified in hands.test.js and qa.test.js; these queues assert presence/relay ordering.
      if (parsed.type === 'room-state' || parsed.type === 'hands-snapshot' || parsed.type === 'questions-snapshot' || parsed.type === 'polls-snapshot') return;
      if (waiters.length > 0) {
        waiters.shift()(parsed);
      } else {
        queue.push(parsed);
      }
    });
    socket._nextMessage = (timeoutMs = 1500) => {
      if (queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((res, rej) => {
        let waiter;
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx !== -1) waiters.splice(idx, 1);
          rej(new Error('Mensagem não recebida no tempo limite'));
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

function nextMessage(socket, timeoutMs = 1500) {
  return socket._nextMessage(timeoutMs);
}

function waitForClose(socket, timeoutMs = 1500) {
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

// ---------------------------------------------------------------------------
// 1. Capacity configuration parsing
// ---------------------------------------------------------------------------

test('capacity: parseMaxParticipants defaults to 10 and parses environment variables', () => {
  assert.equal(parseMaxParticipants(), 10, 'Default capacity must be 10');
  assert.equal(parseMaxParticipants(undefined, {}), 10);
  assert.equal(parseMaxParticipants(5), 5);
  assert.equal(parseMaxParticipants(undefined, { MAX_PARTICIPANTS_PER_ROOM: '15' }), 15);
  assert.equal(parseMaxParticipants(undefined, { MAX_ROOM_CAPACITY: '8' }), 8);
  assert.equal(parseMaxParticipants(undefined, { MAX_PARTICIPANTS: '12' }), 12);
  // Invalid values fallback to 10
  assert.equal(parseMaxParticipants(-2), 10);
  assert.equal(parseMaxParticipants(undefined, { MAX_PARTICIPANTS_PER_ROOM: 'invalid' }), 10);
});

// ---------------------------------------------------------------------------
// 2. Full 10-participant load flow:
//    - Sequential entry of 10 participants
//    - Rejection of 11th participant with code 4009
//    - Preserved session of existing 10 participants
//    - Voluntary departure freeing slot immediately
//    - Admission of new participant into freed slot
//    - Abrupt disconnect freeing slot
//    - Reconnect of participant in full room without consuming extra slot
//    - Superseded socket closure with code 4000
//    - Nickname propagation to all participants
//    - Signal relay (offers, answers, ICE candidates)
// ---------------------------------------------------------------------------

test('capacity: controlled 10-participant room lifecycle, rejection, reconnection, and signaling relay', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 10,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["capacidade-sala-10"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["capacidade-sala-10"];
  const participants = [];

  // Helper to safely close all sockets at end
  t.after(() => {
    for (const p of participants) {
      try {
        p.socket.close();
      } catch {
        // ignore
      }
    }
  });

  // 1. Sequential entry of 10 participants
  for (let i = 1; i <= 10; i++) {
    const peerId = `participante-${i}`;
    const nickname = `Usuario ${i}`;
    const socket = await connect(wsUrl);

    socket.send(JSON.stringify({ type: 'join', roomId, peerId, nickname }));
    const peersMsg = await nextMessage(socket);
    participants.push({ peerId, nickname, socket, reconnectToken: peersMsg.reconnectToken });

    assert.equal(peersMsg.type, 'peers');
    assert.equal(peersMsg.count, i, `Contagem esperada ao entrar participante ${i}`);
    assert.equal(peersMsg.peers.length, i - 1, `Lista de outros peers esperada para participante ${i}`);

    // All previously connected participants must receive peer-joined
    for (let j = 0; j < i - 1; j++) {
      const joinNotif = await nextMessage(participants[j].socket);
      assert.equal(joinNotif.type, 'peer-joined');
      assert.equal(joinNotif.peerId, peerId);
      assert.equal(joinNotif.count, i);
      assert.equal(joinNotif.nickname, nickname);
    }
  }

  assert.equal(participants.length, 10, 'Sala deve possuir exatamente 10 participantes registrados');

  // 2. Rejection of the 11th participant
  const socket11 = await connect(wsUrl);
  let socket11CloseCode = null;
  const socket11Closed = new Promise((resolve) => {
    socket11.on('close', (code) => {
      socket11CloseCode = code;
      resolve(code);
    });
  });

  socket11.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: 'participante-11-excedente',
      nickname: 'Excedente',
    })
  );

  const errorMsg = await nextMessage(socket11);
  assert.equal(errorMsg.type, 'error');
  assert.ok(
    errorMsg.message.includes('10 participantes'),
    `Mensagem deve indicar capacidade máxima de 10: ${errorMsg.message}`
  );
  assert.equal(errorMsg.code, 'ROOM_FULL');

  // The 11th socket must be closed with terminal close code 4009
  await socket11Closed;
  assert.equal(socket11CloseCode, WS_CLOSE_CODES.ROOM_FULL);
  assert.equal(isTerminalCloseCode(socket11CloseCode), true);

  // Existing 10 participants must NOT receive peer-joined or any disruption
  for (const p of participants) {
    let unexpected = null;
    try {
      unexpected = await nextMessage(p.socket, 60);
    } catch {
      // Expected timeout: no spurious message received
    }
    assert.equal(unexpected, null, 'Nenhum dos 10 participantes legítimos deve receber notificações do 11º rejeitado');
  }

  // 3. Voluntary departure of Participant 10 and immediate admission of another
  const p10 = participants.pop();
  p10.socket.close();

  // All remaining 9 participants receive peer-left notification with count: 9
  for (const p of participants) {
    const leftNotif = await nextMessage(p.socket);
    assert.equal(leftNotif.type, 'peer-left');
    assert.equal(leftNotif.peerId, p10.peerId);
    assert.equal(leftNotif.count, 9);
  }

  // Now a replacement participant can join immediately into the freed slot
  const socketReplacement = await connect(wsUrl);
  const replacementPeerId = 'participante-10-substituto';
  participants.push({ peerId: replacementPeerId, nickname: 'Substituto', socket: socketReplacement });

  socketReplacement.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: replacementPeerId,
      nickname: 'Substituto',
    })
  );

  const repPeersMsg = await nextMessage(socketReplacement);
  assert.equal(repPeersMsg.type, 'peers');
  assert.equal(repPeersMsg.count, 10);
  assert.equal(repPeersMsg.peers.length, 9);

  // The other 9 participants receive peer-joined with count: 10
  for (let i = 0; i < 9; i++) {
    const joinNotif = await nextMessage(participants[i].socket);
    assert.equal(joinNotif.type, 'peer-joined');
    assert.equal(joinNotif.peerId, replacementPeerId);
    assert.equal(joinNotif.count, 10);
  }

  // 4. Reconnection of an existing participant when room has 10 people
  // Participant 3 reconnects with a new socket reusing the same peerId
  const p3Index = 2; // index 2 is participante-3
  const p3OldSocket = participants[p3Index].socket;
  const p3NewSocket = await connect(wsUrl);

  const p3OldSocketClosed = new Promise((resolve) => {
    p3OldSocket.on('close', (code) => resolve(code));
  });

  p3NewSocket.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: participants[p3Index].peerId,
      nickname: 'Usuario 3 Reconectado',
      reconnectToken: participants[p3Index].reconnectToken,
    })
  );

  const p3PeersMsg = await nextMessage(p3NewSocket);
  assert.equal(p3PeersMsg.type, 'peers');
  assert.equal(p3PeersMsg.count, 10, 'A reconexão NÃO deve consumir vaga adicional, mantendo 10');

  // The old socket must be closed with terminal close code 4000 (superseded)
  const oldCloseCode = await p3OldSocketClosed;
  assert.equal(oldCloseCode, WS_CLOSE_CODES.SUPERSEDED);
  assert.equal(isTerminalCloseCode(oldCloseCode), true);

  // Update socket in array
  participants[p3Index].socket = p3NewSocket;

  // The other 9 participants receive peer-joined reflecting the updated presence without duplicating
  for (let i = 0; i < 10; i++) {
    if (i !== p3Index) {
      const joinNotif = await nextMessage(participants[i].socket);
      assert.equal(joinNotif.type, 'peer-joined');
      assert.equal(joinNotif.peerId, participants[p3Index].peerId);
      assert.equal(joinNotif.count, 10);
      assert.equal(joinNotif.nickname, 'Usuario 3 Reconectado');
    }
  }

  // 5. Nickname updates propagated to all 10 participants
  participants[0].socket.send(
    JSON.stringify({
      type: 'update-nickname',
      nickname: 'Apresentador Oficial',
    })
  );

  for (let i = 1; i < 10; i++) {
    const updateNotif = await nextMessage(participants[i].socket);
    assert.equal(updateNotif.type, 'peer-updated');
    assert.equal(updateNotif.peerId, participants[0].peerId);
    assert.equal(updateNotif.nickname, 'Apresentador Oficial');
  }

  // 6. Signal relay: Host relays offer to all 9 other participants
  for (let i = 1; i < 10; i++) {
    const targetPeerId = participants[i].peerId;
    participants[0].socket.send(
      JSON.stringify({
        type: 'signal',
        target: targetPeerId,
        data: { type: 'offer', sdp: `mock-sdp-to-${targetPeerId}` },
      })
    );

    const receivedOffer = await nextMessage(participants[i].socket);
    assert.equal(receivedOffer.type, 'signal');
    assert.equal(receivedOffer.from, participants[0].peerId);
    assert.deepEqual(receivedOffer.data, { type: 'offer', sdp: `mock-sdp-to-${targetPeerId}` });

    // Viewer replies with answer
    participants[i].socket.send(
      JSON.stringify({
        type: 'signal',
        target: participants[0].peerId,
        data: { type: 'answer', sdp: `mock-answer-from-${targetPeerId}` },
      })
    );

    const receivedAnswer = await nextMessage(participants[0].socket);
    assert.equal(receivedAnswer.type, 'signal');
    assert.equal(receivedAnswer.from, targetPeerId);
    assert.deepEqual(receivedAnswer.data, { type: 'answer', sdp: `mock-answer-from-${targetPeerId}` });
  }

  // 7. ICE Candidate relay across peers
  participants[0].socket.send(
    JSON.stringify({
      type: 'signal',
      target: participants[1].peerId,
      data: { type: 'ice', candidate: { candidate: 'candidate:1 1 UDP 1234', sdpMid: '0' } },
    })
  );

  const receivedIce = await nextMessage(participants[1].socket);
  assert.equal(receivedIce.type, 'signal');
  assert.equal(receivedIce.from, participants[0].peerId);
  assert.equal(receivedIce.data.type, 'ice');
  assert.equal(receivedIce.data.candidate.candidate, 'candidate:1 1 UDP 1234');
});

// ---------------------------------------------------------------------------
// 3. Operational protections validation under multi-viewer load
// ---------------------------------------------------------------------------

test('capacity & protections: 10 participants behind the same IP fetch TURN credentials without 429', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    allowedOrigins: ['http://localhost:3000'],
  });
  await app.ready;
  t.after(() => app.close());

  // Simulate 10 simultaneous viewers from the same corporate / test IP fetching /turn-credentials
  const fetchPromises = Array.from({ length: 10 }).map(() =>
    fetch(`http://127.0.0.1:${app.port}/turn-credentials`, {
      headers: { origin: 'http://localhost:3000' },
    })
  );

  const responses = await Promise.all(fetchPromises);
  for (const res of responses) {
    assert.equal(res.status, 200, 'Todas as 10 requisições de TURN devem ter sucesso sem bloqueio de taxa');
    const data = await res.json();
    assert.ok(Array.isArray(data.iceServers));
  }
});

// ---------------------------------------------------------------------------
// 4. Policy A: Ephemeral slot and identity reservation (30s)
//    - Involuntary drop reserves both identity and slot
//    - New entrant is rejected with ROOM_FULL while reservation is active
//    - Legitimate participant reconnects with reconnectToken into reserved slot
//    - Invariant: active participants + active reservations <= maxParticipants
//    - Voluntary departure frees slot immediately
//    - Impostor attempt with invalid token does not consume reservation
//    - Multiple simultaneous reservations hold all slots
//    - Reservation expiration frees slot after grace period
// ---------------------------------------------------------------------------

test('capacity: Policy A main scenario - involuntary disconnect reserves slot for 30s, rejects new entrant with ROOM_FULL, and allows legitimate reconnect', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 2,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-main"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-main"];

  // 1 & 2. Connect p1 and p2 (capacity 2 filled)
  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  t.after(() => {
    try { s1.close(); } catch {}
    try { s2.close(); } catch {}
  });

  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p1', nickname: 'Peer 1' }));
  await nextMessage(s1);

  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2', nickname: 'Peer 2' }));
  const p2Peers = await nextMessage(s2);
  const p2Token = p2Peers.reconnectToken;
  assert.ok(p2Token, 'p2 deve receber reconnectToken');
  await nextMessage(s1); // peer-joined

  // 3 & 4. p2 disconnects abruptly (network drop / kill) -> reservation created
  s2.terminate();

  const peerLeft = await nextMessage(s1);
  assert.equal(peerLeft.type, 'peer-left');
  assert.equal(peerLeft.peerId, 'p2');
  assert.equal(peerLeft.count, 1, 'Presença reporta apenas participantes conectados (1)');

  // 5 & 6. p3 attempts to join -> REJECTED with ROOM_FULL (slot is held for p2)
  const s3 = await connect(wsUrl);
  const s3ClosePromise = waitForClose(s3);

  s3.send(JSON.stringify({ type: 'join', roomId, peerId: 'p3', nickname: 'Intruder' }));
  const s3Err = await nextMessage(s3);
  assert.equal(s3Err.type, 'error');
  assert.equal(s3Err.code, 'ROOM_FULL');
  assert.ok(s3Err.message.includes('2 participantes'));

  const s3Close = await s3ClosePromise;
  assert.equal(s3Close.code, WS_CLOSE_CODES.ROOM_FULL);
  assert.equal(isTerminalCloseCode(s3Close.code), true);

  // p1 must not receive peer-joined for rejected p3
  let spurious = null;
  try {
    spurious = await nextMessage(s1, 50);
  } catch {}
  assert.equal(spurious, null, 'p1 não deve receber notificações do entrante bloqueado');

  // 7, 8, 9 & 10. Legitimate p2 reconnects with valid reconnectToken -> ACCEPTED
  const s2Reconnect = await connect(wsUrl);
  t.after(() => {
    try { s2Reconnect.close(); } catch {}
  });

  s2Reconnect.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: 'p2',
      reconnectToken: p2Token,
    })
  );

  const p2ReconnectedPeers = await nextMessage(s2Reconnect);
  assert.equal(p2ReconnectedPeers.type, 'peers');
  assert.equal(p2ReconnectedPeers.count, 2, 'Reconexão aceita, exatamente 2 participantes ativos');
  assert.equal(p2ReconnectedPeers.reconnectToken, p2Token, 'Mesmo token preservado');

  const p1JoinedAgain = await nextMessage(s1);
  assert.equal(p1JoinedAgain.type, 'peer-joined');
  assert.equal(p1JoinedAgain.peerId, 'p2');
  assert.equal(p1JoinedAgain.count, 2);
  assert.equal(p1JoinedAgain.nickname, 'Peer 2');
});

test('capacity: Policy A - 10-participant room reserves slot upon abrupt disconnect, blocks 11th entrant, and allows legitimate reconnect', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 10,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-10-room"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-10-room"];
  const participants = [];

  t.after(() => {
    for (const p of participants) {
      try { p.socket.close(); } catch {}
    }
  });

  // 1. Connect 10 participants
  for (let i = 1; i <= 10; i++) {
    const s = await connect(wsUrl);
    const peerId = `user-${i}`;
    s.send(JSON.stringify({ type: 'join', roomId, peerId, nickname: `User ${i}` }));
    const peersMsg = await nextMessage(s);
    participants.push({ peerId, socket: s, token: peersMsg.reconnectToken });

    // Flush peer-joined notifications for earlier participants
    for (let j = 0; j < i - 1; j++) {
      await nextMessage(participants[j].socket);
    }
  }

  assert.equal(participants.length, 10);

  // 2. Participant 10 drops abruptly
  const p10 = participants[9];
  p10.socket.terminate();

  // All 9 remaining participants receive peer-left with count 9
  for (let i = 0; i < 9; i++) {
    const leftMsg = await nextMessage(participants[i].socket);
    assert.equal(leftMsg.type, 'peer-left');
    assert.equal(leftMsg.peerId, 'user-10');
    assert.equal(leftMsg.count, 9);
  }

  // 3. 11th participant attempts to take the vacancy -> BLOCKED with ROOM_FULL
  const socket11 = await connect(wsUrl);
  const socket11Closed = waitForClose(socket11);

  socket11.send(JSON.stringify({ type: 'join', roomId, peerId: 'user-11-intruder' }));
  const err11 = await nextMessage(socket11);
  assert.equal(err11.type, 'error');
  assert.equal(err11.code, 'ROOM_FULL');

  const close11 = await socket11Closed;
  assert.equal(close11.code, WS_CLOSE_CODES.ROOM_FULL);

  // 4. Participant 10 recovers session using valid reconnectToken -> SUCCESS
  const p10Reconnect = await connect(wsUrl);
  t.after(() => {
    try { p10Reconnect.close(); } catch {}
  });

  p10Reconnect.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: 'user-10',
      nickname: 'User 10 Recovered',
      reconnectToken: p10.token,
    })
  );

  const p10Peers = await nextMessage(p10Reconnect);
  assert.equal(p10Peers.type, 'peers');
  assert.equal(p10Peers.count, 10, 'Sala mantém exatamente 10 participantes, sem exceder');

  // All 9 participants receive peer-joined for user-10
  for (let i = 0; i < 9; i++) {
    const joinMsg = await nextMessage(participants[i].socket);
    assert.equal(joinMsg.type, 'peer-joined');
    assert.equal(joinMsg.peerId, 'user-10');
    assert.equal(joinMsg.count, 10);
  }
});

test('capacity: Policy A - voluntary leave frees slot immediately without reservation', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 2,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-voluntary"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-voluntary"];

  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  t.after(() => {
    try { s1.close(); } catch {}
    try { s2.close(); } catch {}
  });

  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p1' }));
  await nextMessage(s1);

  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2' }));
  await nextMessage(s2);
  await nextMessage(s1);

  // Participant 2 leaves voluntarily
  s2.send(JSON.stringify({ type: 'leave' }));
  s2.close(WS_CLOSE_CODES.NORMAL);

  const peerLeft = await nextMessage(s1);
  assert.equal(peerLeft.type, 'peer-left');
  assert.equal(peerLeft.peerId, 'p2');
  assert.equal(peerLeft.count, 1);

  // New participant 3 can join immediately without waiting 30 seconds
  const s3 = await connect(wsUrl);
  t.after(() => {
    try { s3.close(); } catch {}
  });

  s3.send(JSON.stringify({ type: 'join', roomId, peerId: 'p3' }));
  const p3Peers = await nextMessage(s3);
  assert.equal(p3Peers.type, 'peers');
  assert.equal(p3Peers.count, 2);

  const p1Joined = await nextMessage(s1);
  assert.equal(p1Joined.type, 'peer-joined');
  assert.equal(p1Joined.peerId, 'p3');
  assert.equal(p1Joined.count, 2);
});

test('capacity: Policy A - unauthorized reconnect attempt with invalid token does not consume reservation or admit impostor', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 2,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-auth"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-auth"];

  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  t.after(() => {
    try { s1.close(); } catch {}
    try { s2.close(); } catch {}
  });

  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p1' }));
  await nextMessage(s1);

  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2' }));
  const s2Peers = await nextMessage(s2);
  const legitimateToken = s2Peers.reconnectToken;
  await nextMessage(s1);

  // p2 drops abruptly
  s2.terminate();
  await nextMessage(s1); // peer-left

  // Impostor tries to hijack p2 without token
  const imposter1 = await connect(wsUrl);
  const impClosePromise1 = waitForClose(imposter1);
  imposter1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2' }));
  const err1 = await nextMessage(imposter1);
  assert.equal(err1.code, 'UNAUTHORIZED_RECONNECT');
  const close1 = await impClosePromise1;
  assert.equal(close1.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);

  // Impostor tries to hijack p2 with forged token
  const imposter2 = await connect(wsUrl);
  const impClosePromise2 = waitForClose(imposter2);
  imposter2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2', reconnectToken: 'forged' }));
  const err2 = await nextMessage(imposter2);
  assert.equal(err2.code, 'UNAUTHORIZED_RECONNECT');
  const close2 = await impClosePromise2;
  assert.equal(close2.code, WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT);

  // Legitimate p2 reconnects with valid token
  const s2Rec = await connect(wsUrl);
  t.after(() => {
    try { s2Rec.close(); } catch {}
  });

  s2Rec.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2', reconnectToken: legitimateToken }));
  const p2RecPeers = await nextMessage(s2Rec);
  assert.equal(p2RecPeers.type, 'peers');
  assert.equal(p2RecPeers.count, 2);
});

test('capacity: Policy A - multiple simultaneous reservations hold slots and restore cleanly', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 3,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-multi-res"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-multi-res"];

  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  const s3 = await connect(wsUrl);
  t.after(() => {
    try { s1.close(); } catch {}
    try { s2.close(); } catch {}
    try { s3.close(); } catch {}
  });

  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p1' }));
  await nextMessage(s1);
  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2' }));
  const p2Peers = await nextMessage(s2);
  await nextMessage(s1);
  s3.send(JSON.stringify({ type: 'join', roomId, peerId: 'p3' }));
  const p3Peers = await nextMessage(s3);
  await nextMessage(s1);
  await nextMessage(s2);

  // Both p2 and p3 terminate abruptly
  s2.terminate();
  s3.terminate();
  await nextMessage(s1); // peer-left p2
  await nextMessage(s1); // peer-left p3

  // Outsider p4 attempts to join -> BLOCKED with ROOM_FULL (both slots held by reservations)
  const s4 = await connect(wsUrl);
  const s4Close = waitForClose(s4);
  s4.send(JSON.stringify({ type: 'join', roomId, peerId: 'p4' }));
  const err4 = await nextMessage(s4);
  assert.equal(err4.code, 'ROOM_FULL');
  await s4Close;

  // p2 reconnects -> succeeds (now 2 active, 1 reserved)
  const s2Rec = await connect(wsUrl);
  t.after(() => {
    try { s2Rec.close(); } catch {}
  });
  s2Rec.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2', reconnectToken: p2Peers.reconnectToken }));
  const p2RecPeers = await nextMessage(s2Rec);
  assert.equal(p2RecPeers.count, 2);
  await nextMessage(s1); // peer-joined p2

  // Outsider p4 attempts to join again -> STILL BLOCKED (p3 reservation still active)
  const s4Second = await connect(wsUrl);
  const s4SecondClose = waitForClose(s4Second);
  s4Second.send(JSON.stringify({ type: 'join', roomId, peerId: 'p4' }));
  const err4Second = await nextMessage(s4Second);
  assert.equal(err4Second.code, 'ROOM_FULL');
  await s4SecondClose;

  // p3 reconnects -> succeeds (now 3 active, 0 reserved)
  const s3Rec = await connect(wsUrl);
  t.after(() => {
    try { s3Rec.close(); } catch {}
  });
  s3Rec.send(JSON.stringify({ type: 'join', roomId, peerId: 'p3', reconnectToken: p3Peers.reconnectToken }));
  const p3RecPeers = await nextMessage(s3Rec);
  assert.equal(p3RecPeers.count, 3);
  await nextMessage(s1); // peer-joined p3
  await nextMessage(s2Rec); // peer-joined p3
});

test('capacity: Policy A - reservation expiration frees slot for new participants', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 2,
    recoveryGraceMs: 80, // Expire after 80ms for test speed
  });
  await app.ready;
  const ids = await createTestRooms(app, ["policy-a-expiration"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["policy-a-expiration"];

  const s1 = await connect(wsUrl);
  const s2 = await connect(wsUrl);
  t.after(() => {
    try { s1.close(); } catch {}
    try { s2.close(); } catch {}
  });

  s1.send(JSON.stringify({ type: 'join', roomId, peerId: 'p1' }));
  await nextMessage(s1);
  s2.send(JSON.stringify({ type: 'join', roomId, peerId: 'p2' }));
  await nextMessage(s2);
  await nextMessage(s1);

  // p2 terminates abruptly
  s2.terminate();
  await nextMessage(s1); // peer-left

  // Immediately (within 80ms), p3 is rejected because reservation is active
  const s3 = await connect(wsUrl);
  const s3Close = waitForClose(s3);
  s3.send(JSON.stringify({ type: 'join', roomId, peerId: 'p3' }));
  const s3Err = await nextMessage(s3);
  assert.equal(s3Err.code, 'ROOM_FULL');
  await s3Close;

  // Wait 120ms past the 80ms grace period so reservation expires
  await new Promise((r) => setTimeout(r, 120));

  // Now new participant p4 CAN join into the freed slot
  const s4 = await connect(wsUrl);
  t.after(() => {
    try { s4.close(); } catch {}
  });
  s4.send(JSON.stringify({ type: 'join', roomId, peerId: 'p4' }));
  const s4Peers = await nextMessage(s4);
  assert.equal(s4Peers.type, 'peers');
  assert.equal(s4Peers.count, 2);

  const p1Joined = await nextMessage(s1);
  assert.equal(p1Joined.type, 'peer-joined');
  assert.equal(p1Joined.peerId, 'p4');
  assert.equal(p1Joined.count, 2);
});

test('capacity: reconnection after heartbeat timeout succeeds and restores presence', async (t) => {
  const app = createSignalServer({
    port: 0,
    host: '127.0.0.1',
    maxParticipantsPerRoom: 2,
    heartbeatIntervalMs: 50,
  });
  await app.ready;
  const ids = await createTestRooms(app, ["timeout-reconnect"]);
  t.after(() => app.close());

  const wsUrl = `ws://127.0.0.1:${app.port}/signal`;
  const roomId = ids["timeout-reconnect"];

  const host = await connect(wsUrl);
  t.after(() => host.close());
  host.send(JSON.stringify({ type: 'join', roomId, peerId: 'host' }));
  await nextMessage(host);

  const zombie = await connect(wsUrl);
  zombie.send(JSON.stringify({ type: 'join', roomId, peerId: 'zombie', nickname: 'ZombieUser' }));
  const zombiePeers = await nextMessage(zombie);
  await nextMessage(host); // peer-joined

  // Stop answering pings on zombie to trigger heartbeat timeout
  zombie.pong = () => {};
  zombie._receiver.onPing = () => {};

  // Host receives peer-left when zombie times out
  const leftMsg = await nextMessage(host, 1500);
  assert.equal(leftMsg.type, 'peer-left');
  assert.equal(leftMsg.peerId, 'zombie');
  assert.equal(leftMsg.count, 1);

  // Reconnect with same peerId after timeout: slot was freed, participant rejoins smoothly
  const reconnected = await connect(wsUrl);
  t.after(() => reconnected.close());
  reconnected.send(
    JSON.stringify({
      type: 'join',
      roomId,
      peerId: 'zombie',
      nickname: 'RevivedUser',
      reconnectToken: zombiePeers.reconnectToken,
    })
  );
  const reconnectedPeers = await nextMessage(reconnected);
  assert.equal(reconnectedPeers.type, 'peers');
  assert.equal(reconnectedPeers.count, 2);

  const hostJoinNotif = await nextMessage(host);
  assert.equal(hostJoinNotif.type, 'peer-joined');
  assert.equal(hostJoinNotif.peerId, 'zombie');
  assert.equal(hostJoinNotif.count, 2);
  assert.equal(hostJoinNotif.nickname, 'RevivedUser');
});
