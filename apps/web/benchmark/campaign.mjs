import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const rounds = ['B01','B02','B03'].flatMap((scenario, index) =>
  [1,2,3].map(repetition => ({ scenario, repetition, viewers: [1,4,9][index], file: `${scenario}-${repetition}.json` })));
const digest = text => createHash('sha256').update(text).digest('hex');

export async function startCampaign(dir) {
  // Atomic ownership of a NEW directory. Never adopt or overwrite old artifacts.
  await mkdir(path.dirname(path.resolve(dir)), { recursive: true });
  await mkdir(dir);
  const manifest = { version: 1, campaignId: randomUUID(), status: 'running', startedUtc: new Date().toISOString() };
  await writeFile(path.join(dir, 'campaign.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  return manifest;
}

export async function loadCampaign(dir, { requireComplete = true } = {}) {
  const manifest = JSON.parse(await readFile(path.join(dir, 'campaign.json'), 'utf8'));
  assert.equal(manifest.version, 1, 'unsupported campaign version');
  assert.match(manifest.campaignId, /^[0-9a-f-]{36}$/i, 'missing campaign identity');
  assert(['running','complete'].includes(manifest.status), 'invalid campaign status');
  if (requireComplete) assert.equal(manifest.status, 'complete', 'campaign is incomplete');
  const names = (await readdir(dir)).filter(name => name.endsWith('.json') && !['campaign.json','summary.json'].includes(name));
  assert.deepEqual(names.sort(), rounds.map(r => r.file).sort(), 'missing, duplicate or unexpected campaign artifacts');
  const artifacts = [];
  for (const round of rounds) {
    const text = await readFile(path.join(dir, round.file), 'utf8');
    const result = JSON.parse(text);
    assert.equal(result.campaignId, manifest.campaignId, `${round.file}: foreign campaign`);
    for (const key of ['scenario','repetition','viewers']) assert.equal(result[key], round[key], `${round.file}: incorrect ${key}`);
    assert.equal(result.participants, round.viewers + 1, `${round.file}: incorrect participants`);
    assert.equal(result.phase, 'complete', `${round.file}: unfinished round`);
    assert.deepEqual(result.errors, [], `${round.file}: round errors`);
    assert.equal(result.normalStopVerified, true, `${round.file}: stop unverified`);
    assert.equal(result.contextsRemaining, 0, `${round.file}: contexts remain`);
    assert.deepEqual(result.contextCloseErrors, [], `${round.file}: cleanup errors`);
    assert.equal(result.cleanup.length, result.participants, `${round.file}: missing cleanup`);
    assert(result.cleanup.every(c => c.unloaded), `${round.file}: unload failed`);
    const sha256 = digest(text);
    if (requireComplete) assert.equal(manifest.artifacts?.[round.file], sha256, `${round.file}: changed artifact`);
    artifacts.push({ ...round, result, sha256 });
  }
  for (const key of ['commit','browser','browserName','playwrightVersion','quality','windowMs','intervalMs','settleMs','source']) {
    assert(artifacts[0].result[key] !== undefined, `missing campaign configuration: ${key}`);
    for (const artifact of artifacts) assert.deepEqual(artifact.result[key], artifacts[0].result[key], `inconsistent campaign configuration: ${key}`);
  }
  return { manifest, artifacts };
}

export async function finishCampaign(dir) {
  const { manifest, artifacts } = await loadCampaign(dir, { requireComplete: false });
  assert.equal(manifest.status, 'running', 'campaign already finished');
  manifest.status = 'complete';
  manifest.completedUtc = new Date().toISOString();
  manifest.artifacts = Object.fromEntries(artifacts.map(a => [a.file, a.sha256]));
  await writeFile(path.join(dir, 'campaign.json'), JSON.stringify(manifest, null, 2));
}

export function checkSummary(campaign, summaries) {
  assert(Array.isArray(summaries) && summaries.length === rounds.length, 'summary must contain nine rounds');
  const seen = new Set();
  for (const summary of summaries) {
    const file = `${summary.scenario}-${summary.repetition}.json`;
    assert(!seen.has(file), 'duplicate summary round'); seen.add(file);
    const artifact = campaign.artifacts.find(a => a.file === file);
    assert(artifact, 'unexpected summary round');
    assert.equal(summary.campaignId, campaign.manifest.campaignId, 'foreign summary campaign');
    assert.equal(summary.artifactSha256, artifact.sha256, 'stale summary artifact');
  }
}
