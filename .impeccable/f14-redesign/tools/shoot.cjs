// Captura os protótipos em navegador real. Uso: node shoot.cjs <a|b> [estado,estado] [desktop|mobile|tablet|narrow]
const { createRequire } = require('node:module');
const req = createRequire('/home/aldobmigge/Dev/projects/webrtc-shared/apps/web/package.json');
const { chromium } = req('@playwright/test');
const fs = require('node:fs'); const path = require('node:path');
const base = path.resolve(__dirname, '..'); const root = path.join(base, 'prototypes');
const concept = process.argv[2] || 'a';
const STATES = (process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : ['streams-empty', 'streams-live', 'pick', 'pick-busy', 'pick-error', 'invite', 'play-h', 'play-v', 'view-h', 'view-v', 'offer', 'transfer', 'blocked', 'people', 'away', 'away-spec', 'full-h', 'full-v', 'chat']);
const DEV = { desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, tablet: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, hasTouch: true }, narrow: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } };
const devices = (process.argv[4] || 'desktop,mobile').split(',');
(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const d of devices) {
    const out = path.join(base, 'shots', concept, d); fs.mkdirSync(out, { recursive: true });
    const ctx = await browser.newContext(DEV[d]); const page = await ctx.newPage();
    page.on('pageerror', e => report.push(`${d} pageerror: ${e.message}`)); page.on('console', m => { if (m.type() === 'error') report.push(`${d} console: ${m.text()}`); });
    for (const s of STATES) {
      await page.goto(`file://${root}/${concept}.html?s=${s}&static=1`); await page.waitForTimeout(150);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bad: [...document.querySelectorAll('button,a.btn,.btn,.seg,.iconbtn')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 36 || r.width < 36) && getComputedStyle(e).display !== 'none'; }).length }));
      if (o.sw > o.iw) report.push(`${d}/${s}: OVERFLOW ${o.sw}>${o.iw}`);
      await page.screenshot({ path: path.join(out, `${s}.png`) });
    }
    await ctx.close();
  }
  await browser.close(); console.log(report.join('\n') || 'sem erros'); 
})();
