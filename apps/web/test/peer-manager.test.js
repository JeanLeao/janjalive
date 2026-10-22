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

  await manager.applyQuality({ priority: 'sharpness', profile: 'economy', fps: 20 });
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxBitrate, 1600000);
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxFramerate, 20);

  await manager.applyQuality({ priority: 'sharpness', profile: 'ultra', fps: 30 });
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxBitrate, 6000000);
  assert.equal(peer.pc.senders[0].parameters.encodings[0].maxFramerate, 30);
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

test('one recipient failing track replacement reports publication failure after other recipients settle', async () => {
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
  await assert.rejects(manager.attachLocalStream(stream), /isolated failure/);
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
  await manager.applyQuality({ priority: 'sharpness', profile: 'ultra', fps: 30 });
  assert.deepEqual(constraints, { width: { ideal: 640, max: 640 }, height: { ideal: 360, max: 360 }, frameRate: { ideal: 15, max: 15 } });
  assert.equal(track.readyState, 'live');
  manager.dispose();
});

for (const reconnectingId of ['host', 'viewer']) {
  test(`socket replacement reconciles generations when ${reconnectingId} reconnects`, async () => {
    const queue = [], managers = {};
    for (const id of ['host', 'viewer']) {
      managers[id] = new PeerManager({
        localPeerId: id, rtcConfig: {},
        onSendSignal: (target, data) => { queue.push({ from: id, target, data }); return true; },
        onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
      });
    }
    const settle = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise(setImmediate);
        if (!queue.length) return;
        for (const { from, target, data } of queue.splice(0)) await managers[target].handleSignal(from, data);
      }
      assert.fail('negotiation did not settle');
    };
    try {
      managers.host.setParticipants(['viewer']);
      managers.viewer.setParticipants(['host']);
      managers.viewer.setRemoteSharing('host', true);
      const stream = new MockMediaStream();
      await managers.host.attachLocalStream(stream);
      await settle();
      const oldHost = managers.host.getPeer('viewer');
      const oldViewer = managers.viewer.getPeer('host');
      assert.equal(oldHost.remoteGeneration, oldViewer.generation);
      const remainingId = reconnectingId === 'host' ? 'viewer' : 'host';
      managers[reconnectingId].closeAll(); // useRoomSession: disconnected
      managers[reconnectingId].setParticipants([remainingId]); // peers snapshot
      if (reconnectingId === 'viewer') managers.viewer.setRemoteSharing('host', true);
      managers[remainingId].addParticipant(reconnectingId); // peer-joined, no peer-left
      await settle();
      const host = managers.host.getPeer('viewer'), viewer = managers.viewer.getPeer('host');
      assert.ok(host && viewer, 'both sides must recreate their local connections');
      assert.notEqual(host.generation, oldHost.generation);
      assert.notEqual(viewer.generation, oldViewer.generation);
      assert.equal(host.remoteGeneration, viewer.generation);
      assert.equal(viewer.remoteGeneration, host.generation);
      assert.equal(host.pc.signalingState, 'stable');
      assert.equal(viewer.pc.signalingState, 'stable');
      assert.equal(host.videoSender.track, stream.getVideoTracks()[0]);
      // Retired remote generations and obsolete targets remain rejected, even for offers.
      for (const data of [
        { type: 'offer', generation: oldViewer.generation },
        { type: 'offer', generation: 'unknown', targetGeneration: oldHost.generation },
        { type: 'answer', generation: oldViewer.generation, targetGeneration: host.generation },
        { type: 'ice', generation: oldViewer.generation, candidate: { candidate: 'obsolete' } },
      ]) {
        const description = host.pc.remoteDescription;
        await managers.host.handleSignal('viewer', { ...data, sdp: { type: data.type, sdp: 'obsolete' } });
        assert.equal(host.pc.remoteDescription, description);
        assert.equal(host.pc.addedIceCandidates.length, 0);
      }
    } finally { managers.host.dispose(); managers.viewer.dispose(); }
  });
}

