import test from 'node:test';
import assert from 'node:assert/strict';
import { measure, summary } from './metrics.mjs';
const previous = {id:'x',type:'inbound-rtp',timestamp:1000,bytesReceived:100,packetsReceived:10,packetsLost:1};
const current = {...previous,timestamp:2000,bytesReceived:1100,packetsReceived:19,packetsLost:2,framesPerSecond:20};
test('rates use report intervals, measured FPS, and packet deltas', () => {
  assert.deepEqual([measure(current,previous).bitrateKbps,measure(current,previous).lossPercent,measure(current,previous).fps],[8,10,20]);
});
test('missing, baseline, stale, reset and traffic-free intervals stay null', () => {
  for (const p of [undefined,{...previous,id:'new'},{...previous,timestamp:2000},{...previous,bytesReceived:2000}])
    assert.equal(measure(current,p).bitrateKbps,null);
  assert.equal(measure({...current,framesPerSecond:undefined},previous).fps,null);
  assert.equal(measure({...previous,timestamp:2000},previous).lossPercent,null);
  assert.equal(measure({...current,packetsLost:undefined},previous).lossPercent,null);
  assert.equal(measure({...current,packetsLost:0},previous).lossPercent,null);
  assert.equal(measure({...current,timestamp:NaN},previous).bitrateKbps,null);
});
test('summaries exclude missing values but preserve measured zero', () => {
  assert.deepEqual(summary([null,0,2]),{n:2,missing:1,mean:1,min:0,max:2});
  assert.equal(summary([null]).mean,null);
});
test('missing values carry a specific reason and zero loss is measured', () => {
  assert.equal(measure({...current,packetsLost:undefined},previous).missingReasons.loss,'field-not-provided');
  assert.equal(measure(current,undefined).missingReasons.bitrate,'initial-or-replaced-report');
  assert.equal(measure(current,{...previous,timestamp:2000}).missingReasons.bitrate,'invalid-or-stale-timestamp');
  assert.equal(measure(current,{...previous,bytesReceived:5000}).missingReasons.bitrate,'counter-decreased');
  assert.equal(measure({...current,packetsLost:1},previous).lossPercent,0);
});
