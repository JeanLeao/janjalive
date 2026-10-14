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
  // Second sample after some bytes computes non-zero bitrate
  await collector.collect();

  assert.ok(latestStats);
  assert.equal(latestStats.activeConnections, 1);
  assert.equal(latestStats.rttMs, 25); // 0.025s * 1000 = 25ms
  assert.equal(latestStats.lossPercent, 2.0); // 2 lost / (98 received + 2 lost) = 2.0%
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
  // Override peer stats to return high loss
  peer.pc.getStats = async () => {
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
      packetsReceived: 90,
      packetsLost: 10, // 10% loss
    });
    return map;
  };

  const collector = new StatsCollector({
    peerManager: manager,
    onStats: () => {},
    onDegradation: (loss) => degradationEvents.push(loss),
  });

  await collector.collect();
  assert.equal(degradationEvents.length, 1);
  assert.equal(degradationEvents[0], 10);

  // Immediately collecting again should be blocked by cooldown (20s)
  await collector.collect();
  assert.equal(degradationEvents.length, 1, 'Cooldown should prevent repeated triggers');
});
