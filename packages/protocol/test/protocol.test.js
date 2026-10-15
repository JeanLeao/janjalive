import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoom,
  normalizePeer,
  isValidRoom,
  isValidPeer,
  generateSecureRoomId,
  ClientMessageSchema,
  ServerMessageSchema,
  QUALITY_PROFILES,
  isOfferSignal,
  isAnswerSignal,
  isIceSignal,
  WS_CLOSE_CODES,
  isTerminalCloseCode,
  ErrorMessageSchema,
} from '../dist/index.js';

test('protocol: normalizeRoom normalizes valid names and rejects invalid ones', () => {
  assert.equal(normalizeRoom('  Demo-Room-123 '), 'demo-room-123');
  assert.equal(isValidRoom('valid-room'), true);
  assert.equal(isValidRoom(''), false);
  assert.equal(isValidRoom('invalid room'), false);
  assert.throws(() => normalizeRoom(''), /sala/i);
});

test('protocol: normalizePeer normalizes valid peer IDs and rejects invalid ones', () => {
  assert.equal(normalizePeer('  peer_123-abc  '), 'peer_123-abc');
  assert.equal(isValidPeer('p_123'), true);
  assert.equal(isValidPeer(''), false);
  assert.equal(isValidPeer('?invalid'), false);
  assert.throws(() => normalizePeer('??'), /participante/i);
});

test('protocol: validates client and server messages correctly', () => {
  const joinParsed = ClientMessageSchema.safeParse({ type: 'join', roomId: 'room1', peerId: 'peer1' });
  assert.equal(joinParsed.success, true);

  const joinWithNick = ClientMessageSchema.safeParse({ type: 'join', roomId: 'room1', peerId: 'peer1', nickname: 'Aldo' });
  assert.equal(joinWithNick.success, true);

  const signalParsed = ClientMessageSchema.safeParse({ type: 'signal', target: 'peer2', data: { sdp: 'fake' } });
  assert.equal(signalParsed.success, true);

  const invalidParsed = ClientMessageSchema.safeParse({ type: 'unknown' });
  assert.equal(invalidParsed.success, false);

  const peersMsg = ServerMessageSchema.safeParse({ type: 'peers', peers: ['p1'], count: 2 });
  assert.equal(peersMsg.success, true);

  const peersWithParticipants = ServerMessageSchema.safeParse({
    type: 'peers',
    peers: ['p1'],
    count: 2,
    participants: [{ peerId: 'p1', nickname: 'Marina' }],
  });
  assert.equal(peersWithParticipants.success, true);

  const peerJoinedWithNick = ServerMessageSchema.safeParse({
    type: 'peer-joined',
    peerId: 'p2',
    count: 3,
    nickname: 'Rafael',
  });
  assert.equal(peerJoinedWithNick.success, true);

  const updateNick = ClientMessageSchema.safeParse({
    type: 'update-nickname',
    nickname: 'NovoNome',
  });
  assert.equal(updateNick.success, true);

  const removeNick = ClientMessageSchema.safeParse({
    type: 'update-nickname',
  });
  assert.equal(removeNick.success, true);

  const removeNickEmpty = ClientMessageSchema.safeParse({
    type: 'update-nickname',
    nickname: '',
  });
  assert.equal(removeNickEmpty.success, true);

  const updateNickTooLong = ClientMessageSchema.safeParse({
    type: 'update-nickname',
    nickname: 'a'.repeat(33),
  });
  assert.equal(updateNickTooLong.success, false);

  const peerUpdatedWithNick = ServerMessageSchema.safeParse({
    type: 'peer-updated',
    peerId: 'p1',
    nickname: 'Carlos',
  });
  assert.equal(peerUpdatedWithNick.success, true);

  const peerUpdatedRemovedNick = ServerMessageSchema.safeParse({
    type: 'peer-updated',
    peerId: 'p1',
  });
  assert.equal(peerUpdatedRemovedNick.success, true);

  const leaveParsed = ClientMessageSchema.safeParse({ type: 'leave' });
  assert.equal(leaveParsed.success, true);
});

