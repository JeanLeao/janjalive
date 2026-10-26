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
  // Unchanged counters provide no packet-loss measurement
  await collector.collect();

  assert.ok(latestStats);
  assert.equal(latestStats.activeConnections, 0);
  assert.equal(latestStats.rttMs, 25); // 0.025s * 1000 = 25ms
  assert.equal(latestStats.lossPercent, null);
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
  assert.equal(metrics.activeConnections, 0);
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
  assert.equal(metrics.bitrateKbps, null);
  bytes = 50;
  await collector.collect();
  assert.equal(metrics.bitrateKbps, null);
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

test('diagnostics preserve independent peer states, unavailable stats and measured zero', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal() {}, onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  const first = manager.getOrCreatePeer('first');
  const second = manager.getOrCreatePeer('second');
  first.pc.connectionState = 'connected';
  second.pc.connectionState = 'connecting';
  let received = 100;
  first.pc.getStats = async () => new Map([
    ['in', { id: 'in', type: 'inbound-rtp', kind: 'video', packetsReceived: received, packetsLost: 0, bytesReceived: 0, framesDecoded: 0 }],
    ['pair', { id: 'pair', type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0 }],
  ]);
  second.pc.getStats = async () => { throw new Error('unsupported'); };
  let metrics;
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; } });
  await collector.collect();
  assert.equal(metrics.activeConnections, 1);
  assert.equal(metrics.lossPercent, 0);
  assert.equal(metrics.rttMs, 0);
  assert.equal(metrics.bitrateKbps, null);
  assert.equal(metrics.peers[0].framesDecoded, 0);
  assert.equal(metrics.peers[1].stats, 'unavailable');
  assert.equal(metrics.peers[1].lossPercent, null);
  received++;
  await collector.collect();
  assert.equal(metrics.bitrateKbps, 0);
  assert.equal(metrics.lossPercent, 0);
  collector.stop(); manager.dispose();
});

test('stopping during pending stats discards the obsolete result and overlapping collects', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal() {}, onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  const peer = manager.getOrCreatePeer('pending');
  let resolve, calls = 0;
  peer.pc.getStats = () => { calls++; return new Promise(done => { resolve = done; }); };
  let metrics;
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; } });
  const pending = collector.collect();
  await collector.collect();
  assert.equal(calls, 1);
  collector.stop(); resolve(new Map()); await pending;
  assert.equal(metrics, null);
  manager.dispose();
});

test('missing reports, missing fields and pending intervals remain distinct', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal() {}, onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  const peer = manager.getOrCreatePeer('partial');
  let report = new Map(), metrics;
  peer.pc.getStats = async () => report;
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; } });
  await collector.collect();
  assert.deepEqual(metrics.peers[0].measurement, { bitrate: 'no-report', loss: 'no-report', rtt: 'no-report' });
  report = new Map([['in', { id: 'in', type: 'inbound-rtp', kind: 'video', packetsReceived: 1 }]]);
  await collector.collect();
  assert.equal(metrics.lossPercent, null);
  assert.equal(metrics.bitrateKbps, null);
  assert.equal(metrics.peers[0].measurement.loss, 'unsupported');
  assert.equal(metrics.peers[0].measurement.bitrate, 'unsupported');
  report.get('in').bytesReceived = 100;
  report.get('in').packetsLost = 0;
  await collector.collect();
  assert.equal(metrics.peers[0].measurement.bitrate, 'pending');
  assert.equal(metrics.lossPercent, 0);
  await collector.collect();
  assert.equal(metrics.peers[0].measurement.loss, 'pending');
  assert.equal(metrics.lossPercent, null);
  assert.equal(metrics.bitrateKbps, 0);
  collector.stop(); manager.dispose();
});

