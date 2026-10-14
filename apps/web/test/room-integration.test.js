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
import { setStreamAudioMuted, stopAllTracks } from '../src/features/room/media/display-media.ts';

// Setup environment mocks
globalThis.WebSocket = WsClient;
globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };
globalThis.RTCIceCandidate = class { constructor(init) { Object.assign(this, init); } };

test('room-integration: full negotiation flow between host and viewers with screen share and late joiner', async (t) => {
  const server = createSignalServer({ port: 0, host: '127.0.0.1' });
  await server.ready;
  t.after(() => server.close());

  const serverUrl = `ws://127.0.0.1:${server.port}/signal`;
  const roomId = 'integration-room';

  // 1. Host setup
  let hostReceivedStreams = [];
  const hostSignaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: (msg) => handleHostMessage(msg),
  });

  const hostPeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => hostSignaling.relaySignal(target, data),
    onRemoteStreamAdd: (peerId, stream) => hostReceivedStreams.push({ peerId, stream }),
    onRemoteStreamRemove: (peerId) => {
      hostReceivedStreams = hostReceivedStreams.filter((s) => s.peerId !== peerId);
    },
  });

  function handleHostMessage(msg) {
    if (msg.type === 'peer-joined') {
      if (hostStream) {
        hostPeerManager.createAndSendOffer(msg.peerId);
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

  // 2. Viewer 1 setup
  let viewer1ReceivedStreams = [];
  const viewer1Signaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: (msg) => handleViewer1Message(msg),
  });

  const viewer1PeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => viewer1Signaling.relaySignal(target, data),
    onRemoteStreamAdd: (peerId, stream) => viewer1ReceivedStreams.push({ peerId, stream }),
    onRemoteStreamRemove: (peerId) => {
      viewer1ReceivedStreams = viewer1ReceivedStreams.filter((s) => s.peerId !== peerId);
    },
  });

  async function handleViewer1Message(msg) {
    if (msg.type === 'signal') {
      const { from, data } = msg;
      if (data.type === 'offer') {
        await viewer1PeerManager.handleOffer(from, data.sdp);
      } else if (data.type === 'ice') {
        await viewer1PeerManager.handleRemoteIce(from, data.candidate);
      }
    }
  }

  t.after(() => {
    hostSignaling.disconnect();
    viewer1Signaling.disconnect();
    hostPeerManager.closeAll();
    viewer1PeerManager.closeAll();
  });

  // Connect and join
  hostSignaling.connect();
  viewer1Signaling.connect();
  await new Promise((r) => setTimeout(r, 50));

  hostSignaling.join(roomId, 'host-1');
  viewer1Signaling.join(roomId, 'viewer-1');
  await new Promise((r) => setTimeout(r, 50));

  // 3. Host starts sharing screen with video and audio tracks (never mic!)
  const hostVideoTrack = new MockMediaStreamTrack('video');
  const hostAudioTrack = new MockMediaStreamTrack('audio');
  let hostStream = new MockMediaStream([hostVideoTrack, hostAudioTrack]);

  await hostPeerManager.attachLocalStream(hostStream);
  await hostPeerManager.createAndSendOffer('viewer-1');

  await new Promise((r) => setTimeout(r, 60));

  // Verify Viewer 1 received offer and created answer, and Host processed answer
  const hostViewerPeer = hostPeerManager.getPeer('viewer-1');
  const viewerHostPeer = viewer1PeerManager.getPeer('host-1');

  assert.ok(hostViewerPeer, 'Host should have peer for viewer-1');
  assert.ok(viewerHostPeer, 'Viewer should have peer for host-1');
  assert.equal(viewerHostPeer.pc.remoteDescription?.type, 'offer');
  assert.equal(hostViewerPeer.pc.remoteDescription?.type, 'answer');

  // 4. Mute / Unmute audio
  assert.equal(hostAudioTrack.enabled, true);
  setStreamAudioMuted(hostStream, true);
  assert.equal(hostAudioTrack.enabled, false);
  assert.equal(hostVideoTrack.enabled, true, 'Video must remain active when audio is muted');
  setStreamAudioMuted(hostStream, false);
  assert.equal(hostAudioTrack.enabled, true);

  // 5. Late Joiner: Viewer 2 enters room while stream is already active
  let viewer2ReceivedStreams = [];
  const viewer2Signaling = new SignalingClient({
    url: serverUrl,
    onStateChange: () => {},
    onMessage: (msg) => handleViewer2Message(msg),
  });

  const viewer2PeerManager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => viewer2Signaling.relaySignal(target, data),
    onRemoteStreamAdd: (peerId, stream) => viewer2ReceivedStreams.push({ peerId, stream }),
    onRemoteStreamRemove: () => {},
  });

  async function handleViewer2Message(msg) {
    if (msg.type === 'signal') {
      const { from, data } = msg;
      if (data.type === 'offer') {
        await viewer2PeerManager.handleOffer(from, data.sdp);
      }
    }
  }

  t.after(() => {
    viewer2Signaling.disconnect();
    viewer2PeerManager.closeAll();
  });

  viewer2Signaling.connect();
  await new Promise((r) => setTimeout(r, 50));
  viewer2Signaling.join(roomId, 'viewer-2');

  await new Promise((r) => setTimeout(r, 70));

  const viewer2HostPeer = viewer2PeerManager.getPeer('host-1');
  assert.ok(viewer2HostPeer, 'Late joiner should have peer for host-1');
  assert.equal(viewer2HostPeer.pc.remoteDescription?.type, 'offer', 'Late joiner must automatically receive offer from host');

  // 6. Stop sharing and restart sharing
  await hostPeerManager.detachLocalStream();
  stopAllTracks(hostStream);
  hostStream = null;

  assert.equal(hostViewerPeer.pc.senders[0].track, null, 'Video sender track should be null after stopping sharing');

  // Restart sharing with new stream
  const restartVideo = new MockMediaStreamTrack('video');
  const restartStream = new MockMediaStream([restartVideo]);
  hostStream = restartStream;
  await hostPeerManager.attachLocalStream(restartStream);

  assert.equal(hostViewerPeer.pc.senders[0].track, restartVideo, 'Sender track should be restored on restart');

  // 7. Viewer 1 leaves
  viewer1Signaling.disconnect();
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(hostPeerManager.getPeer('viewer-1'), undefined, 'Host should have cleaned up viewer-1 on leave');
});
