import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rounds, startCampaign, finishCampaign, loadCampaign, checkSummary } from './campaign.mjs';
import CampaignReporter from './campaign-reporter.mjs';
const scripts = path.dirname(fileURLToPath(import.meta.url));

async function fixture(t, { complete = true } = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'f20-integrity-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const dir = path.join(parent, 'campaign');
  const manifest = await startCampaign(dir);
  for (const round of rounds) {
    const { scenario, repetition, viewers } = round;
    const row = (type, ssrc) => ({ type, ssrc, measured: { bitrateKbps: 10, lossPercent: 0, fps: 20, bytesDelta: 1250 } });
    const sender = { settings: { width:640,height:360,frameRate:20 },contentHint:'text',parameters:{encodings:[{maxBitrate:3000000,maxFramerate:30}],degradationPreference:'maintain-resolution'} };
    const connections = participant => participant === 0
      ? Array.from({length:viewers},(_,index) => ({connection:index,state:'connected',rttMs:1,senders:[sender],rows:[row('outbound-rtp',index+1)]}))
      : [{connection:0,state:'connected',rttMs:1,senders:[],rows:[row('inbound-rtp',participant)]}];
    const r = { campaignId:manifest.campaignId, scenario,repetition,viewers,participants:viewers+1,
      commit:'fixture-commit',browser:'fixture-browser',browserName:'chromium',playwrightVersion:'fixture',quality:'fixture',windowMs:15000,intervalMs:1000,settleMs:3000,source:{width:640,height:360,fps:20},
      phase:'complete',errors:[],normalStopVerified:true,contextsRemaining:0,contextCloseErrors:[],captureRequests:[{}],
      cleanup:Array.from({length:viewers+1},()=>({unloaded:true})),presentation:Array.from({length:viewers},(_,i)=>({participant:i+1,status:'presented',observedMs:100})),
      samples:Array.from({length:16},(_,tick)=>({tick,participants:Array.from({length:viewers+1},(_,participant)=>({participant,connections:connections(participant)}))})) };
    await writeFile(path.join(dir,round.file),JSON.stringify(r));
  }
  if (complete) await finishCampaign(dir);
  return { dir, manifest };
}
function cli(script, dir) { return spawnSync(process.execPath,[path.join(scripts,script),dir],{encoding:'utf8'}); }
async function rejectConsumers(dir) {
  const sentinel = 'existing summary must remain untouched';
  await writeFile(path.join(dir,'summary.json'),sentinel);
  for (const script of ['summarize.mjs','validate.mjs']) {
    const r = cli(script,dir); assert.notEqual(r.status,0,`${script} must reject`);
    assert.equal(r.stdout,'',`${script} must not print successful tables`);
  }
  assert.equal(await readFile(path.join(dir,'summary.json'),'utf8'),sentinel);
}