test('pause detaches both senders, retains capture and blocks new/recovered peers until resume', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  const stream = new MockMediaStream();
  await manager.attachLocalStream(stream);
  await manager.detachLocalStream();
  for (const peer of manager.getPeers().values()) {
    assert.equal(peer.videoSender.track, null);
    if (peer.audioSender) assert.equal(peer.audioSender.track, null);
  }
  manager.addParticipant('late');
  const late = manager.getOrCreatePeer('late');
  assert.ok(late.pc.getSenders().every(sender => !sender.track));
  manager.recoverPeer('viewer');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.getPeer('viewer').videoSender.track, null);
  manager.resetPeer('viewer');
  assert.ok(manager.getOrCreatePeer('viewer').pc.getSenders().every(sender => !sender.track));
  await manager.attachLocalStream(stream);
  assert.equal(manager.getPeer('viewer').videoSender.track, stream.getVideoTracks()[0]);
  manager.dispose();
});

test('failed pause closes the affected connection instead of retaining a publishing sender', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream());
  const peer = manager.getPeer('viewer');
  peer.videoSender.replaceTrack = async () => { throw new Error('detach failed'); };
  await assert.rejects(manager.detachLocalStream(), /detach failed/);
  assert.equal(peer.pc.connectionState, 'closed');
  assert.equal(manager.getPeer('viewer'), undefined);
  manager.dispose();
});

test('pause queued during video attachment drains both senders without attaching stale audio', async () => {
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream());
  const peer = manager.getPeer('viewer');
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  peer.videoSender.replaceTrack = async track => {
    entered();
    await new Promise(resolve => { release = resolve; });
    peer.videoSender.track = track;
  };
  const attachment = manager.attachLocalStream(new MockMediaStream());
  await started;
  const pause = manager.detachLocalStream();
  release();
  // The detach invokes replaceTrack(null) on the same serialized sender.
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([attachment, pause]);
  assert.equal(peer.videoSender.track, null);
  if (peer.audioSender) assert.equal(peer.audioSender.track, null);
  manager.dispose();
});

test('source replacement reuses negotiated senders without a new offer, including audio removal/return', async () => {
  const signals = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: (target, data) => { signals.push(data); return true; },
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream([new MockMediaStreamTrack('video'), new MockMediaStreamTrack('audio')]));
  await manager.handleAnswer('viewer', { type: 'answer', sdp: 'answer' });
  const peer = manager.getPeer('viewer');
  const videoSender = peer.videoSender, audioSender = peer.audioSender;
  const offers = signals.filter(s => s.type === 'offer').length;
  await manager.detachLocalStream();
  const videoOnly = new MockMediaStream();
  await manager.attachLocalStream(videoOnly);
  assert.equal(peer.videoSender, videoSender);
  assert.equal(peer.audioSender, audioSender);
  assert.equal(videoSender.track, videoOnly.getVideoTracks()[0]);
  assert.equal(audioSender.track, null);
  const withAudio = new MockMediaStream([new MockMediaStreamTrack('video'), new MockMediaStreamTrack('audio')]);
  await manager.detachLocalStream();
  await manager.attachLocalStream(withAudio);
  assert.equal(audioSender.track, withAudio.getAudioTracks()[0]);
  assert.equal(signals.filter(s => s.type === 'offer').length, offers);
  manager.dispose();
});

test('incompatible source properties fall back to addTrack and negotiation on the existing connection', async () => {
  const signals = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: (target, data) => { signals.push(data); return true; },
    onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  manager.setParticipants(['viewer']);
  await manager.attachLocalStream(new MockMediaStream());
  await manager.handleAnswer('viewer', { type: 'answer', sdp: 'answer' });
  const peer = manager.getPeer('viewer'), connection = peer.pc;
  const oldSender = peer.videoSender;
  peer.videoSender.replaceTrack = async () => { throw Object.assign(new Error('Requires negotiation'), { name: 'InvalidModificationError' }); };
  // Model removeTrack without closing the reusable peer connection.
  connection.removeTrack = sender => { sender.track = null; };
  const offers = signals.filter(s => s.type === 'offer').length;
  const next = new MockMediaStream();
  await manager.attachLocalStream(next);
  assert.equal(manager.getPeer('viewer').pc, connection);
  assert.equal(oldSender.track, null);
  assert.equal(peer.videoSender.track, next.getVideoTracks()[0]);
  assert.equal(signals.filter(s => s.type === 'offer').length, offers + 1);
  manager.dispose();
});

