import { createTestRooms } from '../../signaling/test/helpers/create-rooms.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createSignalServer } from '@screen-room/signaling';
import { WebSocket as WsClient } from 'ws';
import { SignalingClient } from '../src/features/room/signaling/signaling-client.ts';
import { PeerManager } from '../src/features/room/webrtc/peer-manager.ts';
import {
  MockRTCPeerConnection,
  MockMediaStream,
  MockMediaStreamTrack,
} from './mock-webrtc.js';

// Setup environment mocks
// Deliberately make the handshake slower than the old 20–40 ms sleeps.
// This keeps the regression observable without delaying or mocking negotiation.
globalThis.WebSocket = class extends WsClient {
  constructor(url) {
    super(url, { finishRequest: request => setTimeout(() => request.end(), 100) });
  }
};
globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };
globalThis.RTCIceCandidate = class { constructor(init) { Object.assign(this, init); } };

// A deadline bounds a failed condition; it is not a delay before assuming success.
async function until(label, condition, participants) {
  const deadline = performance.now() + 3000;
  while (!condition()) {
    if (performance.now() >= deadline) {
      assert.fail(`${label}: ${JSON.stringify(participants.map(p => ({
        id: p.id, state: p.signaling.getState(), errors: p.errors,
        messages: p.messages.map(m => ({ type: m.type, from: m.from, signal: m.data?.type })),
        peers: [...p.manager.getPeers()].map(([id, peer]) => ({
          id, signaling: peer.pc.signalingState,
          local: peer.pc.localDescription?.type, remote: peer.pc.remoteDescription?.type,
        })),
      })))}`);
    }
    await delay(5);
  }
  for (const p of participants) assert.deepEqual(p.errors, [], `${p.id}: async signaling errors`);
}

async function room(t, roomId) {
  const server = createSignalServer({ port: 0, host: '127.0.0.1', maxParticipantsPerRoom: 10 });
  await server.ready;
  roomId = (await createTestRooms(server, [roomId]))[roomId];
  const participants = [];
  t.after(async () => {
    for (const p of participants) {
      p.signaling.disconnect();
      p.manager.closeAll();
      p.stream?.getTracks().forEach(track => track.stop());
    }
    await server.close();
    for (const p of participants) assert.deepEqual(p.errors, [], `${p.id}: async signaling errors`);
  });

  function participant(id) {
    const p = { id, messages: [], errors: [], stream: null };
    p.signaling = new SignalingClient({
      url: `ws://127.0.0.1:${server.port}/signal`, autoReconnect: false,
      onStateChange: () => {},
      onError: error => p.errors.push(error.message),
      onMessage: msg => {
        p.messages.push(msg);
        // The callback is synchronous; explicitly observe rejected async work.
        Promise.resolve().then(async () => {
          if (msg.type === 'peer-joined' && p.stream) await p.manager.createAndSendOffer(msg.peerId);
          else if (msg.type === 'peer-left') p.manager.removePeer(msg.peerId);
          else if (msg.type === 'signal') {
            if (msg.data.type === 'offer') await p.manager.handleOffer(msg.from, msg.data.sdp);
            else if (msg.data.type === 'answer') await p.manager.handleAnswer(msg.from, msg.data.sdp);
            else if (msg.data.type === 'ice') await p.manager.handleRemoteIce(msg.from, msg.data.candidate);
          }
        }).catch(error => p.errors.push(error.message));
      },
    });
    p.manager = new PeerManager({
      rtcConfig: { iceServers: [] },
      onSendSignal: (target, data) => {
        assert.equal(p.signaling.relaySignal(target, data), true, `${id}: relay ${data.type}`);
      },
      onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
    });
    participants.push(p);
    return p;
  }

  async function join(p) {
    const acknowledgements = p.messages.filter(m => m.type === 'peers').length;
    p.signaling.connect();
    await until(`${p.id}: socket open`, () => p.signaling.getState() === 'connected', participants);
    assert.equal(p.signaling.join(roomId, p.id), true, `${p.id}: join sent`);
    await until(`${p.id}: join acknowledged`,
      () => p.messages.filter(m => m.type === 'peers').length > acknowledgements, participants);
  }

  async function negotiated(sender, receiver) {
    await until(`${sender.id} -> ${receiver.id}: offer AND answer applied`, () => {
      const a = sender.manager.getPeer(receiver.id)?.pc;
      const b = receiver.manager.getPeer(sender.id)?.pc;
      return a?.remoteDescription?.type === 'answer' && a.signalingState === 'stable'
        && b?.remoteDescription?.type === 'offer' && b.signalingState === 'stable';
    }, participants);
  }

  return { participant, join, negotiated, participants };
}

test('capacity-webrtc: 1 presenter sharing screen to 9 viewers (10 participants total in mesh)', async (t) => {
  const { participant, join, negotiated, participants } = await room(t, 'mesh-10-room');
  const host = participant('presenter');
  await join(host);
  host.stream = new MockMediaStream([new MockMediaStreamTrack('video'), new MockMediaStreamTrack('audio')]);
  await host.manager.attachLocalStream(host.stream);
  const viewers = [];
  for (let i = 1; i <= 9; i++) {
    const viewer = participant(`viewer-${i}`);
    viewers.push(viewer);
    await join(viewer);
    await negotiated(host, viewer);
  }
  assert.equal(host.manager.getPeers().size, 9);

  // A voluntary departure frees the capacity slot before the late join.
  const v9 = viewers.pop();
  v9.signaling.disconnect();
  v9.manager.closeAll();
  await until('viewer-9 removed', () => !host.manager.getPeer(v9.id), participants);
  assert.equal(host.manager.getPeers().size, 8);
  const late = participant('viewer-late-joiner');
  await join(late);
  await negotiated(host, late);

  // Actual involuntary socket loss retains the reconnect token/reservation.
  // Access the transport only to inject the fault; synchronize via public state.
  const v1 = viewers[0];
  v1.signaling.socket.terminate();
  await until('viewer disconnected', () => v1.signaling.getState() === 'disconnected'
    && !host.manager.getPeer(v1.id), participants);
  v1.manager.closeAll();
  await join(v1);
  await negotiated(host, v1);

  host.signaling.socket.terminate();
  await until('presenter disconnected', () => host.signaling.getState() === 'disconnected'
    && [...viewers, late].every(v => !v.manager.getPeer(host.id)), participants);
  host.manager.closeAll();
  for (const track of host.stream.getTracks()) assert.equal(track.readyState, 'live');
  await join(host);
  for (const viewer of [...viewers, late]) {
    await host.manager.createAndSendOffer(viewer.id);
    await negotiated(host, viewer);
  }
  assert.equal(host.manager.getPeers().size, 9);
});

test('capacity-webrtc: multi-stream scenario (2 simultaneous presenters in mesh)', async (t) => {
  const { participant, join, negotiated } = await room(t, 'multi-presenter-room');
  const a = participant('presenter-A'), b = participant('presenter-B'), c = participant('viewer-C');
  await Promise.all([a, b, c].map(join));
  for (const p of [a, b]) {
    p.stream = new MockMediaStream([new MockMediaStreamTrack('video')]);
    await p.manager.attachLocalStream(p.stream);
  }
  await Promise.all([
    a.manager.createAndSendOffer(c.id), b.manager.createAndSendOffer(c.id),
    a.manager.createAndSendOffer(b.id),
  ]);
  await Promise.all([negotiated(a, c), negotiated(b, c), negotiated(a, b)]);
});
