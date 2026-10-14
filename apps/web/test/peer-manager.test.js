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

test('presence before capture automatically negotiates every recipient', async () => {
  const sent = [];
  const manager = new PeerManager({
    rtcConfig: {}, localPeerId: 'host',
    onSendSignal: (target, data) => { sent.push({ target, data }); return true; },
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['a', 'b', 'c']);
  assert.equal(manager.getPeers().size, 0);
  await manager.attachLocalStream(new MockMediaStream());
  assert.deepEqual(sent.filter(s => s.data.type === 'offer').map(s => s.target).sort(), ['a', 'b', 'c']);
  manager.closeAll();
});

test('explicit stop hides retained receiver tracks and restart re-presents them', () => {
  const added = [], removed = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: (id, stream) => added.push(stream),
    onRemoteStreamRemove: id => removed.push(id),
  });
  const peer = manager.getOrCreatePeer('host');
  const stream = new MockMediaStream();
  manager.setRemoteSharing('host', true);
  peer.pc.ontrack({ streams: [stream], track: stream.getVideoTracks()[0] });
  manager.setRemoteSharing('host', false);
  assert.deepEqual(removed, ['host']);
  manager.setRemoteSharing('host', true);
  assert.equal(added.length, 2);
  assert.equal(added[1], stream);
  manager.closeAll();
});

test('restart without audio clears previous audio sender; cleanup is idempotent', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream([new MockMediaStreamTrack('video'), new MockMediaStreamTrack('audio')]));
  const peer = manager.getPeer('viewer');
  await manager.handleAnswer('viewer', { type: 'answer', sdp: 'answer' });
  await manager.detachLocalStream();
  await manager.attachLocalStream(new MockMediaStream());
  assert.equal(peer.audioSender.track, null);
  assert.equal(peer.pc.getSenders().length, 2);
  manager.removePeer('viewer');
  manager.removePeer('viewer');
  assert.equal(manager.getPeers().size, 0);
});

test('perfect negotiation rolls back polite collision and ignores impolite collision ICE', async () => {
  for (const localPeerId of ['a', 'z']) {
    const manager = new PeerManager({
      rtcConfig: {}, localPeerId, onSendSignal: () => true,
      onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
    });
    manager.setParticipants(['m']);
    await manager.attachLocalStream(new MockMediaStream());
    await manager.handleOffer('m', { type: 'offer', sdp: 'collision' }, 'remote-offer');
    const peer = manager.getPeer('m');
    assert.equal(peer.ignoreOffer, localPeerId === 'a');
    await manager.handleRemoteIce('m', { candidate: 'ignored' }, 'remote-offer');
    assert.equal(peer.pc.addedIceCandidates.length, localPeerId === 'a' ? 0 : 1);
    manager.closeAll();
  }
});

test('replaced connections reject delayed answers and failed send rolls back', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => false,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream());
  const peer = manager.getPeer('viewer');
  assert.equal(peer.pc.signalingState, 'stable');
  assert.equal(peer.negotiationPending, true);
  await manager.handleSignal('viewer', { type: 'answer', targetGeneration: 'old-generation', sdp: { type: 'answer', sdp: 'old' } });
  assert.equal(peer.pc.remoteDescription, null);
  manager.closeAll();
});

