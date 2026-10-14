import test from 'node:test';
import assert from 'node:assert/strict';
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
globalThis.WebSocket = WsClient;
globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };
globalThis.RTCIceCandidate = class { constructor(init) { Object.assign(this, init); } };

test('capacity-webrtc: 1 presenter sharing screen to 9 viewers (10 participants total in mesh)', async (t) => {
  const server = createSignalServer({ port: 0, host: '127.0.0.1', maxParticipantsPerRoom: 10 });
  await server.ready;
  t.after(() => server.close());

  const serverUrl = `ws://127.0.0.1:${server.port}/signal`;
  const roomId = 'mesh-10-room';

  // 1. Host (Presenter) setup
  const hostSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: (msg) => handleHostMessage(msg),
  });

  const hostPeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => hostSignaling.relaySignal(target, data),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  let hostStream = null;

  function handleHostMessage(msg) {
    if (msg.type === 'peer-joined') {
      if (hostStream) {
        hostPeerManager.createAndSendOffer(msg.peerId).catch(() => {});
      }
    } else if (msg.type === 'peer-left') {
      hostPeerManager.removePeer(msg.peerId);
    } else if (msg.type === 'signal') {
      const { from, data } = msg;
      if (data.type === 'answer') {
        hostPeerManager.handleAnswer(from, data.sdp);
      } else if (data.type === 'ice') {
        hostPeerManager.handleRemoteIce(from, data.candidate);
      }
    }
  }

  t.after(() => {
    hostSignaling.disconnect();
    hostPeerManager.closeAll();
  });

  hostSignaling.connect();
  await new Promise((r) => setTimeout(r, 40));
  hostSignaling.join(roomId, 'presenter');
  await new Promise((r) => setTimeout(r, 40));

  // Host starts screen share
  const hostVideoTrack = new MockMediaStreamTrack('video');
  const hostAudioTrack = new MockMediaStreamTrack('audio');
  hostStream = new MockMediaStream([hostVideoTrack, hostAudioTrack]);
  await hostPeerManager.attachLocalStream(hostStream);

  // 2. Connect 9 Viewers sequentially
  const viewers = [];
  t.after(() => {
    for (const v of viewers) {
      v.signaling.disconnect();
      v.peerManager.closeAll();
    }
  });

  for (let i = 1; i <= 9; i++) {
    const viewerId = `viewer-${i}`;
    let remoteStreamReceived = false;

    const signaling = new SignalingClient({
      url: serverUrl,
      onStateChange: () => {},
      onMessage: async (msg) => {
        if (msg.type === 'signal') {
          const { from, data } = msg;
          if (data.type === 'offer') {
            await peerManager.handleOffer(from, data.sdp);
          } else if (data.type === 'ice') {
            await peerManager.handleRemoteIce(from, data.candidate);
          }
        }
      },
    });

    const peerManager = new PeerManager({
      rtcConfig: { iceServers: [] },
      onSendSignal: (target, data) => signaling.relaySignal(target, data),
      onRemoteStreamAdd: () => { remoteStreamReceived = true; },
      onRemoteStreamRemove: () => { remoteStreamReceived = false; },
    });

    viewers.push({ viewerId, signaling, peerManager });

    signaling.connect();
    await new Promise((r) => setTimeout(r, 20));
    signaling.join(roomId, viewerId);

    // Wait for offer/answer exchange with host
    await new Promise((r) => setTimeout(r, 60));

    // Verify negotiation between host and this viewer
    const hostPeer = hostPeerManager.getPeer(viewerId);
    const viewerPeer = peerManager.getPeer('presenter');

    assert.ok(hostPeer, `Host must have peer connection for ${viewerId}`);
    assert.ok(viewerPeer, `${viewerId} must have peer connection for presenter`);
    assert.equal(viewerPeer.pc.remoteDescription?.type, 'offer');
    assert.equal(hostPeer.pc.remoteDescription?.type, 'answer');
  }

  // Verify Host has all 9 peer connections active
  assert.equal(hostPeerManager.getPeers().size, 9, 'Host deve possuir 9 conexões RTCPeerConnection ativas');

  // 3. Late joiner test:
  // Viewer 9 leaves, freeing a slot, then Late Joiner enters and receives offer immediately
  const v9 = viewers.pop();
  v9.signaling.disconnect();
  v9.peerManager.closeAll();
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(hostPeerManager.getPeers().size, 8, 'Host deve ter removido conexão do viewer-9');

  // Late joiner enters
  const lateViewerId = 'viewer-late-joiner';
  const lateSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: async (msg) => {
      if (msg.type === 'signal') {
        const { from, data } = msg;
        if (data.type === 'offer') {
          await latePeerManager.handleOffer(from, data.sdp);
        }
      }
    },
  });

  const latePeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => lateSignaling.relaySignal(target, data),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  t.after(() => {
    lateSignaling.disconnect();
    latePeerManager.closeAll();
  });

  lateSignaling.connect();
  await new Promise((r) => setTimeout(r, 20));
  lateSignaling.join(roomId, lateViewerId);
  await new Promise((r) => setTimeout(r, 60));

  const latePeer = latePeerManager.getPeer('presenter');
  assert.ok(latePeer, 'Entrante tardio deve ter peer connection ativa com o apresentador');
  assert.equal(latePeer.pc.remoteDescription?.type, 'offer', 'Entrante tardio recebe oferta automaticamente com stream em andamento');

  // 4. Viewer reconnection test:
  // Viewer 1 disconnects unexpectedly and reconnects
  const v1 = viewers[0];
  v1.signaling.disconnect();
  await new Promise((r) => setTimeout(r, 50));

  // Reconnect Viewer 1
  v1.signaling.connect();
  await new Promise((r) => setTimeout(r, 20));
  v1.signaling.join(roomId, v1.viewerId);
  await new Promise((r) => setTimeout(r, 60));

  const v1Peer = v1.peerManager.getPeer('presenter');
  assert.ok(v1Peer, 'Viewer 1 reconectado deve restabelecer negociação');
  assert.equal(v1Peer.pc.remoteDescription?.type, 'offer');

  // 5. Presenter signaling reconnect WITHOUT stopping local screen capture:
  // Simulate network glitch on presenter's WebSocket
  assert.equal(hostVideoTrack.readyState, 'live', 'Vídeo do apresentador deve estar ativo');
  assert.equal(hostAudioTrack.readyState, 'live', 'Áudio do apresentador deve estar ativo');

  hostSignaling.disconnect();
  await new Promise((r) => setTimeout(r, 30));

  // Local tracks are NOT stopped when signaling drops
  assert.equal(hostVideoTrack.readyState, 'live', 'Captura local NÃO deve ser interrompida por queda do signaling');
  assert.equal(hostAudioTrack.readyState, 'live', 'Captura de áudio local NÃO deve ser interrompida');

  // Presenter reconnects signaling
  hostSignaling.connect();
  await new Promise((r) => setTimeout(r, 20));
  hostSignaling.join(roomId, 'presenter');
  await new Promise((r) => setTimeout(r, 60));

  // Re-negotiate offers to viewers
  for (const v of viewers) {
    await hostPeerManager.createAndSendOffer(v.viewerId);
  }
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(hostPeerManager.getPeers().size >= 8, true, 'Todas as conexões WebRTC ativas após reconexão');
});

