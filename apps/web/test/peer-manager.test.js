import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerManager } from '../src/features/room/webrtc/peer-manager.ts';
import {
  MockRTCPeerConnection,
  MockMediaStream,
  MockMediaStreamTrack,
} from './mock-webrtc.js';

// Setup global WebRTC mocks for this test file
globalThis.RTCPeerConnection = MockRTCPeerConnection;
globalThis.RTCSessionDescription = class { constructor(init) { Object.assign(this, init); } };
globalThis.RTCIceCandidate = class { constructor(init) { Object.assign(this, init); } };

test('peer-manager: queues ICE candidates until remoteDescription exists and flushes them', async () => {
  const sentSignals = [];
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => sentSignals.push({ target, data }),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const peer = manager.getOrCreatePeer('viewer-1');
  assert.ok(peer);
  assert.equal(peer.pendingIceCandidates.length, 0);

  // Incoming ICE before remote description
  const candidate1 = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
  await manager.handleRemoteIce('viewer-1', candidate1);

  assert.equal(peer.pendingIceCandidates.length, 1);
  assert.equal(peer.pc.addedIceCandidates.length, 0);

  // Now an offer arrives setting remote description
  await manager.handleOffer('viewer-1', { type: 'offer', sdp: 'fake-offer-sdp' });

  // Pending ICE candidates should now be flushed!
  assert.equal(peer.pendingIceCandidates.length, 0);
  assert.equal(peer.pc.addedIceCandidates.length, 1);
  assert.equal(peer.pc.addedIceCandidates[0].candidate, 'candidate:1');

  // Any subsequent ICE candidate should be added directly without queueing
  const candidate2 = { candidate: 'candidate:2', sdpMid: '0', sdpMLineIndex: 0 };
  await manager.handleRemoteIce('viewer-1', candidate2);
  assert.equal(peer.pc.addedIceCandidates.length, 2);
  assert.equal(peer.pendingIceCandidates.length, 0);
});

test('peer-manager: only creates offer when local stream exists and signaling state is stable', async () => {
  const sentSignals = [];
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => sentSignals.push({ target, data }),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  // Without local stream, offer should be skipped
  await manager.createAndSendOffer('viewer-1');
  assert.equal(sentSignals.length, 0);

  // Attach local stream
  const videoTrack = new MockMediaStreamTrack('video');
  const stream = new MockMediaStream([videoTrack]);
  await manager.attachLocalStream(stream);

  // Offer should now be created and sent
  assert.equal(sentSignals.length, 1);
  assert.equal(sentSignals[0].target, 'viewer-1');
  assert.equal(sentSignals[0].data.type, 'offer');
});

test('peer-manager: late joiner receives offer immediately when local stream is already active', async () => {
  const sentSignals = [];
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: (target, data) => sentSignals.push({ target, data }),
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const stream = new MockMediaStream([new MockMediaStreamTrack('video')]);
  await manager.attachLocalStream(stream);

  // A new peer connects later
  const peer2 = manager.getOrCreatePeer('viewer-late');
  assert.ok(peer2);
  assert.equal(peer2.pc.senders.length, 1, 'Local track should be added to new peer');

  await manager.createAndSendOffer('viewer-late');
  const lateOffer = sentSignals.find((s) => s.target === 'viewer-late');
  assert.ok(lateOffer);
  assert.equal(lateOffer.data.type, 'offer');
});

test('peer-manager: detachLocalStream replaces tracks with null without closing peer', async () => {
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: () => {},
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const stream = new MockMediaStream([new MockMediaStreamTrack('video')]);
  const peer = manager.getOrCreatePeer('viewer-1');
  await manager.attachLocalStream(stream);

  assert.equal(peer.pc.senders.length, 1);
  assert.ok(peer.pc.senders[0].track);

  await manager.detachLocalStream();
  assert.equal(peer.pc.senders[0].track, null, 'Track should be set to null on senders');
  assert.notEqual(peer.pc.connectionState, 'closed', 'Peer connection should remain open');
});

test('peer-manager: applies quality parameters to video senders', async () => {
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: () => {},
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const stream = new MockMediaStream([new MockMediaStreamTrack('video')]);
  const peer = manager.getOrCreatePeer('viewer-1');
  await manager.attachLocalStream(stream);

  await manager.applyQuality('economy');
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxBitrate, 800000);
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxFramerate, 15);

  await manager.applyQuality('high');
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxBitrate, 3000000);
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxFramerate, 20);
});

test('peer-manager: removePeer closes connection and triggers stream removal', () => {
  let removedPeerId = null;
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: () => {},
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: (id) => {
      removedPeerId = id;
    },
  });

  const peer = manager.getOrCreatePeer('viewer-1');
  assert.ok(peer);

  manager.removePeer('viewer-1');
  assert.equal(removedPeerId, 'viewer-1');
  assert.equal(peer.pc.connectionState, 'closed');
  assert.equal(manager.getPeer('viewer-1'), undefined);
});
