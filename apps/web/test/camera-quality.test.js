import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraQualityObserver } from '../src/features/room/stats/camera-quality.ts';

function fixture() {
  const observer = new CameraQualityObserver();
  const track = { id: 'cam', readyState: 'live' }, sender = { track };
  const pc = { connectionState: 'connected', getTransceivers: () => [{ sender, mid: '2' }] };
  const sample = (n, overrides = {}, remoteOverrides = {}, target = pc, id = 'a') => observer.observe(id, target, sender, new Map([
    ['out', { type: 'outbound-rtp', kind: 'video', id: 'out', mid: '2', timestamp: n * 3000,
      bytesSent: n * 50000, framesEncoded: n * 30, framesPerSecond: 10, ...overrides }],
    ['remote', { type: 'remote-inbound-rtp', kind: 'video', id: 'remote', localId: 'out', timestamp: n * 3000,
      packetsReceived: n * 90, packetsLost: n * 10, roundTripTime: .1, ...remoteOverrides }],
  ]), n * 3000);
  return { observer, sample, pc, sender };
}
test('camera quality: sustained worst recipient evidence, cooldown, separate low-profile suspension window', () => {
  const {observer,sample}=fixture();
  assert.equal(sample(1).degraded,false);
  for (let n=2;n<=4;n++) assert.equal(sample(n).degraded,false);
  const bad=sample(5); assert.equal(bad.degraded,true);
  assert.equal(observer.decide(15000,bad.degraded,bad.persistent,0),'reduce');
  assert.equal(observer.decide(16000,true,true,1),null);
  // Reset after every decision forces new evidence at the new ceiling.
  assert.equal(sample(6).degraded,false);
  for(let n=7;n<=10;n++) sample(n);
  assert.equal(observer.decide(30000,true,false,1),'reduce');
  for(let n=11;n<=21;n++) assert.equal(sample(n).persistent,false);
  const persistent=sample(22); assert.equal(persistent.persistent,true);
  assert.equal(observer.decide(66000,persistent.degraded,persistent.persistent,2),'suspend');
});
for (const [name, outbound, remote] of [
  ['missing loss', {}, {packetsLost:undefined}], ['repeated remote', {}, {timestamp:3000}],
  ['old remote', {}, {timestamp:0}], ['ambiguous source', {mid:undefined}, {}],
  ['no encoded traffic', {framesEncoded:30}, {}], ['too few packets', {}, {packetsReceived:1,packetsLost:1}],
  ['unassociated loss', {}, {localId:'screen'}],
]) test(`camera quality: ${name} cannot trigger adaptation`, () => {
  const {sample}=fixture();
  for(let n=1;n<=30;n++) { const result=sample(n,outbound,remote); assert.equal(result.degraded,false); assert.equal(result.persistent,false); }
});
test('camera quality: good samples, gaps, connection replacement and reset break sustained degradation', () => {
  const {sample,observer,pc}=fixture();
  for(let n=1;n<=4;n++) sample(n);
  assert.equal(sample(5,{}, {packetsLost:40,packetsReceived:460}).degraded,false);
  assert.equal(sample(10).degraded,false);
  assert.equal(sample(11,{}, {}, {...pc}).degraded,false);
  observer.reset(); assert.equal(sample(12).degraded,false);
});
test('camera quality: encoder evidence works without fabricated remote loss; different recipients never average', () => {
  const {sample}=fixture();
  for(let n=1;n<=5;n++) {
    sample(n,{}, {packetsLost:0},undefined,'healthy');
    const result=sample(n,{qualityLimitationReason:'cpu'}, {packetsLost:undefined},undefined,'limited');
    assert.equal(result.lossPercent,undefined);
    assert.equal(result.degraded,n===5);
  }
});

test('camera quality: track and report generation changes discard preceding degradation', () => {
  const {sample,sender}=fixture();
  for(let n=1;n<=4;n++)sample(n);
  sender.track={id:'new-camera',readyState:'live'};
  assert.equal(sample(5).degraded,false);
  for(let n=6;n<=8;n++)sample(n);
  assert.equal(sample(9,{}, {id:'new-remote'}).degraded,false);
  assert.equal(sample(10,{}, {packetsReceived:1,packetsLost:0}).degraded,false);
});