test('complete campaign accepted by loader, summarizer and validator', async t => {
  const {dir,manifest} = await fixture(t);
  assert.equal((await loadCampaign(dir)).artifacts.length,9);
  assert.equal(cli('summarize.mjs',dir).status,0);
  const summaries = JSON.parse(await readFile(path.join(dir,'summary.json'),'utf8'));
  assert(summaries.every(s=>s.campaignId===manifest.campaignId));
  assert.equal(cli('validate.mjs',dir).status,0);
});
test('mixed campaigns rejected before either consumer uses data or replaces summary', async t => {
  const a = await fixture(t), b = await fixture(t);
  await copyFile(path.join(b.dir,'B02-2.json'),path.join(a.dir,'B02-2.json'));
  await assert.rejects(loadCampaign(a.dir),/foreign campaign/);
  await rejectConsumers(a.dir);
});
test('partial invocation remains incomplete even with nine files', async t => {
  const {dir} = await fixture(t,{complete:false});
  await assert.rejects(loadCampaign(dir),/incomplete/);
  await rejectConsumers(dir);
});
for (const problem of ['missing','extra-duplicate','wrong-round','changed','wrong-configuration']) test(`reject ${problem}`, async t => {
  const {dir} = await fixture(t,{complete:problem!=='wrong-configuration'});
  const file = path.join(dir,'B01-1.json');
  if (problem==='missing') await rm(file);
  if (problem==='extra-duplicate') await copyFile(file,path.join(dir,'B01-copy.json'));
  if (['wrong-round','changed','wrong-configuration'].includes(problem)) {
    const r = JSON.parse(await readFile(file,'utf8'));
    if (problem==='wrong-round') r.repetition=2;
    if (problem==='changed') r.samples=[];
    if (problem==='wrong-configuration') r.commit='other-commit';
    await writeFile(file,JSON.stringify(r));
  }
  await assert.rejects(problem==='wrong-configuration' ? finishCampaign(dir) : loadCampaign(dir));
  await rejectConsumers(dir);
});
test('existing directory and old artifacts never adopted or overwritten', async t => {
  const {dir} = await fixture(t);
  const before = await readFile(path.join(dir,'campaign.json'),'utf8');
  await assert.rejects(startCampaign(dir),{code:'EEXIST'});
  assert.equal(await readFile(path.join(dir,'campaign.json'),'utf8'),before);
  const legacy = path.join(path.dirname(dir),'legacy'); await mkdir(legacy);
  await writeFile(path.join(legacy,'B01-1.json'),'old');
  await assert.rejects(startCampaign(legacy),{code:'EEXIST'});
  await rejectConsumers(legacy);
  assert.equal(await readFile(path.join(legacy,'B01-1.json'),'utf8'),'old');
});
test('summary identity, duplicate rounds and stale hashes rejected', async t => {
  const {dir} = await fixture(t); assert.equal(cli('summarize.mjs',dir).status,0);
  const campaign = await loadCampaign(dir);
  const summaries = JSON.parse(await readFile(path.join(dir,'summary.json'),'utf8'));
  for (const mutate of [s=>s.pop(),s=>s[0].campaignId='other',s=>s[0].artifactSha256='old',s=>s[1]=s[0]]) {
    const changed = structuredClone(summaries); mutate(changed);
    assert.throws(()=>checkSummary(campaign,changed));
    await writeFile(path.join(dir,'summary.json'),JSON.stringify(changed));
    assert.notEqual(cli('validate.mjs',dir).status,0);
  }
});
test('reporter seals only nine unique passing tests from one invocation', async t => {
  const {dir} = await fixture(t,{complete:false});
  const previous = process.env.F20_OUTPUT; process.env.F20_OUTPUT=dir;
  t.after(()=>{ if (previous===undefined) delete process.env.F20_OUTPUT; else process.env.F20_OUTPUT=previous; });
  for (const entries of [rounds.slice(0,1),[...rounds,rounds[0]]]) {
    const reporter = new CampaignReporter();
    entries.forEach(r=>reporter.onTestEnd({title:`${r.scenario} round ${r.repetition}`},{status:'passed'}));
    await reporter.onEnd({status:'passed'});
    await assert.rejects(loadCampaign(dir),/incomplete/);
  }
  const failed = new CampaignReporter();
  rounds.forEach(r=>failed.onTestEnd({title:`${r.scenario} round ${r.repetition}`},{status:'passed'}));
  await failed.onEnd({status:'failed'}); await assert.rejects(loadCampaign(dir),/incomplete/);
  const reporter = new CampaignReporter();
  rounds.forEach(r=>reporter.onTestEnd({title:`${r.scenario} round ${r.repetition}`},{status:'passed'}));
  await reporter.onEnd({status:'passed'}); await loadCampaign(dir);
});

test('Playwright setup propagates identity to workers and reporter; filtered runs stay incomplete', async t => {
  const { dir: templates } = await fixture(t);
  const parent = path.dirname(templates), testDir = path.join(parent,'tests');
  await mkdir(testDir);
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const playwright = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'index.mjs');
  const config = path.join(parent,'playwright.config.mjs');
  await writeFile(config, `import { defineConfig } from ${JSON.stringify(playwright)};
export default defineConfig({testDir:${JSON.stringify(testDir)},workers:1,
outputDir:${JSON.stringify(path.join(parent,'output'))},
globalSetup:${JSON.stringify(path.join(scripts,'campaign-setup.mjs'))},
reporter:[[${JSON.stringify(path.join(scripts,'campaign-reporter.mjs'))}]]});`);
  await writeFile(path.join(testDir,'simulated.spec.mjs'), `
import { test } from ${JSON.stringify(playwright)};
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
for (const round of ${JSON.stringify(rounds)}) test(round.scenario+' round '+round.repetition,async()=>{
 const r=JSON.parse(await readFile(path.join(${JSON.stringify(templates)},round.file),'utf8'));
 if (!process.env.F20_CAMPAIGN_ID) throw new Error('missing identity in worker');
 r.campaignId=process.env.F20_CAMPAIGN_ID;
 await writeFile(path.join(process.env.F20_OUTPUT,round.file),JSON.stringify(r),{flag:'wx'});
});`);
  const run = (dir, extra=[]) => spawnSync(process.execPath,[require.resolve('@playwright/test/cli'),'test','--config',config,...extra],
    { encoding:'utf8',timeout:30000,env:{...process.env,F20_OUTPUT:dir} });
  const complete = path.join(parent,'complete');
  const success = run(complete); assert.equal(success.status,0,success.stderr);
  await loadCampaign(complete);
  const before = await readFile(path.join(complete,'campaign.json'),'utf8');
  assert.notEqual(run(complete).status,0,'second invocation must refuse existing directory');
  assert.equal(await readFile(path.join(complete,'campaign.json'),'utf8'),before);
  const partial = path.join(parent,'partial');
  const filtered = run(partial,['--grep','B01 round 1']); assert.equal(filtered.status,0,filtered.stderr);
  await assert.rejects(loadCampaign(partial),/incomplete/);
  await rejectConsumers(partial);
});