test('ICE readiness gates connections and disposal invalidates pending setup', async () => {
  let resolve;
  const ready = new Promise(r => { resolve = r; });
  const manager = new PeerManager({
    rtcConfig: {}, rtcConfigReady: ready,
    onSendSignal: () => true, onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  const attachment = manager.attachLocalStream(new MockMediaStream());
  assert.equal(manager.getPeers().size, 0);
  resolve({ iceServers: [{ urls: 'turn:ready.example' }] });
  await attachment;
  assert.equal(manager.getPeer('viewer').pc.config.iceServers[0].urls, 'turn:ready.example');
  manager.dispose();
  await manager.createAndSendOffer('viewer');
  assert.equal(manager.getPeers().size, 0);
});

test('one recipient failing track replacement does not block other recipients', async () => {
  const sent = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: (target, data) => { sent.push({ target, data }); return true; },
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['broken', 'healthy']);
  await manager.attachLocalStream(new MockMediaStream());
  for (const id of ['broken', 'healthy']) await manager.handleAnswer(id, { type: 'answer', sdp: 'answer' });
  manager.getPeer('broken').videoSender.replaceTrack = async () => { throw new Error('isolated failure'); };
  const stream = new MockMediaStream();
  await manager.attachLocalStream(stream);
  assert.equal(manager.getPeer('healthy').videoSender.track, stream.getVideoTracks()[0]);
  assert.ok(sent.some(s => s.target === 'healthy' && s.data.type === 'offer'));
  manager.dispose();
});

test('streamless track events construct and retain receiver streams', () => {
  globalThis.MediaStream = MockMediaStream;
  let received;
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: (_id, stream) => { received = stream; }, onRemoteStreamRemove: () => {},
  });
  const peer = manager.getOrCreatePeer('host');
  const track = new MockMediaStreamTrack('video');
  peer.pc.ontrack({ streams: [], track });
  assert.ok(received.getTracks().includes(track));
  manager.dispose();
});

test('old negotiation candidates cannot be applied to a new remote description', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  await manager.handleRemoteIce('host', { candidate: 'old' }, 'old-negotiation');
  await manager.handleOffer('host', { type: 'offer', sdp: 'new' }, 'new-negotiation');
  assert.equal(manager.getPeer('host').pc.addedIceCandidates.length, 0);
  manager.dispose();
});

test('participant leaving before capture is removed without requiring a connection', async () => {
  const sent = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: (target) => { sent.push(target); return true; },
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['left', 'present']);
  manager.removePeer('left');
  await manager.attachLocalStream(new MockMediaStream());
  assert.deepEqual(sent, ['present']);
  assert.equal(manager.getPeer('left'), undefined);
  manager.dispose();
});

test('recovery performs two ICE restarts then only the lower ID rebuilds the connection', async () => {
  for (const localPeerId of ['a', 'z']) {
    const sent = [];
    const manager = new PeerManager({
      localPeerId, rtcConfig: {},
      onSendSignal: (target, data) => { sent.push({ target, data }); return true; },
      onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
    });
    manager.setParticipants(['m']);
    await manager.attachLocalStream(new MockMediaStream());
    const original = manager.getPeer('m');
    let restarts = 0;
    original.pc.restartIce = () => { restarts++; };
    const obsoleteCandidateCallback = original.pc.onicecandidate;
    const obsoleteNegotiationCallback = original.pc.onnegotiationneeded;
    for (let attempt = 0; attempt < 3; attempt++) {
      manager.recoverPeer('m');
      await new Promise(setImmediate);
    }
    assert.equal(restarts, 2);
    if (localPeerId === 'a') {
      assert.notEqual(manager.getPeer('m'), original);
      assert.ok(sent.some(s => s.data.type === 'reset'));
      const before = sent.length;
      obsoleteCandidateCallback({ candidate: { candidate: 'obsolete' } });
      obsoleteNegotiationCallback();
      await new Promise(setImmediate);
      assert.equal(sent.length, before);
    } else {
      assert.equal(manager.getPeer('m'), original);
      assert.ok(sent.some(s => s.data.type === 'reset-request'));
    }
    manager.dispose();
  }
});

test('quality constraints are bounded by capture capabilities without interrupting media', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  const track = new MockMediaStreamTrack('video');
  let constraints;
  track.getCapabilities = () => ({ width: { min: 640, max: 640 }, height: { min: 360, max: 360 }, frameRate: { max: 15 } });
  track.applyConstraints = async (value) => { constraints = value; };
  await manager.attachLocalStream(new MockMediaStream([track]));
  await manager.applyQuality('high');
  assert.deepEqual(constraints, { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } });
  assert.equal(track.readyState, 'live');
  manager.dispose();
});
