import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCampaign, checkSummary } from './campaign.mjs';
const dir = process.argv[2] || '/tmp/screen-f20-results';
const timeout = process.argv.includes('--timeout');
if (timeout) {
  const r = JSON.parse(await readFile(`${dir}/B01-1.json`,'utf8'));
  const manifest = JSON.parse(await readFile(`${dir}/campaign.json`,'utf8'));
  assert.equal(manifest.version,1); assert.equal(manifest.status,'running');
  assert.equal(r.campaignId,manifest.campaignId); assert.equal(typeof r.campaignId,'string');
  assert.equal(r.scenario,'B01'); assert.equal(r.repetition,1); assert.equal(r.viewers,1); assert.equal(r.participants,2);
  assert.equal(r.phase,'publication'); assert.equal(r.presentation[0].status,'timeout');
  assert.equal(r.presentation[0].observedMs,null); assert.equal(r.errors.length,1);
  assert.equal(r.samples.length,0); assert.equal(r.contextsRemaining,0);
  assert.equal(r.cleanup.length,2); assert(r.cleanup.every(c => c.unloaded));
  console.log('Injected presentation timeout: status, partial artifact and cleanup verified.');
} else {
  const campaign = await loadCampaign(dir);
  const summaries = JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
  checkSummary(campaign, summaries);
  for (const [scenario,viewers] of [['B01',1],['B02',4],['B03',9]]) for (let repetition=1;repetition<=3;repetition++) {
    const r = JSON.parse(await readFile(`${dir}/${scenario}-${repetition}.json`,'utf8'));
    assert.equal(r.phase,'complete'); assert.deepEqual(r.errors,[]);
    assert.equal(r.presentation.length,viewers); assert(r.presentation.every(p => p.status === 'presented' && p.observedMs > 0));
    assert.equal(r.samples.length,16); assert.equal(r.contextsRemaining,0);
    assert.equal(r.cleanup.length,viewers+1); assert(r.cleanup.every(c => c.unloaded));
    assert.equal(r.captureRequests.length,1); assert.equal(r.normalStopVerified,true); assert.deepEqual(r.contextCloseErrors,[]);
    const summary = summaries.find(s => s.scenario === scenario && s.repetition === repetition);
    assert.equal(summary.aggregateKbps.n,15);
    assert.equal(summary.peers.length,viewers*2);
    assert.deepEqual(summary.peers.filter(p => p.participant === 0).map(p => p.viewer).sort((a,b)=>a-b),Array.from({length:viewers},(_,i)=>i+1));
    for (const p of summary.peers) { assert.equal(p.bitrateKbps.n,15); assert.equal(p.fps.n + p.fps.missing,15); }
    for (const sample of r.samples) {
      assert.equal(sample.participants.length,viewers+1);
      assert.equal(sample.participants[0].connections.length,viewers);
      for (const connection of sample.participants[0].connections) {
        assert.equal(connection.state,'connected');
        assert.equal(connection.senders.length,1);
        const sender = connection.senders[0];
        assert.equal(sender.settings.width,640); assert.equal(sender.settings.height,360);
        assert.equal(sender.settings.frameRate,20); assert.equal(sender.contentHint,'text');
        assert.equal(sender.parameters.encodings[0].maxBitrate,3000000);
        assert.equal(sender.parameters.encodings[0].maxFramerate,30);
        assert.equal(sender.parameters.degradationPreference,'maintain-resolution');
      }
    }
  }
  console.log('All nine rounds: presentation, valid samples, SSRC mapping, stable settings and cleanup verified.');
}