test('renegotiated audio and replacement video merge into the existing presenter receiver stream', () => {
  globalThis.MediaStream = MockMediaStream;
  const received = [];
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => true,
    onRemoteStreamAdd: (id, stream) => received.push(stream), onRemoteStreamRemove: () => {},
  });
  const peer = manager.getOrCreatePeer('presenter');
  const video = new MockMediaStreamTrack('video');
  const original = new MockMediaStream([video]);
  peer.pc.ontrack({ track: video, streams: [original] });
  const audio = new MockMediaStreamTrack('audio');
  peer.pc.ontrack({ track: audio, streams: [new MockMediaStream([audio])] });
  assert.equal(received.at(-1), original);
  assert.deepEqual(original.getTracks(), [video, audio]);
  const nextVideo = new MockMediaStreamTrack('video');
  peer.pc.ontrack({ track: nextVideo, streams: [new MockMediaStream([nextVideo])] });
  assert.equal(received.at(-1), original);
  assert.deepEqual(original.getTracks(), [audio, nextVideo]);
  manager.dispose();
});

test('latest quality wins across multiple viewers, late join, replacement, detach and sender fallback', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal: () => {}, onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {} });
  try {
    const video = new MockMediaStreamTrack('video');
    const audio = new MockMediaStreamTrack('audio');
    audio.enabled = false;
    const first = manager.getOrCreatePeer('first');
    const second = manager.getOrCreatePeer('second');
    await manager.attachLocalStream(new MockMediaStream([video, audio]));
    let release;
    const sender = first.videoSender;
    const original = sender.setParameters.bind(sender);
    let count = 0;
    sender.setParameters = async params => {
      if (count++ === 0) await new Promise(resolve => { release = resolve; });
      return original(params);
    };
    const old = manager.applyQuality({ priority: 'motion', profile: 'ultra', fps: 60 });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    const latest = manager.applyQuality({ priority: 'sharpness', profile: 'balanced', fps: 30 });
    release(); await Promise.all([old, latest]);
    for (const peer of [first, second]) {
      assert.equal(peer.videoSender.parameters.encodings[0].maxBitrate, 3000000);
      assert.equal(peer.videoSender.parameters.degradationPreference, 'maintain-resolution');
    }
    const late = manager.getOrCreatePeer('late');
    await manager.createAndSendOffer('late');
    assert.equal(late.videoSender.parameters.encodings[0].maxFramerate, 30);
    await manager.handleOffer('late-answer', { type: 'offer', sdp: 'late-offer' });
    assert.equal(manager.getPeers().get('late-answer').videoSender.parameters.encodings[0].maxFramerate, 30);
    const replacement = new MockMediaStreamTrack('video');
    await manager.attachLocalStream(new MockMediaStream([replacement, audio]));
    assert.equal(audio.enabled, false);
    assert.equal(first.videoSender.track, replacement);
    const fallback = first.videoSender.setParameters.bind(first.videoSender);
    first.videoSender.setParameters = async params => {
      if (params.degradationPreference === 'maintain-framerate') throw new Error('unsupported preference');
      return fallback(params);
    };
    await manager.applyQuality({ priority: 'motion', profile: 'ultra', fps: 60 });
    assert.equal(first.videoSender.parameters.encodings[0].maxBitrate, 8000000);
    await manager.detachLocalStream();
    assert.equal(first.videoSender.track, null);
    assert.equal(first.audioSender.track, null);
  } finally { manager.dispose(); }
});

