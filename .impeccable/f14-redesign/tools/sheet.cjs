// Gera folhas de contato (contact sheets) a partir das capturas. Uso: node sheet.cjs <a|b> <desktop|mobile> [estados]
const { createRequire } = require('node:module');
const req = createRequire('/home/aldobmigge/Dev/projects/webrtc-shared/apps/web/package.json');
const { chromium } = req('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const base = path.resolve(__dirname, '..');
const [concept, dev, only] = [process.argv[2], process.argv[3] || 'desktop', process.argv[4]];
const LABEL = { 'streams-empty': 'Transmissões · sala vazia', 'streams-live': 'Transmissões · com transmissão', 'pick': 'Escolher vídeo', 'pick-busy': 'Preparando vídeo', 'pick-error': 'Arquivo acima do limite', 'invite': 'Controlador · convites/transferência', 'play-h': 'Controlador · horizontal', 'play-v': 'Controlador · vertical', 'view-h': 'Espectador · horizontal', 'view-v': 'Espectador · vertical', 'offer': 'Espectador · convite', 'transfer': 'Espectador · recebendo', 'blocked': 'Espectador · bloqueado', 'people': 'Participantes', 'away': 'Sessão ativa · volta às transmissões', 'away-spec': 'Sessão ativa · volta (espectador)', 'full-h': 'Tela cheia · horizontal', 'full-v': 'Tela cheia · vertical', 'chat': 'Chat aberto' };
const dir = path.join(base, 'shots', concept, dev);
let files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
const order = Object.keys(LABEL); files.sort((a, b) => order.indexOf(a) - order.indexOf(b));
if (only) files = only.split(',');
const cols = dev === 'desktop' ? 2 : 5; const w = dev === 'desktop' ? 760 : 250;
const html = `<body style="margin:0;background:#0b0e14;font:600 13px system-ui;color:#e6edf3"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:18px;padding:18px;width:max-content">${files.map(f => `<figure style="margin:0"><figcaption style="padding:0 0 8px;color:#a6b1bf">${LABEL[f] || f}</figcaption><img src="file://${dir}/${f}.png" style="width:${w}px;display:block;border:1px solid #30363d;border-radius:6px"></figure>`).join('')}</div></body>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols * (w + 18) + 18, height: 800 } });
  const hf = path.join(base, 'sheets', `_${concept}-${dev}.html`); fs.mkdirSync(path.dirname(hf), { recursive: true }); fs.writeFileSync(hf, html); await p.goto('file://' + hf); await p.waitForTimeout(500);
  const out = path.join(base, 'sheets'); fs.mkdirSync(out, { recursive: true });
  await p.screenshot({ path: path.join(out, `${concept}-${dev}${only ? '-' + only.replace(/,/g, '_') : ''}.png`), fullPage: true });
  await b.close(); console.log('ok');
})();