test('camera quality: sustained fresh remote RTT can reduce; low FPS and bitrate alone cannot', () => {
  const {sample}=fixture();
  for(let n=1;n<=5;n++) {
    assert.equal(sample(n,{framesPerSecond:1,bytesSent:n}, {packetsLost:0,roundTripTime:.5}).degraded,n===5);
  }
  for(let n=6;n<=12;n++) assert.equal(sample(n,{framesPerSecond:1,bytesSent:n}, {packetsLost:0,roundTripTime:.1}).degraded,false);
});

for (const [name, received, lost, firstBad] of [
  ['total loss', 0, 60, 5], ['low traffic', 18, 2, 7],
]) test(`camera quality: ${name} needs sustained evidence at every profile`, () => {
  const { sample, observer } = fixture();
  let n = 0;
  const next = () => { n++; return sample(n, {}, { packetsReceived: n * received, packetsLost: n * lost }); };
  for (let level = 0; level <= 2; level++) {
    let result;
    for (let i = 1; i <= (level === 2 ? firstBad + 7 : firstBad); i++) {
      result = next();
      if (i < firstBad) assert.equal(result.degraded, false);
      if (level === 2) {
        assert.equal(result.persistent, i === firstBad + 7);
        if (!result.persistent) assert.equal(observer.decide(n * 3000, result.degraded, result.persistent, level), null);
      }
    }
    assert.equal(observer.decide(n * 3000, result.degraded, result.persistent, level), level === 2 ? 'suspend' : 'reduce');
  }
});

test('camera quality: healthy current reports immediately break loss persistence and allow fresh evidence later', () => {
  const { sample } = fixture();
  for (let n = 1; n <= 9; n++) sample(n, {}, { packetsReceived: 0, packetsLost: n * 20 });
  const healthy = sample(10, {}, { packetsReceived: 20, packetsLost: 180 });
  assert.equal(healthy.degraded, false);
  assert.equal(healthy.persistent, false);
  for (let n = 11; n <= 13; n++) assert.equal(sample(n, {}, { packetsReceived: 20, packetsLost: 180 + (n - 10) * 20 }).degraded, false);
  assert.equal(sample(14, {}, { packetsReceived: 20, packetsLost: 260 }).degraded, true);
});

for (const [name, received, lost] of [['no traffic', 0, 0], ['insufficient within bounded window', 1, 1]])
test(`camera quality: ${name} never proves degradation even over a long session`, () => {
  const { sample } = fixture();
  for (let n = 1; n <= 60; n++) {
    const result = sample(n, {}, { packetsReceived: n * received, packetsLost: n * lost, roundTripTime: 1 });
    assert.equal(result.degraded, false);
    assert.equal(result.persistent, false);
    assert.equal(result.lossPercent, undefined);
  }
});

for (const [name, outbound, remote, disconnected] of [
  ['stopped counters', {}, { packetsReceived: 54, packetsLost: 6 }],
  ['reset counters', {}, { packetsReceived: 0, packetsLost: 0 }],
  ['stale report', {}, { timestamp: 3000 }],
  ['missing report counters', {}, { packetsLost: undefined }],
  ['other sender', {}, { localId: 'screen' }],
  ['other report generation', {}, { id: 'replacement' }],
  ['other outbound generation', { id: 'replacement' }, {}],
  ['disconnected', {}, {}, true],
]) test(`camera quality: ${name} discards low-volume accumulated evidence`, () => {
  const { sample, pc } = fixture();
  const counters = n => ({ packetsReceived: n * 18, packetsLost: n * 2 });
  for (let n = 1; n <= 3; n++) sample(n, {}, counters(n));
  if (disconnected) pc.connectionState = 'disconnected';
  const result = sample(4, outbound, { ...counters(4), ...remote });
  assert.equal(result.degraded, false);
  assert.equal(result.lossPercent, undefined);
  pc.connectionState = 'connected';
  for (let n = 5; n <= 7; n++) assert.equal(sample(n, {}, counters(n)).degraded, false);
});
