import { writeFile } from 'node:fs/promises';
import { loadCampaign } from './campaign.mjs';
import { summary } from './metrics.mjs';
const dir = process.argv[2] || '/tmp/screen-f20-results';
const campaign = await loadCampaign(dir);
const results = [];
for (const { result: r, sha256 } of campaign.artifacts) {
  const { scenario, repetition } = r;
  const connections = new Map(), aggregate = [], volumes = [];
  // Baseline tick is excluded from all stable-window summaries.
  for (const sample of r.samples.slice(1)) {
    const outbound = sample.participants[0].connections.flatMap(c => c.rows.filter(row => row.type === 'outbound-rtp'));
    aggregate.push(outbound.length === r.viewers && outbound.every(row => row.measured.bitrateKbps !== null) ? outbound.reduce((sum,row) => sum+row.measured.bitrateKbps,0) : null);
    volumes.push(outbound.length === r.viewers && outbound.every(row => row.measured.bytesDelta !== null) ? outbound.reduce((sum,row) => sum+row.measured.bytesDelta,0) : null);
    for (const p of sample.participants) for (const c of p.connections) {
      if (!c.rows.length) continue;
      const key = `${p.participant}:${c.connection}`;
      if (!connections.has(key)) connections.set(key,{participant:p.participant,connection:c.connection,ssrcs:[],bitrate:[],loss:[],fps:[],rtt:[]});
      const target = connections.get(key);
      const direction = p.participant === 0 ? 'outbound-rtp' : 'inbound-rtp';
      const row = c.rows.find(row => row.type === direction);
      if (!row) continue;
      if (!target.ssrcs.includes(row.ssrc)) target.ssrcs.push(row.ssrc);
      const lossRow = p.participant === 0 ? c.rows.find(remote => remote.type === 'remote-inbound-rtp' && remote.localId === row.id) : row;
      target.bitrate.push(row.measured.bitrateKbps); target.loss.push(lossRow?.measured.lossPercent ?? null);
      target.fps.push(row.measured.fps); target.rtt.push(c.rttMs);
    }
  }
  const peers = [...connections.values()].map(c => ({participant:c.participant,connection:c.connection,ssrcs:c.ssrcs,
    bitrateKbps:summary(c.bitrate),lossPercent:summary(c.loss),fps:summary(c.fps),rttMs:summary(c.rtt)}));
  // RTP SSRC links the sender connection to its receiving participant, no signaling contents needed.
  for (const c of peers.filter(c => c.participant === 0)) c.viewer = peers.find(v => v.participant !== 0 && v.ssrcs.some(s => c.ssrcs.includes(s)))?.participant ?? null;
  results.push({campaignId:campaign.manifest.campaignId,artifactSha256:sha256,scenario,repetition,phase:r.phase,presentation:r.presentation,aggregateKbps:summary(aggregate),mediaBytesSent:volumes.every(Number.isFinite) ? volumes.reduce((a,b)=>a+b,0) : null,peers,
    cleanup:r.cleanup,contextsRemaining:r.contextsRemaining,errors:r.errors});
}
await writeFile(`${dir}/summary.json`,JSON.stringify(results,null,2));
console.log('| Cenário/rodada | Apresentação por espectador (ms) | Upload agregado médio (kbps) | Vídeo enviado (MB decimal) |');
console.log('|---|---|---:|---:|');
for (const r of results) console.log(`| ${r.scenario}/${r.repetition} | ${r.presentation.map(p => `${p.participant}: ${p.observedMs?.toFixed(0) ?? p.status}`).join('; ')} | ${r.aggregateKbps.mean?.toFixed(1) ?? 'ausente'} | ${r.mediaBytesSent === null ? 'ausente' : (r.mediaBytesSent/1e6).toFixed(3)} |`);
console.log('\n| Cenário/rodada | Espectador | Envio / recepção (kbps médios) | FPS codificado / recebido | Perda envio / recepção (%) | RTT emissor / receptor (ms) | Amostras bitrate envio/recepção |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
const fmt = v => v?.mean === null || !v ? 'ausente' : v.mean.toFixed(2);
for (const r of results) for (const receiver of r.peers.filter(p => p.participant !== 0)) {
 const sender = r.peers.find(p => p.participant === 0 && p.viewer === receiver.participant);
 console.log(`| ${r.scenario}/${r.repetition} | ${receiver.participant} | ${fmt(sender?.bitrateKbps)} / ${fmt(receiver.bitrateKbps)} | ${fmt(sender?.fps)} / ${fmt(receiver.fps)} | ${fmt(sender?.lossPercent)} / ${fmt(receiver.lossPercent)} | ${fmt(sender?.rttMs)} / ${fmt(receiver.rttMs)} | ${sender?.bitrateKbps.n ?? 0}/${receiver.bitrateKbps.n} |`);
}
