// Captura temporária da interface REAL (HEAD 0011277) para o diagnóstico F14. Não altera o repositório.
const { createRequire } = require('node:module');
const req = createRequire('/home/aldobmigge/Dev/projects/webrtc-shared/apps/web/package.json');
const { chromium } = req('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const out = path.resolve(__dirname, '../diagnosis'); fs.mkdirSync(out, { recursive: true });
const BASE = 'http://127.0.0.1:4311';
const fake = () => {
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d'); let f = 0;
    setInterval(() => { x.fillStyle = '#0d1117'; x.fillRect(0, 0, 1280, 720); x.fillStyle = '#161b22'; x.fillRect(0, 0, 1280, 56); x.fillStyle = '#8c959f'; x.font = '24px monospace'; x.fillText('Screen Room / peer-manager.ts', 28, 36);
      ['export async function shareScreen() {', '  const stream = await captureDisplay();', '  await peers.attachTracks(stream);', '}'].forEach((l, i) => { x.fillStyle = '#79c0ff'; x.fillText(l, 40, 130 + i * 40); }); x.fillStyle = '#7ee787'; x.fillText('$ pnpm test  ✓ passed ' + (f++), 28, 420); }, 100);
    return c.captureStream(15); } });
};
const video = async (page) => Buffer.from(await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); let f = 0;
  const d = setInterval(() => { x.fillStyle = f++ % 2 ? '#164e63' : '#1e3a5f'; x.fillRect(0, 0, 320, 180); x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.textAlign = 'center'; x.fillText('Watch Party', 160, 90); }, 50);
  const s = c.captureStream(20); const r = new MediaRecorder(s, { mimeType: 'video/webm;codecs=vp8' }); const ch = []; r.ondataavailable = e => ch.push(e.data);
  const ended = new Promise(res => r.onstop = res); r.start(); await new Promise(res => setTimeout(res, 4000)); r.stop(); await ended; clearInterval(d);
  return [...new Uint8Array(await new Blob(ch).arrayBuffer())]; }));
const withDuration = (bytes) => { const info = bytes.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66])); const start = info + 4; let w = 1; while (!(bytes[start] & (0x80 >> (w - 1)))) w++;
  let size = bytes[start] & ((1 << (8 - w)) - 1); for (let i = 1; i < w; i++) size = size * 256 + bytes[start + i];
  const dur = Buffer.alloc(11); dur.set([0x44, 0x89, 0x88]); dur.writeDoubleBE(4000, 3); const sb = Buffer.alloc(w); let n = size + dur.length; for (let i = w - 1; i >= 0; i--) { sb[i] = n & 255; n = Math.floor(n / 256); } sb[0] |= 0x80 >> (w - 1);
  return Buffer.concat([bytes.subarray(0, start), sb, bytes.subarray(start + w, start + w + size), dur, bytes.subarray(start + w + size)]); };
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const roomId = await new Promise((resolve, reject) => { const { WebSocket } = req('ws'); const ws = new WebSocket('ws://127.0.0.1:4310/signal'); ws.on('open', () => ws.send(JSON.stringify({ type: 'create-room' }))); ws.on('message', m => { const j = JSON.parse(m.toString()); ws.close(); j.type === 'room-created' ? resolve(j.roomId) : reject(new Error(j.message)); }); ws.on('error', reject); });
  const ha = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const hb = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const a = await ha.newPage(), b = await hb.newPage(); await a.addInitScript(fake);
  await a.goto(`${BASE}/room/${roomId}?name=Rafael`); await b.goto(`${BASE}/room/${roomId}?name=Marina`);
  await a.waitForTimeout(2500);
  const shot = async (p, n) => p.screenshot({ path: `${out}/${n}.png`, animations: 'disabled' });
  await shot(a, '01-stage-empty-desktop'); await shot(b, '02-stage-empty-mobile');
  await a.getByRole('button', { name: /^Compartilhar/ }).first().click(); await a.getByRole('button', { name: 'Entrar ao vivo' }).click(); await a.waitForTimeout(4000);
  await shot(a, '03-stage-sharing-desktop'); await shot(b, '04-stage-viewer-mobile');
  await a.getByRole('button', { name: /^Watch Party/ }).first().click(); await a.waitForTimeout(500);
  await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Uma viagem pela costa.webm', mimeType: 'video/webm', buffer: withDuration(await video(a)) });
  await a.waitForTimeout(2500); await shot(a, '05-watch-controller-desktop');
  await b.getByRole('button', { name: /^Watch Party/ }).first().click().catch(() => {}); await b.waitForTimeout(800); await shot(b, '06-watch-guest-invite-mobile');
  await a.getByRole('button', { name: /Voltar às transmiss/ }).first().click(); await a.waitForTimeout(800); await shot(a, '07-return-to-streams-desktop');
  await b.getByRole('button', { name: 'Aceitar vídeo', exact: true }).tap().catch(() => {}); await b.waitForTimeout(2500); await shot(b, '08-watch-guest-mobile');
  await b.getByRole('button', { name: /Voltar às transmiss/ }).first().click().catch(() => {}); await b.waitForTimeout(800); await shot(b, '09-return-to-streams-mobile');
  await browser.close(); console.log('ok', roomId);
})().catch(e => { console.error(e); process.exit(1); });
