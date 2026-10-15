import test from 'node:test';
import assert from 'node:assert/strict';
import { StatsCollector } from '../src/features/room/stats/stats-collector.ts';
import { PeerManager } from '../src/features/room/webrtc/peer-manager.ts';
import { MockRTCPeerConnection } from './mock-webrtc.js';

globalThis.RTCPeerConnection = MockRTCPeerConnection;

test('stats-collector: computes bitrate, loss percentage and rtt from WebRTC stats', async () => {
  let latestStats = null;
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: () => {},
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const peer = manager.getOrCreatePeer('viewer-1');
  assert.ok(peer);

  const collector = new StatsCollector({
    peerManager: manager,
    onStats: (metrics) => {
      latestStats = metrics;
    },
  });

  // First sample sets baseline
  await collector.collect();
  assert.equal(latestStats.lossPercent, 2.0);
  // Unchanged counters produce zero interval loss
  await collector.collect();

  assert.ok(latestStats);
  assert.equal(latestStats.activeConnections, 1);
  assert.equal(latestStats.rttMs, 25); // 0.025s * 1000 = 25ms
  assert.equal(latestStats.lossPercent, 0);
});

test('stats-collector: triggers onDegradation when packet loss >= 5% with cooldown', async () => {
  const degradationEvents = [];
  const manager = new PeerManager({
    rtcConfig: { iceServers: [] },
    onSendSignal: () => {},
    onRemoteStreamAdd: () => {},
    onRemoteStreamRemove: () => {},
  });

  const peer = manager.getOrCreatePeer('viewer-1');
  let sample = 0;
  // Override peer stats to return high loss
  peer.pc.getStats = async () => {
    sample++;
    const map = new Map();
    map.set('outbound', {
      type: 'outbound-rtp',
      kind: 'video',
      isRemote: false,
      id: 'out',
      packetsSent: 100,
      bytesSent: 100000,
    });
    map.set('inbound', {
      type: 'remote-inbound-rtp',
      kind: 'video',
      localId: 'out',
      timestamp: sample * 3000,
      packetsReceived: 90 * sample,
      packetsLost: 10 * sample, // 10% loss
    });
    return map;
  };

  const collector = new StatsCollector({
    peerManager: manager,
    onStats: () => {},
    onDegradation: (loss) => degradationEvents.push(loss),
  });

  await collector.collect();
  assert.equal(degradationEvents.length, 0, 'First report establishes baseline');
  await collector.collect();
  assert.equal(degradationEvents.length, 1);
  assert.equal(degradationEvents[0], 10);

  // Immediately collecting again should be blocked by cooldown (20s)
  await collector.collect();
  assert.equal(degradationEvents.length, 1, 'Cooldown should prevent repeated triggers');
});

test('stats-collector: spectators collect inbound traffic, frames and interval loss', async () => {
  let metrics;
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => {}, onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  const peer = manager.getOrCreatePeer('presenter');
  let packets = 90, lost = 10, bytes = 100000;
  peer.pc.getStats = async () => new Map([['inbound', {
    type: 'inbound-rtp', kind: 'video', packetsReceived: packets, packetsLost: lost,
    bytesReceived: bytes, framesDecoded: 30,
  }]]);
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; } });
  await collector.collect();
  assert.equal(metrics.lossPercent, 10);
  packets += 99; lost += 1; bytes += 100000;
  await collector.collect();
  assert.equal(metrics.lossPercent, 1);
  assert.ok(metrics.bitrateKbps > 0);
  assert.equal(metrics.activeConnections, 1);
  manager.dispose();
});

test('stats-collector: switching RTP sources or resetting counters cannot produce negative bitrate', async () => {
  let metrics;
  const manager = new PeerManager({
    rtcConfig: {}, onSendSignal: () => {}, onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {},
  });
  const peer = manager.getOrCreatePeer('presenter');
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; } });
  await collector.collect();
  let bytes = 100;
  peer.pc.getStats = async () => new Map([['inbound', {
    id: 'inbound', type: 'inbound-rtp', kind: 'video', packetsReceived: 10, bytesReceived: bytes,
  }]]);
  await collector.collect();
  assert.equal(metrics.bitrateKbps, 0);
  bytes = 50;
  await collector.collect();
  assert.equal(metrics.bitrateKbps, 0);
  manager.dispose();
});

test('degradation uses worst fresh OUTBOUND interval, ignores inbound loss, stale reports and resets', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal: () => {}, onRemoteStreamAdd: () => {}, onRemoteStreamRemove: () => {} });
  const bad = manager.getOrCreatePeer('bad');
  const good = manager.getOrCreatePeer('good');
  let timestamp = 1000, received = 90, lost = 10;
  let events = [];
  const sample = (lossy) => new Map([
    ['out', { id: 'out', type: 'outbound-rtp', kind: 'video', bytesSent: received * 1000, packetsSent: received + lost }],
    ['remote', { id: 'remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'out', timestamp,
      packetsReceived: received, packetsLost: lossy ? lost : 0 }],
    ['in', { id: 'in', type: 'inbound-rtp', kind: 'video', packetsReceived: received, packetsLost: 10000, bytesReceived: 1000 }],
  ]);
  bad.pc.getStats = async () => sample(true);
  good.pc.getStats = async () => sample(false);
  const collector = new StatsCollector({ peerManager: manager, onStats: () => {}, onDegradation: loss => events.push(loss) });
  try {
    await collector.collect();
    await collector.collect();
    assert.deepEqual(events, []);
    timestamp += 3000; received += 94; lost += 6;
    await collector.collect();
    assert.deepEqual(events, [6], '6% on one viewer must not be diluted by another connection or inbound traffic');
    collector.stop(); events = [];
    timestamp += 3000; received = 1; lost = 0;
    await collector.collect();
    assert.deepEqual(events, []);
  } finally { collector.stop(); manager.dispose(); }
});