test('quality completion cannot send an answer from a retired peer', async () => {
  const signals = [];
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal: (_, signal) => signals.push(signal), onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {} });
  try {
    await manager.attachLocalStream(new MockMediaStream([new MockMediaStreamTrack('video')]));
    const peer = manager.getOrCreatePeer('retiring');
    let release;
    const original = peer.videoSender.setParameters.bind(peer.videoSender);
    peer.videoSender.setParameters = async parameters => {
      await new Promise(resolve => { release = resolve; });
      return original(parameters);
    };
    const answer = manager.handleOffer('retiring', { type: 'offer', sdp: 'offer' });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    manager.removePeer('retiring');
    release();
    await answer;
    assert.equal(signals.filter(signal => signal.type === 'answer').length, 0);
  } finally { manager.dispose(); }
});

test('recovery reports partial constraints or sender failures without interrupting video/audio', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal() {}, onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  try {
    const video = new MockMediaStreamTrack('video'), audio = new MockMediaStreamTrack('audio');
    video.contentHint = '';
    video.getSettings = () => ({ width: 640, height: 360, frameRate: 30 });
    video.applyConstraints = async () => {};
    audio.enabled = false;
    const peer = manager.getOrCreatePeer('viewer');
    await manager.attachLocalStream(new MockMediaStream([video, audio]));
    assert.equal(await manager.applyQuality({ priority: 'motion', profile: 'economy', fps: 30 }), true);
    video.applyConstraints = async () => { throw new Error('constraints unavailable'); };
    assert.equal(await manager.applyQuality({ priority: 'motion', profile: 'balanced', fps: 60 }), false);
    video.applyConstraints = async () => {};
    peer.videoSender.setParameters = async () => { throw new Error('parameters unavailable'); };
    assert.equal(await manager.applyQuality({ priority: 'motion', profile: 'ultra', fps: 60 }), false);
    assert.equal(peer.videoSender.track, video);
    assert.equal(peer.audioSender.track, audio);
    assert.equal(video.readyState, 'live');
    assert.equal(audio.enabled, false);
  } finally { manager.dispose(); }
});

test('peer-manager: spectators negotiate one data-only channel on demand and reuse media connection', async () => {
  const signals = [], bindings = [], disconnected = [];
  const manager = new PeerManager({ localPeerId: 'a', rtcConfig: { iceServers: [] }, onSendSignal: (target, data) => signals.push(data),
    onRemoteStreamAdd() {}, onRemoteStreamRemove() {}, onDataChannel: (id, channel) => bindings.push(channel), onDataDisconnect: id => disconnected.push(id) });
  manager.setParticipants(['b']); assert.equal(manager.getPeers().size, 0);
  const peer = manager.getOrCreatePeer('b');
  peer.pc.createDataChannel = (label, options) => ({ label, ...options, readyState: 'connecting', close() { this.readyState = 'closed'; } });
  const channel = manager.ensureDataChannel('b'); assert.equal(manager.ensureDataChannel('b'), channel); assert.equal(bindings.length, 1);
  await manager.createAndSendOffer('b'); assert.equal(signals.filter(s => s.type === 'offer').length, 1);
  assert.equal(channel.negotiated, true); assert.equal(channel.id, 0);
  assert.equal(manager.ensureDataChannel('outsider'), null);
  manager.resetPeer('b'); assert.equal(channel.readyState, 'closed'); assert.ok(disconnected.includes('b'));
  assert.equal(manager.getPeers().size, 0); manager.dispose();
});

test('peer-manager: higher spectator waits for initial data offer without weakening generation checks', async () => {
  const signals = [];
  const manager = new PeerManager({ localPeerId: 'z', rtcConfig: { iceServers: [] }, onSendSignal: (id, data) => signals.push(data), onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  manager.setParticipants(['a']); const peer = manager.getOrCreatePeer('a');
  peer.pc.createDataChannel = () => ({ readyState: 'connecting', close() {} });
  manager.ensureDataChannel('a'); await manager.createAndSendOffer('a'); assert.equal(signals.length, 0);
  await manager.handleSignal('a', { type: 'offer', generation: 'remote', negotiationId: 'initial', sdp: { type: 'offer', sdp: 'data-offer' } });
  assert.equal(signals.at(-1).type, 'answer');
  await manager.handleSignal('a', { type: 'offer', generation: 'retired', negotiationId: 'stale', sdp: { type: 'offer', sdp: 'stale-offer' } });
  assert.equal(signals.length, 1); manager.dispose();
});
