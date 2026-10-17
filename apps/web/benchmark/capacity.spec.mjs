import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createRequire } from 'node:module';
const playwrightVersion = createRequire(import.meta.url)('@playwright/test/package.json').version;
import { measure } from './metrics.mjs';

const output = process.env.F20_OUTPUT || '/tmp/screen-f20-results';
const windowMs = 15000, intervalMs = 1000, settleMs = 3000;
async function instrument(page) {
  await page.exposeFunction('f20Presented', () => { if (process.env.F20_FORCE_PRESENTATION_TIMEOUT !== '1') page.firstPresentation ??= performance.now(); });
  await page.addInitScript(() => {
    window.f20 = { pcs: [], streams: [], timers: [], requests: [] };
    const Native = RTCPeerConnection;
    window.RTCPeerConnection = class extends Native {
      constructor(config) { super(config); window.f20.pcs.push(this); }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async constraints => {
      window.f20.requests.push(constraints);
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = frame++ % 2 ? '#ff0000' : '#0000ff'; ctx.fillRect(0,0,640,360);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(frame % 600,40,40,40);
      }, 50);
      window.f20.timers.push(timer);
      const stream = canvas.captureStream(20); window.f20.streams.push(stream);
      const track = stream.getVideoTracks()[0], stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      return stream;
    }, configurable: true });
  });
}
async function observe(page) {
  await page.evaluate(async () => {
    const { observeVideoPresentation } = await import('/src/features/room/diagnostics/video-presentation.ts');
    const observed = new WeakSet(); const cleanups = [];
    window.f20.presentationApi = typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
    const scan = () => {
      const ids = new Set(window.f20.pcs.flatMap(pc => pc.getReceivers().map(r => r.track.id)));
      for (const v of document.querySelectorAll('video')) {
        const stream = v.srcObject;
        if (!observed.has(v) && stream?.getVideoTracks().some(t => ids.has(t.id))) {
          observed.add(v); cleanups.push(observeVideoPresentation(v, stream, () => window.f20Presented()));
        }
      }
    };
    const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const timer = setInterval(scan, 20);
    window.f20.stopObserver = () => { observer.disconnect(); clearInterval(timer); cleanups.forEach(fn => fn()); };
    scan();
  });
}
async function snapshot(page) {
  return page.evaluate(async () => Promise.all(window.f20.pcs.map(async (pc, connection) => {
    const reports = await pc.getStats(), rows = [];
    const fields = ['id','type','timestamp','ssrc','localId','bytesSent','bytesReceived','packetsReceived','packetsSent','packetsLost','framesPerSecond','frameWidth','frameHeight','qualityLimitationReason'];
    reports.forEach(r => {
      if (['inbound-rtp','outbound-rtp','remote-inbound-rtp'].includes(r.type) && r.kind === 'video')
        rows.push({ ...Object.fromEntries(fields.filter(k => r[k] !== undefined).map(k => [k,r[k]])), codec: reports.get(r.codecId)?.mimeType ?? null });
    });
    const transports = [...reports.values()].filter(r => r.type === 'transport');
    const pair = transports.map(t => reports.get(t.selectedCandidatePairId)).find(Boolean);
    return { connection, state: pc.connectionState, rows, rttMs: Number.isFinite(pair?.currentRoundTripTime) ? pair.currentRoundTripTime * 1000 : null, rttMissingReason: !pair ? 'no-selected-pair-report' : !Number.isFinite(pair.currentRoundTripTime) ? 'field-not-provided' : null,
      senders: pc.getSenders().filter(s => s.track).map(s => ({ settings: Object.fromEntries(Object.entries(s.track.getSettings()).filter(([key]) => ['width','height','frameRate','aspectRatio','resizeMode'].includes(key))), constraints: s.track.getConstraints(), contentHint: s.track.contentHint, parameters: { encodings: s.getParameters().encodings, degradationPreference: s.getParameters().degradationPreference } })) };
  })));
}
for (const [scenario, viewers] of [['B01',1],['B02',4],['B03',9]]) {
  for (let repetition = 1; repetition <= 3; repetition++) test(`${scenario} round ${repetition}`, async ({ browser }) => {
    const contexts = [], pages = [];
    const result = { campaignId: process.env.F20_CAMPAIGN_ID, scenario, repetition, viewers, participants: viewers + 1, commit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
      browser: browser.version(), browserName: 'chromium', headless: true, playwrightVersion, dateUtc: new Date().toISOString(), environment: { os: os.release(), platform: os.platform(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(), node: process.version, load: os.loadavg() },
      source: { width:640,height:360,fps:20,audio:false,pattern:'alternating red/blue plus moving white square, 50 ms timer' },
      quality: 'default sharpness/balanced/30; requested maximum 1920x1080, 3 Mbps per connection',
      windowMs, intervalMs, settleMs, samples: [], presentation: [], phase: 'setup', errors: [] };
    try {
      for (let i=0;i<=viewers;i++) {
        const context = await browser.newContext(); contexts.push(context);
        const page = await context.newPage(); pages.push(page); await instrument(page);
        await page.goto(`/room/f20-${scenario}-${repetition}-${process.pid}`);
        await expect(page.getByText('Conectado',{exact:true})).toBeVisible();
        if (i) await observe(page);
      }
      const host = pages[0];
      await expect(host.getByRole('button',{name:`Ver participantes (${viewers+1})`,exact:true}).first()).toBeVisible();
      await host.getByRole('button',{name:'Compartilhar tela',exact:true}).last().click();
      result.phase = 'publication';
      const publication = performance.now();
      await host.getByRole('button',{name:'Entrar ao vivo',exact:true}).click();
      for (let i=1;i<pages.length;i++) {
        const api = await pages[i].evaluate(() => window.f20.presentationApi);
        let status = api ? 'presented' : 'api-unavailable';
        if (api) { try { await expect.poll(() => pages[i].firstPresentation, {timeout:15000}).toBeTruthy(); } catch { status = 'timeout'; } }
        result.presentation.push({ participant:i,status, observedMs: status === 'presented' ? pages[i].firstPresentation - publication : null });
      }
      if (result.presentation.some(p => p.status !== 'presented')) throw new Error('presentation not confirmed');
      result.establishmentMs = performance.now() - publication;
      await new Promise(r => setTimeout(r,settleMs));
      result.phase = 'sampling';
      const start = performance.now(); let previous = new Map();
      for (let tick=0;tick<=windowMs/intervalMs;tick++) {
        await new Promise(r => setTimeout(r,Math.max(0,start+tick*intervalMs-performance.now())));
        const peers = await Promise.all(pages.map(snapshot)); const current = new Map();
        const sample = { tick, elapsedMs:performance.now()-start, participants:peers.map((connections,participant) => ({ participant,connections:connections.map(c => ({ ...c, rows:c.rows.map(row => {
          const key = `${participant}:${c.connection}:${row.id}`; current.set(key,row);
          return { ...row, measured:measure(row,previous.get(key)) };
        }) })) })) };
        result.samples.push(sample); previous = current;
      }
      result.phase = 'stop';
      await host.getByRole('button',{name:'Parar compartilhamento de tela',exact:true}).click();
      for (const page of pages.slice(1)) await expect(page.locator('video')).toHaveCount(0);
      await expect.poll(() => host.evaluate(() => window.f20.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) && window.f20.pcs.every(pc => pc.getSenders().every(s => !s.track)))).toBe(true);
      result.normalStopVerified = true;
      result.captureRequests = await host.evaluate(() => window.f20.requests);
      result.phase = 'complete';
    } catch(error) { result.errors.push({phase:result.phase,message:error.message.split('\n')[0]}); throw error; }
    finally {
      if (result.errors.length) result.failureDiagnostics = await Promise.all(pages.map(page => snapshot(page).catch(() => null)));
      result.cleanup = [];
      for (const page of pages) {
        try {
          await page.evaluate(() => window.f20?.stopObserver?.());
          await page.goto('about:blank');
          result.cleanup.push({ unloaded:true });
        } catch { result.cleanup.push({unloaded:false}); }
      }
      const closed = await Promise.allSettled(contexts.map(context => context.close()));
      result.contextCloseErrors = closed.filter(item => item.status === 'rejected').map(() => 'context-close-failed');
      result.contextsRemaining = browser.contexts().length;
      await mkdir(output,{recursive:true});
      await writeFile(`${output}/${scenario}-${repetition}.json`,JSON.stringify(result,null,2), { flag: 'wx' });
      if (result.contextsRemaining || result.contextCloseErrors.length || result.cleanup.some(c => !c.unloaded)) throw new Error('benchmark cleanup failed; inspect artifact');
    }
  });
}