test('partial inbound stats cannot borrow outbound counters or repeat first decoded event', async () => {
  const manager = new PeerManager({ rtcConfig: {}, onSendSignal() {}, onRemoteStreamAdd() {}, onRemoteStreamRemove() {} });
  const peer = manager.getOrCreatePeer('bidirectional');
  const events = [];
  peer.pc.getStats = async () => new Map([
    ['in', { id: 'in', type: 'inbound-rtp', kind: 'video', framesDecoded: 1 }],
    ['out', { id: 'out', type: 'outbound-rtp', kind: 'video', bytesSent: 1000, packetsSent: 100 }],
    ['remote', { id: 'remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'out', packetsReceived: 100, packetsLost: 0 }],
  ]);
  let metrics;
  const collector = new StatsCollector({ peerManager: manager, onStats: value => { metrics = value; }, logger: { log: event => events.push(event) } });
  await collector.collect(); await collector.collect();
  assert.equal(metrics.lossPercent, null);
  assert.equal(metrics.bitrateKbps, null);
  assert.equal(metrics.peers[0].receiving, null);
  assert.equal(events.filter(event => event === 'first-frame').length, 1);
  collector.stop(); manager.dispose();
});

test('no peers measures zero WebRTC connections without inventing network samples', async () => {
  let metrics;
  const collector = new StatsCollector({ peerManager: { getPeers: () => new Map() }, onStats: value => { metrics = value; } });
  await collector.collect();
  assert.deepEqual(metrics, { bitrateKbps: null, lossPercent: null, rttMs: null, activeConnections: 0, peers: [] });
  collector.stop();
});

function recoveryHarness() {
  let now = 0, loss = 0, rtt, publishing = true, mode = 'valid';
  const peers = new Map();
  const events = [];
  function add(id) {
    let received = 0, lost = 0, stamp = -3000;
    const pc = { connectionState: 'connected', iceConnectionState: 'connected', signalingState: 'stable', getStats: async () => {
      if (mode === 'missing') return new Map();
      if (mode === 'reject') throw new Error('stats unavailable');
      if (mode !== 'repeated') stamp = now;
      received += mode === 'insufficient' ? 1 : 100 - loss;
      lost += loss;
      return new Map([
        ['out', { id: 'out', type: 'outbound-rtp', kind: 'video', timestamp: now, packetsSent: received + lost }],
        ['remote', { id: 'remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'out', timestamp: mode === 'old' ? now - 9000 : stamp,
          packetsReceived: mode === 'invalid' ? NaN : received, packetsLost: lost, roundTripTime: rtt }],
      ]);
    } };
    peers.set(id, { pc });
    return pc;
  }
  add('a');
  const collector = new StatsCollector({ peerManager: { getPeers: () => peers }, onStats() {}, now: () => now,
    isPublishing: () => publishing, onRecovery: () => events.push(['recover', now]), onDegradation: () => events.push(['reduce', now]) });
  return { collector, peers, events, add, set: values => {
    if ('loss' in values) loss = values.loss;
    if ('rtt' in values) rtt = values.rtt;
    if ('mode' in values) mode = values.mode;
    if ('publishing' in values) publishing = values.publishing;
  }, tick: async (gap = 3000) => { now += gap; await collector.collect(); } };
}

test('recovery requires 60 continuous seconds and 60 seconds between steps, without RTT', async () => {
  const h = recoveryHarness();
  await h.tick(); // baseline
  for (let i = 0; i < 20; i++) await h.tick();
  assert.deepEqual(h.events, []);
  await h.tick();
  assert.deepEqual(h.events, [['recover', 66000]]);
  for (let i = 0; i < 20; i++) await h.tick();
  assert.equal(h.events.length, 1);
  await h.tick();
  assert.deepEqual(h.events[1], ['recover', 129000]);
});

for (const block of [{ loss: 2 }, { rtt: .301 }, { mode: 'missing' }, { mode: 'repeated' }, { mode: 'old' }, { mode: 'invalid' }, { mode: 'insufficient' }, { mode: 'reject' }, { publishing: false }]) {
  test(`recovery blocked by ${JSON.stringify(block)} and requires a new full window`, async () => {
    const h = recoveryHarness();
    for (let i = 0; i < 18; i++) await h.tick();
    h.set(block);
    for (let i = 0; i < 25; i++) await h.tick();
    assert.deepEqual(h.events, []);
    h.set({ loss: 0, rtt: undefined, mode: 'valid', publishing: true });
    for (let i = 0; i < 19; i++) await h.tick();
    assert.deepEqual(h.events, []);
    for (let i = 0; i < 4; i++) await h.tick();
    assert.equal(h.events[0][0], 'recover');
  });
}

for (const change of ['join', 'leave', 'replace', 'disconnected', 'gap', 'manual-reset']) {
  test(`recovery invalidates previous stability on ${change}`, async () => {
    const h = recoveryHarness();
    if (change === 'leave') h.add('b');
    for (let i = 0; i < 18; i++) await h.tick();
    if (change === 'join') h.add('b');
    if (change === 'leave') h.peers.delete('b');
    if (change === 'replace') h.add('a');
    if (change === 'disconnected') h.peers.get('a').pc.connectionState = 'disconnected';
    if (change === 'manual-reset') h.collector.resetAdaptation();
    await h.tick(change === 'gap' ? 9000 : 3000);
    if (change === 'disconnected') h.peers.get('a').pc.connectionState = 'connected';
    for (let i = 0; i < 19; i++) await h.tick();
    assert.deepEqual(h.events, []);
    for (let i = 0; i < 4; i++) await h.tick();
    assert.equal(h.events[0][0], 'recover');
  });
}

test('one unavailable peer and zero spectators block global recovery', async () => {
  const h = recoveryHarness();
  h.peers.set('bad', { pc: { connectionState: 'connected', getStats: async () => new Map() } });
  for (let i = 0; i < 30; i++) await h.tick();
  assert.deepEqual(h.events, []);
  h.peers.clear();
  for (let i = 0; i < 30; i++) await h.tick();
  assert.deepEqual(h.events, []);
});

test('degradation keeps 20 second cooldown and resets recovery stability', async () => {
  const h = recoveryHarness();
  h.set({ loss: 6 });
  for (let i = 0; i < 10; i++) await h.tick();
  assert.deepEqual(h.events, [['reduce', 6000], ['reduce', 27000]]);
  h.set({ loss: 0 });
  for (let i = 0; i < 20; i++) await h.tick();
  assert.equal(h.events.length, 2);
  await h.tick();
  assert.equal(h.events[2][0], 'recover');
});

test('reset during delayed stats cancels automatic decisions', async () => {
  const h = recoveryHarness();
  for (let i = 0; i < 21; i++) await h.tick();
  let resolve;
  h.peers.get('a').pc.getStats = () => new Promise(done => { resolve = done; });
  const pending = h.tick();
  h.collector.resetAdaptation();
  resolve(new Map());
  await pending;
  assert.deepEqual(h.events, []);
});

test('a single peer at 3% loss blocks recovery even when the other peer is stable', async () => {
  const h = recoveryHarness();
  const bad = h.add('bad');
  const getStats = bad.getStats;
  let packets = 0;
  bad.getStats = async () => {
    const reports = await getStats();
    packets++;
    reports.get('remote').packetsReceived = packets * 97;
    reports.get('remote').packetsLost = packets * 3;
    return reports;
  };
  for (let i = 0; i < 30; i++) await h.tick();
  assert.deepEqual(h.events, []);
});

test('300ms RTT is allowed; absent outbound report timestamp cannot prove freshness', async () => {
  const h = recoveryHarness();
  h.set({ rtt: .3 });
  for (let i = 0; i < 22; i++) await h.tick();
  assert.deepEqual(h.events, [['recover', 66000]]);
  h.collector.resetAdaptation();
  const pc = h.peers.get('a').pc;
  const getStats = pc.getStats;
  pc.getStats = async () => {
    const reports = await getStats();
    delete reports.get('out').timestamp;
    return reports;
  };
  for (let i = 0; i < 30; i++) await h.tick();
  assert.equal(h.events.length, 1);
});

test('a getStats result delayed more than two cadences cannot finish the stability window', async () => {
  const h = recoveryHarness();
  for (let i = 0; i < 21; i++) await h.tick();
  const pc = h.peers.get('a').pc, getStats = pc.getStats;
  let resolve;
  pc.getStats = async () => {
    const reports = await getStats();
    await new Promise(done => { resolve = done; });
    return reports;
  };
  const pending = h.tick();
  await new Promise(setImmediate);
  await h.tick(9000); // concurrent collection is skipped, but monotonic time advances
  resolve(); await pending;
  assert.deepEqual(h.events, []);
});

test('screen stats exclude camera loss even when camera RTP reports arrive last', async () => {
  let sample = 0;
  let degraded = 0;
  const pc = new MockRTCPeerConnection();
  pc.connectionState = 'connected';
  const videoSender = { track: { id: 'screen' } };
  pc.getTransceivers = () => [{ mid: '0', sender: videoSender }];
  pc.getStats = async () => {
    sample++;
    return new Map([
      ['screen', { id: 'screen', type: 'outbound-rtp', kind: 'video', mid: '0', timestamp: sample * 3000, packetsSent: sample * 100, bytesSent: sample * 1000 }],
      ['screen-remote', { id: 'screen-remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'screen', timestamp: sample * 3000, packetsReceived: sample * 100, packetsLost: 0 }],
      ['camera', { id: 'camera', type: 'outbound-rtp', kind: 'video', mid: '1', timestamp: sample * 3000, packetsSent: sample * 100, bytesSent: sample * 1000 }],
      ['camera-remote', { id: 'camera-remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'camera', timestamp: sample * 3000, packetsReceived: sample * 50, packetsLost: sample * 50 }],
    ]);
  };
  const peers = new Map([['viewer', { pc, videoSender, cameraSender: { track: { id: 'camera' } } }]]);
  const collector = new StatsCollector({ peerManager: { getPeers: () => peers }, onStats() {}, onDegradation() { degraded++; } });
  await collector.collect(); await collector.collect();
  assert.equal(degraded, 0);
  pc.getTransceivers = () => [];
  await collector.collect(); await collector.collect();
  assert.equal(degraded, 0, 'ambiguous reports fail closed');
});

test('camera adaptation and F34 use independent reports and worst recipients without inbound substitution', async () => {
  let now=0, level=0, reductions=0, suspensions=0, screenReductions=0, screenRecoveries=0;
  const cameraTrack={id:'camera',readyState:'live'};
  const peers=new Map();
  for(const id of ['good','bad']) {
    const pc=new MockRTCPeerConnection(); pc.connectionState='connected';
    const videoSender={track:{id:'screen'}}, cameraSender={track:cameraTrack};
    pc.getTransceivers=()=>[{mid:'0',sender:videoSender},{mid:'1',sender:cameraSender}];
    pc.getStats=async()=>new Map([
      ['s',{id:'s',type:'outbound-rtp',kind:'video',mid:'0',timestamp:now,packetsSent:now,bytesSent:now}],
      ['sr',{id:'sr',type:'remote-inbound-rtp',kind:'video',localId:'s',timestamp:now,packetsReceived:now,packetsLost:0}],
      ['c',{id:'c',type:'outbound-rtp',kind:'video',mid:'1',timestamp:now,bytesSent:now,framesEncoded:now}],
      ['cr',{id:'cr',type:'remote-inbound-rtp',kind:'video',localId:'c',timestamp:now,packetsReceived:now,packetsLost:id==='bad'?now/9:0}],
    ]);
    peers.set(id,{pc,videoSender,cameraSender});
  }
  const collector=new StatsCollector({now:()=>now,peerManager:{getPeers:()=>peers,getCameraTrack:()=>cameraTrack,
    getCameraLevel:()=>level,reduceCameraQuality:async()=>{level++;reductions++;}},
    isPublishing:()=>true,isCameraPublishing:()=>true,onStats(){},onDegradation(){screenReductions++;},
    onRecovery(){screenRecoveries++;},onCameraSuspension(){suspensions++;}});
  for(let n=1;n<=30;n++){now=n*3000;await collector.collect();}
  assert.equal(reductions,2); assert.equal(suspensions,1); assert.equal(screenReductions,0);
  assert.equal(screenRecoveries,1,'camera loss does not block F34 recovery');
});