test('capacity-webrtc: multi-stream scenario (2 simultaneous presenters in mesh)', async (t) => {
  const server = createSignalServer({ port: 0, host: '127.0.0.1', maxParticipantsPerRoom: 10 });
  await server.ready;
  t.after(() => server.close());

  const serverUrl = `ws://127.0.0.1:${server.port}/signal`;
  const roomId = 'multi-presenter-room';

  let pAStream = null;
  let pBStream = null;

  // Presenter A
  const pASignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: async (msg) => {
      if (msg.type === 'peer-joined' && pAStream) {
        await pAPeerManager.createAndSendOffer(msg.peerId);
      } else if (msg.type === 'signal') {
        const { from, data } = msg;
        if (data.type === 'offer') await pAPeerManager.handleOffer(from, data.sdp);
        else if (data.type === 'answer') await pAPeerManager.handleAnswer(from, data.sdp);
      }
    },
  });

  const pAPeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => pASignaling.relaySignal(target, data),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  // Presenter B
  const pBSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: async (msg) => {
      if (msg.type === 'peer-joined' && pBStream) {
        await pBPeerManager.createAndSendOffer(msg.peerId);
      } else if (msg.type === 'signal') {
        const { from, data } = msg;
        if (data.type === 'offer') await pBPeerManager.handleOffer(from, data.sdp);
        else if (data.type === 'answer') await pBPeerManager.handleAnswer(from, data.sdp);
      }
    },
  });

  const pBPeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => pBSignaling.relaySignal(target, data),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  // Viewer C
  let viewerReceivedStreams = [];
  const vCSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: async (msg) => {
      if (msg.type === 'signal') {
        const { from, data } = msg;
        if (data.type === 'offer') await vCPeerManager.handleOffer(from, data.sdp);
        else if (data.type === 'answer') await vCPeerManager.handleAnswer(from, data.sdp);
      }
    },
  });

  const vCPeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => vCSignaling.relaySignal(target, data),
    onRemoteStreamAdd: (peerId, stream) => viewerReceivedStreams.push({ peerId, stream }),
    onRemoteStreamRemove: (peerId) => {
      viewerReceivedStreams = viewerReceivedStreams.filter((s) => s.peerId !== peerId);
    },
  });

  t.after(() => {
    pASignaling.disconnect();
    pAPeerManager.closeAll();
    pBSignaling.disconnect();
    pBPeerManager.closeAll();
    vCSignaling.disconnect();
    vCPeerManager.closeAll();
  });

  // Connect all 3
  pASignaling.connect();
  pBSignaling.connect();
  vCSignaling.connect();
  await new Promise((r) => setTimeout(r, 30));

  pASignaling.join(roomId, 'presenter-A');
  pBSignaling.join(roomId, 'presenter-B');
  vCSignaling.join(roomId, 'viewer-C');
  await new Promise((r) => setTimeout(r, 40));

  // Both A and B start sharing streams simultaneously
  pAStream = new MockMediaStream([new MockMediaStreamTrack('video')]);
  pBStream = new MockMediaStream([new MockMediaStreamTrack('video')]);

  await pAPeerManager.attachLocalStream(pAStream);
  await pBPeerManager.attachLocalStream(pBStream);

  await pAPeerManager.createAndSendOffer('viewer-C');
  await pBPeerManager.createAndSendOffer('viewer-C');
  await pAPeerManager.createAndSendOffer('presenter-B');

  await new Promise((r) => setTimeout(r, 80));

  // Viewer C receives offers from both presenters
  const peerFromA = vCPeerManager.getPeer('presenter-A');
  const peerFromB = vCPeerManager.getPeer('presenter-B');

  assert.ok(peerFromA, 'Viewer C deve estar conectado com apresentador A');
  assert.ok(peerFromB, 'Viewer C deve estar conectado com apresentador B');
  assert.equal(peerFromA.pc.remoteDescription?.type, 'offer');
  assert.equal(peerFromB.pc.remoteDescription?.type, 'offer');
});