test('protocol: validates typed signal payloads', () => {
  const offer = { type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp' } };
  const answer = { type: 'answer', sdp: { type: 'answer', sdp: 'fake-sdp' } };
  const ice = { type: 'ice', candidate: { candidate: 'candidate:123' } };

  assert.equal(isOfferSignal(offer), true);
  assert.equal(isOfferSignal(answer), false);
  assert.equal(isAnswerSignal(answer), true);
  assert.equal(isAnswerSignal(offer), false);
  assert.equal(isIceSignal(ice), true);
  assert.equal(isIceSignal(answer), false);
});

test('protocol: exports expected quality profiles', () => {
  assert.equal(QUALITY_PROFILES.economy.maxFramerate, 15);
  assert.equal(QUALITY_PROFILES.balanced.maxFramerate, 20);
  assert.equal(QUALITY_PROFILES.high.maxFramerate, 20);
});

test('protocol: generateSecureRoomId generates high-entropy, valid and unique room IDs', () => {
  const id1 = generateSecureRoomId();
  const id2 = generateSecureRoomId();

  assert.notEqual(id1, id2);
  assert.equal(isValidRoom(id1), true, 'Generated ID must be a valid room name');
  assert.equal(isValidRoom(id2), true);

  // Must have substantial entropy (full UUID v4 = 36 chars, 122 bits entropy, not sliced to 8 chars)
  assert.ok(id1.length >= 32, 'Room ID must have sufficient length for high entropy');
  assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  // Validate uniqueness across 200 samples
  const set = new Set();
  for (let i = 0; i < 200; i++) {
    const id = generateSecureRoomId();
    assert.equal(isValidRoom(id), true);
    set.add(id);
  }
  assert.equal(set.size, 200, 'All 200 generated room IDs must be unique');
});

test('protocol: identifies terminal WebSocket close codes and validates ErrorMessage with code', () => {
  assert.equal(WS_CLOSE_CODES.NORMAL, 1000);
  assert.equal(WS_CLOSE_CODES.SUPERSEDED, 4000);
  assert.equal(WS_CLOSE_CODES.UNAUTHORIZED_RECONNECT, 4401);
  assert.equal(WS_CLOSE_CODES.ROOM_FULL, 4009);
  assert.equal(WS_CLOSE_CODES.FORBIDDEN_ORIGIN, 4403);

  // Terminal codes
  assert.equal(isTerminalCloseCode(1000), true);
  assert.equal(isTerminalCloseCode(1008), true);
  assert.equal(isTerminalCloseCode(4000), true);
  assert.equal(isTerminalCloseCode(4401), true);
  assert.equal(isTerminalCloseCode(4009), true);
  assert.equal(isTerminalCloseCode(4403), true);

  // Non-terminal codes (must trigger reconnect)
  assert.equal(isTerminalCloseCode(1006), false); // Abnormal closure / network drop
  assert.equal(isTerminalCloseCode(1001), false); // Going away
  assert.equal(isTerminalCloseCode(1011), false); // Server error

  // Error message schema with and without code
  const errNoCode = ErrorMessageSchema.safeParse({ type: 'error', message: 'Falha genérica' });
  assert.equal(errNoCode.success, true);

  const errWithCode = ErrorMessageSchema.safeParse({
    type: 'error',
    message: 'Sala cheia: capacidade máxima de 10 participantes atingida.',
    code: 'ROOM_FULL',
  });
  assert.equal(errWithCode.success, true);
  if (errWithCode.success) {
    assert.equal(errWithCode.data.code, 'ROOM_FULL');
  }

  // Join message with reconnectToken
  const joinWithToken = ClientMessageSchema.safeParse({
    type: 'join',
    roomId: 'room-1',
    peerId: 'peer-1',
    reconnectToken: 'sec-token-12345',
  });
  assert.equal(joinWithToken.success, true);

  // Peers message with reconnectToken
  const peersWithToken = ServerMessageSchema.safeParse({
    type: 'peers',
    peers: ['p1'],
    count: 2,
    reconnectToken: 'sec-token-12345',
  });
  assert.equal(peersWithToken.success, true);
});

test('protocol: sharing accepts explicit pause and legacy messages without pause', () => {
  const legacy = { type: 'update-sharing', active: true, hasAudio: true, audioMuted: true };
  assert.equal(ClientMessageSchema.safeParse(legacy).success, true);
  const paused = { ...legacy, paused: true, streamId: 'capture-1' };
  assert.equal(ClientMessageSchema.parse(paused).paused, true);
  assert.equal(ClientMessageSchema.safeParse({ ...paused, paused: 'yes' }).success, false);
  const snapshot = ServerMessageSchema.parse({
    type: 'peers', peers: ['presenter'], count: 1,
    participants: [{ peerId: 'presenter', sharing: { active: true, paused: true, hasAudio: true, audioMuted: true } }],
  });
  assert.equal(snapshot.participants[0].sharing.paused, true);
});
