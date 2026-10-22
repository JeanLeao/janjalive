import { gotoRoom } from './fixtures/rooms';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// F29 — Seguir apresentador. Capture is synthetic (canvas); permissions, real audio and STUN/TURN are not covered.

async function open(browser: Browser, room: string, name: string, viewport?: { width: number; height: number }, hasTouch = false) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript((nickname) => {
    sessionStorage.setItem('screen_room_display_name', nickname);
    (window as any).testSockets = [];
    (window as any).testSelections = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      override send(data: Parameters<WebSocket['send']>[0]) {
        if (typeof data === 'string') {
          try {
            const m = JSON.parse(data);
            if (m.type === 'join') (window as any).testPeerId = m.peerId;
            if (m.type === 'select-stage') (window as any).testSelections.push({ target: m.targetPeerId, at: performance.now() });
          } catch {}
        }
        super.send(data);
      }
      constructor(url: string | URL, protocols?: string | string[]) { if ((window as any).blockSignal && String(url).includes('/signal')) throw new Error('test: reconnection held'); super(url, protocols); (window as any).testSockets.push(this); this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.type === 'peer-joined') (window as any).testJoins = ((window as any).testJoins || 0) + 1; } catch {} }); }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        if ((window as any).testCaptureGate) await (window as any).testCaptureGate;
        const canvas = document.createElement('canvas');
        const isDashboard = nickname === 'Bia' || nickname === 'Clara';
        canvas.width = nickname === 'Clara' ? 960 : nickname === 'Bia' ? 1024 : 1280;
        canvas.height = nickname === 'Clara' ? 720 : nickname === 'Bia' ? 640 : 720;
        const ctx = canvas.getContext('2d')!;
        let frame = 0;
        const draw = () => {
          const w = canvas.width, h = canvas.height;
          frame++;
          if (isDashboard) {
            ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, 46);
            ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 16px system-ui, sans-serif';
            ctx.fillText(`${nickname} · Janjalive Analytics (${w}×${h})`, 20, 29);
            ctx.fillStyle = '#94a3b8'; ctx.font = '13px system-ui, sans-serif';
            ctx.fillText('https://app.janjalive.dev/metrics/mesh-p2p', 480, 29);
            const cards = [
              ['Bitrate de saída', '2.84 Mbps', '#22c55e'],
              ['Quadros / seg', '30 fps', '#38bdf8'],
              ['RTT médio (ICE)', '18 ms', '#a78bfa'],
              ['Perda de pacotes', '0.02%', '#f59e0b'],
            ];
            cards.forEach(([label, val, col], idx) => {
              const cx = 20 + idx * 230, cy = 68;
              ctx.fillStyle = '#1e293b'; ctx.fillRect(cx, cy, 214, 96);
              ctx.strokeStyle = '#334155'; ctx.strokeRect(cx, cy, 214, 96);
              ctx.fillStyle = '#94a3b8'; ctx.font = '13px system-ui, sans-serif'; ctx.fillText(label, cx + 14, cy + 28);
              ctx.fillStyle = col; ctx.font = 'bold 26px monospace'; ctx.fillText(val, cx + 14, cy + 68);
            });
            ctx.fillStyle = '#1e293b'; ctx.fillRect(20, 184, 580, 320); ctx.strokeRect(20, 184, 580, 320);
            ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 15px system-ui, sans-serif';
            ctx.fillText('Estabilidade de banda e jitter por par conectado', 38, 214);
            for (let i = 0; i < 12; i++) {
              const bh = 70 + ((i * 37 + frame) % 140);
              ctx.fillStyle = i % 3 === 0 ? '#38bdf8' : '#6366f1';
              ctx.fillRect(42 + i * 44, 476 - bh, 28, bh);
            }
            ctx.fillStyle = '#1e293b'; ctx.fillRect(620, 184, w - 640, 320); ctx.strokeRect(620, 184, w - 640, 320);
            ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 15px system-ui, sans-serif';
            ctx.fillText('Topologia da sala', 638, 214);
            ctx.font = '13px monospace'; ctx.fillStyle = '#cbd5e1';
            ['• host-ana   1080p  ativo', '• peer-bia    720p  ativo', '• peer-clara  600p  ativo', '• viewer-01  recebendo', '• viewer-02  recebendo'].forEach((line, i) => {
              ctx.fillText(line, 638, 254 + i * 34);
            });
            ctx.fillStyle = '#1e293b'; ctx.fillRect(20, 522, w - 40, h - 542); ctx.strokeRect(20, 522, w - 40, h - 542);
            ctx.fillStyle = '#94a3b8'; ctx.font = '13px monospace';
            ctx.fillText('[ICE] Selected candidate pair: host -> srflx (udp) · DTLS connected', 38, 554);
            ctx.fillText('[QoS] Maintain-resolution active · targetBitrate=2800kbps · audio=opus/48kHz', 38, 584);
            ctx.fillText(`[SYNC] Frame heartbeat #${frame} · primary & secondary streams nominal`, 38, 614);
          } else {
            ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#161b22'; ctx.fillRect(0, 0, w, 38);
            ctx.fillStyle = '#f85149'; ctx.beginPath(); ctx.arc(20, 19, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#d29922'; ctx.beginPath(); ctx.arc(40, 19, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#3fb950'; ctx.beginPath(); ctx.arc(60, 19, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#c9d1d9'; ctx.font = '13px monospace';
            ctx.fillText(`${nickname} — VS Code · packages/protocol/src/messages.ts (${w}×${h})`, 92, 24);
            ctx.fillStyle = '#121820'; ctx.fillRect(0, 38, 210, h - 66);
            ctx.fillStyle = '#8b949e'; ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillText('EXPLORER', 18, 66);
            ctx.font = '13px monospace';
            ['▾ apps/web/src', '  ▾ features/room', '    • RoomStage.tsx', '    • PeerManager.ts', '    • useRoomSession.ts', '▾ apps/signaling', '    • room-state.ts', '    • server.ts'].forEach((item, idx) => {
              ctx.fillStyle = item.includes('RoomStage') ? '#58a6ff' : '#8b949e';
              ctx.fillText(item, 16, 96 + idx * 26);
            });
            const codeLines = [
              ['01', '#ff7b72', 'export function ', '#d2a8ff', 'syncStageComparison', '#c9d1d9', '(streams: StreamItem[]) {'],
              ['02', '#8b949e', '  // Mantém seleção secundária estritamente local (F22)', '', '', '', ''],
              ['03', '#ff7b72', '  const ', '#79c0ff', 'primary ', '#c9d1d9', '= streams.find(s => s.id === featuredId) ?? streams[0];'],
              ['04', '#ff7b72', '  const ', '#79c0ff', 'secondary ', '#c9d1d9', '= streams.find(s => s.id === secondaryId && s.id !== primary.id);'],
              ['05', '#ff7b72', '  if ', '#c9d1d9', '(!secondary) ', '#ff7b72', 'return { comparing: false, primary };'],
              ['06', '#ff7b72', '  return ', '#c9d1d9', '{ comparing: true, primary, secondary, mutedSecondary: true };'],
              ['07', '#c9d1d9', '}', '', '', '', ''],
              ['08', '#8b949e', '// Terminal — pnpm --filter @screen-room/web test:e2e', '', '', '', ''],
              ['09', '#3fb950', '✓ ', '#c9d1d9', 'F22 simultaneous comparison preserves primary audio & zoom', '', ''],
              ['10', '#3fb950', '✓ ', '#c9d1d9', `Frame tick #${frame} · 0 dropped packets · ICE connected`, '', ''],
            ];
            ctx.font = '15px monospace';
            codeLines.forEach(([ln, c1, t1, c2, t2, c3, t3], idx) => {
              const y = 84 + idx * 36;
              ctx.fillStyle = '#484f58'; ctx.fillText(ln, 230, y);
              let x = 268;
              for (const [col, txt] of [[c1, t1], [c2, t2], [c3, t3]]) {
                if (!txt) continue;
                ctx.fillStyle = col; ctx.fillText(txt, x, y);
                x += ctx.measureText(txt).width;
              }
            });
            ctx.fillStyle = '#161b22'; ctx.fillRect(210, h - 180, w - 210, 152);
            ctx.strokeStyle = '#30363d'; ctx.strokeRect(210, h - 180, w - 210, 152);
            ctx.fillStyle = '#58a6ff'; ctx.font = 'bold 12px monospace';
            ctx.fillText('TERMINAL · zsh — node v22.23.3', 230, h - 154);
            ctx.fillStyle = '#7ee787'; ctx.font = '13px monospace';
            ctx.fillText('$ pnpm typecheck && pnpm test', 230, h - 124);
            ctx.fillStyle = '#c9d1d9';
            ctx.fillText('Packages: +3  |  Tests: 237 passed (237)  |  Status: READY', 230, h - 96);
            ctx.fillStyle = '#1f6feb'; ctx.fillRect(0, h - 28, w, 28);
            ctx.fillStyle = '#ffffff'; ctx.font = '12px monospace';
            ctx.fillText(` feat/f22-simultaneous-view  •  UTF-8  •  TypeScript JSX  •  Ln 42, Col 18 `, 16, h - 10);
          }
        };
        draw();
        const timer = setInterval(draw, 80);
        const stream = canvas.captureStream(20);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        return stream;
      },
    });
  }, name);
  await gotoRoom(page, `/room/${room}`);
  // Viewers only need an authenticated room session; capture controls are checked by startLive.
  await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ver participantes/ }).first()).toBeVisible();
  return { context, page };
}

async function startLive(page: Page) {
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
}

const stageBadge = (page: Page, name: string, state = 'Transmitindo') => page.getByText(`${name} · ${state}`, { exact: true });
const card = (page: Page, name: string) => page.getByRole('button', { name: `Destacar transmissão de ${name}`, exact: true });
const follow = (page: Page, name: string) => page.getByRole('button', { name: `Acompanhar escolhas de ${name}`, exact: true });
const status = (page: Page) => page.locator('[data-follow-status]');
async function drawer(page: Page) {
  if (!await page.getByRole('button', { name: 'Fechar lista de participantes' }).isVisible())
    await page.getByRole('button', { name: /^Ver participantes/ }).first().click();
  await expect.poll(async () => {
    const box = await page.locator('.mantine-Drawer-content').boundingBox();
    return Boolean(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width + 1);
  }).toBe(true);
}
async function closeDrawer(page: Page) {
  await page.getByRole('button', { name: 'Fechar lista de participantes' }).click();
  await expect(page.getByRole('button', { name: 'Fechar lista de participantes' })).toBeHidden();
}
async function chooseFollow(page: Page, name: string) {
  await drawer(page); await follow(page, name).click(); await closeDrawer(page);
}
async function closeAll(contexts: BrowserContext[]) { await Promise.all(contexts.map(context => context.close())); }
async function drop(page: Page) {
  await page.evaluate(() => {
    (window as any).blockSignal = true;
    ((window as any).testSockets as WebSocket[]).filter(s => s.url.includes('/signal')).forEach(s => s.close(4001, 'test drop'));
  });
}
async function reconnect(page: Page) {
  await page.evaluate(() => { (window as any).blockSignal = false; });
}

test('F29 automatic manual choices, independent followers, late join, suspension, resume and no relay chain', async ({ browser }) => {
  const room = `f29-auto-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia');
  const vera = await open(browser, room, 'Vera'), vitor = await open(browser, room, 'Vitor'), vilma = await open(browser, room, 'Vilma');
  const contexts = [ana, bia, vera, vitor, vilma].map(p => p.context);
  try {
    await startLive(ana.page);
    await expect(stageBadge(bia.page, 'Ana')).toBeVisible();
    await startLive(bia.page);
    await chooseFollow(vera.page, 'Ana'); await chooseFollow(vitor.page, 'Bia');
    await card(vilma.page, 'Bia').click();
    // Bia starts on Ana; the snapshot captures that choice when publishing.
    await expect(stageBadge(vitor.page, 'Ana')).toBeVisible();
    await card(ana.page, 'Bia').click();
    await expect(stageBadge(vera.page, 'Bia')).toBeVisible();
    await expect(stageBadge(vitor.page, 'Ana')).toBeVisible();
    await expect(stageBadge(vilma.page, 'Bia')).toBeVisible();
    const late = await open(browser, room, 'Lia'); contexts.push(late.context);
    await chooseFollow(late.page, 'Ana');
    await expect(stageBadge(late.page, 'Bia')).toBeVisible();
    // Bia follows Ana while Vitor follows Bia: received changes must not propagate.
    await chooseFollow(bia.page, 'Ana');
    await card(ana.page, 'Ana (você)').click();
    await expect(stageBadge(vera.page, 'Ana')).toBeVisible();
    await expect(stageBadge(vitor.page, 'Ana')).toBeVisible();
    await card(ana.page, 'Bia').click();
    await expect(stageBadge(vera.page, 'Bia')).toBeVisible();
    await expect(stageBadge(vitor.page, 'Ana')).toBeVisible();
    // Manual control suspends; updates keep arriving for resume.
    await card(vera.page, 'Ana').click();
    await drawer(vera.page); await expect(status(vera.page)).toHaveText('Acompanhamento suspenso');
    await vera.page.getByRole('button', { name: 'Retomar', exact: true }).click();
    await closeDrawer(vera.page); await expect(stageBadge(vera.page, 'Bia')).toBeVisible();
    await chooseFollow(vera.page, 'Bia');
    await expect(stageBadge(vera.page, 'Ana')).toBeVisible();
    await drawer(vera.page); await vera.page.getByRole('button', { name: 'Parar de seguir', exact: true }).click();
    await expect(status(vera.page)).toHaveCount(0); await closeDrawer(vera.page);
    await expect(vera.page.getByText('Indicar aos seguidores', { exact: true })).toHaveCount(0);
  } finally { await closeAll(contexts); }
});

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 375, height: 700 }, true], ['mobile-320', { width: 320, height: 700 }, true]] as const) {
  test(`F29 participants drawer, relevant states and visual evidence (${label})`, async ({ browser }) => {
    const room = `f29-drawer-${label}-${Date.now()}`;
    const ana = await open(browser, room, 'Ana', viewport, touch);
    const contexts = [ana.context];
    const capture = async (page: Page, state: string) => {
      await expect(page.getByText(/(entrou|saiu) da sala/)).toBeHidden();
      await page.screenshot({ path: test.info().outputPath(`${label}-${state}.png`), animations: 'disabled' });
      await test.info().attach(`${label}-${state}`, { path: test.info().outputPath(`${label}-${state}.png`), contentType: 'image/png' });
    };
    try {
      await capture(ana.page, 'alone');
      await drawer(ana.page); await expect(follow(ana.page, 'Ana')).toHaveCount(0); await closeDrawer(ana.page);
      const bia = await open(browser, room, 'Bia', viewport, touch), viewer = await open(browser, room, 'Vera', viewport, touch);
      contexts.push(bia.context, viewer.context);
      await startLive(ana.page); await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
      await drawer(viewer.page); await expect(viewer.page.getByRole('button', { name: /^Acompanhar escolhas/ })).toHaveCount(0);
      await capture(viewer.page, 'single-drawer'); await closeDrawer(viewer.page); await capture(viewer.page, 'single');
      await startLive(bia.page); await expect(card(viewer.page, 'Bia')).toBeVisible();
      await capture(viewer.page, 'multiple'); await drawer(viewer.page);
      const action = follow(viewer.page, 'Ana'); await expect(action).toBeVisible();
      const bounds = (await action.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      if (touch) await action.tap(); else { await action.focus(); await viewer.page.keyboard.press('Enter'); }
      await expect(status(viewer.page)).toHaveText('Acompanhando escolhas'); await capture(viewer.page, 'active');
      await closeDrawer(viewer.page); await card(ana.page, 'Bia').click();
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
      await card(viewer.page, 'Ana').click(); await drawer(viewer.page);
      await expect(status(viewer.page)).toHaveText('Acompanhamento suspenso'); await capture(viewer.page, 'suspended');
      const resume = viewer.page.getByRole('button', { name: 'Retomar', exact: true });
      if (touch) await resume.tap(); else { await resume.focus(); await viewer.page.keyboard.press('Space'); }
      await closeDrawer(viewer.page); await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
      await bia.page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(stageBadge(viewer.page, 'Bia', 'Pausado')).toBeVisible();
      await bia.page.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await bia.page.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
      await viewer.page.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
      await viewer.page.getByRole('button', { name: 'Restaurar enquadramento', exact: true }).click();
      await viewer.page.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await capture(viewer.page, 'cinema');
      await viewer.page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => viewer.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      await capture(viewer.page, 'fullscreen');
      await viewer.page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      await viewer.page.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();
      await drop(ana.page); await drawer(viewer.page);
      await expect(status(viewer.page)).toHaveText('Aguardando reconexão'); await capture(viewer.page, 'reconnecting');
      await reconnect(ana.page); await expect(status(viewer.page)).toHaveText('Acompanhando escolhas', { timeout: 15000 });
      await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(status(viewer.page)).toHaveText('Transmissão indisponível'); await capture(viewer.page, 'unavailable');
      await expect(viewer.page.getByRole('button', { name: /^Acompanhar escolhas/ })).toHaveCount(0);
      const stop = viewer.page.getByRole('button', { name: 'Parar de seguir', exact: true });
      if (touch) await stop.tap(); else { await stop.focus(); await viewer.page.keyboard.press('Enter'); }
      await expect(status(viewer.page)).toHaveCount(0);
    } finally { await closeAll(contexts); }
  });
}

test('F29 reconnect preserves manual suspension and invalidates an ended target in the reservation', async ({ browser }) => {
  const room = `f29-recovery-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia'), viewer = await open(browser, room, 'Vera');
  try {
    await startLive(ana.page);
    await expect(stageBadge(bia.page, 'Ana')).toBeVisible();
    await startLive(bia.page);
    await card(ana.page, 'Bia').click(); await chooseFollow(viewer.page, 'Ana');
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    await card(viewer.page, 'Ana').click();
    await drop(ana.page); await drawer(viewer.page);
    await expect(status(viewer.page)).toHaveText('Aguardando reconexão');
    await reconnect(ana.page);
    await expect(status(viewer.page)).toHaveText('Acompanhamento suspenso', { timeout: 15000 });
    await viewer.page.getByRole('button', { name: 'Retomar', exact: true }).click(); await closeDrawer(viewer.page);
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    await drop(viewer.page); await drawer(viewer.page);
    await expect(status(viewer.page)).toHaveText('Aguardando reconexão');
    await reconnect(viewer.page);
    await expect(status(viewer.page)).toHaveText('Acompanhando escolhas', { timeout: 15000 });
    if (await viewer.page.getByRole('alert').isVisible()) await viewer.page.getByRole('alert').getByRole('button').click();
    await closeDrawer(viewer.page);
    await drop(ana.page); await drawer(viewer.page);
    await expect(status(viewer.page)).toHaveText('Aguardando reconexão');
    await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await startLive(bia.page);
    await reconnect(ana.page);
    await expect(status(viewer.page)).toHaveText('Acompanhando escolhas', { timeout: 15000 });
    await closeDrawer(viewer.page); await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
    if (await ana.page.getByRole('alert').isVisible()) await ana.page.getByRole('alert').getByRole('button').click();
    await ana.page.getByRole('button', { name: 'Sair da sala', exact: true }).first().click();
    await drawer(viewer.page); await expect(status(viewer.page)).toHaveCount(0);
  } finally { await closeAll([ana.context, bia.context, viewer.context]); }
});

test('F29 manual choices during pending F27 and pause are synchronized without publishing fallback', async ({ browser }) => {
  const room = `f29-pending-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia'), viewer = await open(browser, room, 'Vera');
  try {
    await startLive(ana.page); await expect(stageBadge(bia.page, 'Ana')).toBeVisible(); await startLive(bia.page);
    await chooseFollow(viewer.page, 'Ana');
    await ana.page.evaluate(() => { (window as any).testCaptureGate = new Promise(resolve => { (window as any).releaseCapture = resolve; }); });
    await ana.page.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    // The existing capture is still announced and the stage remains usable while permission is pending.
    await card(ana.page, 'Bia').click(); await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    await ana.page.evaluate(() => { (window as any).releaseCapture(); (window as any).testCaptureGate = null; });
    await ana.page.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    await ana.page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await card(ana.page, 'Ana (você)').click(); await expect(stageBadge(viewer.page, 'Ana', 'Pausado')).toBeVisible();
    // Ending the target clears the choice; the fallback is not a new presenter selection.
    await ana.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await drawer(viewer.page); await expect(status(viewer.page)).toHaveText('Transmissão indisponível');
  } finally { await closeAll([ana.context, bia.context, viewer.context]); }
});

for (const [label, viewport, hasTouch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile-320', { width: 320, height: 700 }, true]] as const) {
  test(`F29 rapid manual choices converge after the server budget is saturated (${label})`, async ({ browser }) => {
    const room = `f29-burst-${label}-${Date.now()}`;
    const ana = await open(browser, room, 'Ana', viewport, hasTouch);
    const bia = await open(browser, room, 'Bia', viewport, hasTouch);
    const viewer = await open(browser, room, 'Vera', viewport, hasTouch);
    try {
      await startLive(ana.page); await expect(stageBadge(bia.page, 'Ana')).toBeVisible(); await startLive(bia.page);
      await chooseFollow(viewer.page, 'Ana'); await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
      await ana.page.waitForTimeout(1150); // Expire the initial publication's server budget.
      const elapsed = await ana.page.evaluate(async () => {
        const socket = ((window as any).testSockets as WebSocket[]).find(s => s.url.includes('/signal') && s.readyState === WebSocket.OPEN)!;
        const self = (window as any).testPeerId;
        for (let i = 0; i < 5; i++) socket.send(JSON.stringify({ type: 'select-stage', targetPeerId: self }));
        (window as any).testSelections = [];
        const start = performance.now();
        for (let i = 0; i < 19; i++) {
          const button = document.querySelector<HTMLButtonElement>('button[aria-label^="Destacar transmissão de "]');
          if (!button) throw new Error('Missing secondary transmission');
          button.click();
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }
        return performance.now() - start;
      });
      expect(elapsed).toBeLessThan(1000);
      await expect(stageBadge(ana.page, 'Bia')).toBeVisible();
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
      await expect.poll(() => ana.page.evaluate(() => (window as any).testSelections.length)).toBeGreaterThan(0);
      const sent = await ana.page.evaluate(() => (window as any).testSelections as { target: string; at: number }[]);
      expect(sent.length).toBeLessThanOrEqual(2);
      for (let i = 1; i < sent.length; i++) expect(sent[i].at - sent[i - 1].at).toBeGreaterThanOrEqual(1090);
      // An acknowledged final choice must not keep retrying.
      await ana.page.waitForTimeout(1250);
      expect(await ana.page.evaluate(() => (window as any).testSelections.length)).toBe(sent.length);
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    } finally { await closeAll([ana.context, bia.context, viewer.context]); }
  });
}

for (const [label, viewport, touch] of [['desktop', { width: 1440, height: 900 }, false], ['mobile-390', { width: 390, height: 844 }, true], ['mobile-320', { width: 320, height: 740 }, true]] as const) {
  test(`F22 comparison is local, follows only primary and recovers lifecycle (${label})`, async ({ browser }) => {
    const room = `f22-${label}-${Date.now()}`;
    const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia');
    const clara = await open(browser, room, 'Clara');
    const viewer = await open(browser, room, 'Vera', viewport, touch);
    const page = viewer.page;
    const primary = page.getByRole('region', { name: 'Transmissão principal', exact: true });
    const secondary = page.getByRole('region', { name: 'Transmissão secundária', exact: true });
    try {
      await startLive(ana.page); await startLive(bia.page); await startLive(clara.page);
      await expect(card(page, 'Clara')).toBeVisible();
      await expect.poll(() => page.getByTestId('zoom-viewport').locator('video').evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await expect.poll(() => page.locator('.secondary-preview-btn video').first().evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await expect(page.getByText(/(entrou|saiu) da sala/)).toBeHidden();
      await page.screenshot({ path: test.info().outputPath(`f22-${label}-traditional-multi.png`), animations: 'disabled' });
      await expect(ana.page.getByText(/(entrou|saiu) da sala/)).toBeHidden();
      if (label === 'desktop') {
        await ana.page.setViewportSize({ width: 1440, height: 900 });
        await expect.poll(() => ana.page.getByTestId('zoom-viewport').locator('video').evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
        await expect.poll(() => ana.page.locator('.secondary-preview-btn video').first().evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
        await ana.page.screenshot({ path: test.info().outputPath('f22-desktop-presenter-traditional.png'), animations: 'disabled' });
        await ana.page.getByRole('button', { name: 'Comparar', exact: true }).click();
        await expect.poll(() => ana.page.getByRole('region', { name: 'Transmissão secundária', exact: true }).locator('video').evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
        await ana.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await ana.page.mouse.move(0, 0);
        await ana.page.screenshot({ path: test.info().outputPath('f22-desktop-presenter-compare.png'), animations: 'disabled' });
        await ana.page.getByRole('button', { name: 'Sair da comparação' }).click();
      }
      await chooseFollow(page, 'Ana');
      const selections = await page.evaluate(() => (window as any).testSelections.length);
      const compare = page.getByRole('button', { name: 'Comparar', exact: true });
      await compare.focus(); await page.keyboard.press('Enter');
      await expect(primary).toBeVisible(); await expect(secondary).toBeVisible();
      const secondarySelect = secondary.getByRole('combobox');
      await secondarySelect.selectOption({ label: 'Clara' });
      await expect.poll(() => page.evaluate(() => (window as any).testSelections.length)).toBe(selections);
      await drawer(page); await expect(status(page)).not.toHaveText('Acompanhamento suspenso'); await closeDrawer(page);
      await primary.getByRole('button', { name: 'Ampliar zoom' }).click();
      await expect(primary.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('125%');
      await expect(secondary.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('100%');
      if (touch) await secondary.getByRole('button', { name: 'Ampliar zoom' }).tap();
      else await secondary.getByRole('button', { name: 'Ampliar zoom' }).click();
      await expect(secondary.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('125%');
      await expect(secondary.getByRole('button', { name: /Apontar|Desenhar|Salvar imagem|Janela flutuante/ })).toHaveCount(0);
      expect(await secondary.locator('video').evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
      expect(await page.locator('video').evaluateAll(v => v.filter(e => !(e as HTMLVideoElement).muted).length)).toBeLessThanOrEqual(1);
      const a = (await primary.boundingBox())!, b = (await secondary.boundingBox())!;
      if (touch) { expect(b.y).toBeGreaterThan(a.y); expect(b.width).toBeLessThanOrEqual(viewport.width); }
      else { expect(b.x).toBeGreaterThan(a.x); expect(Math.abs(a.width - b.width)).toBeLessThan(2); }
      if (touch) await page.setViewportSize({ width: viewport.width, height: 1500 });
      await page.locator('.stage-main-container').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: test.info().outputPath(`f22-${label}-active.png`), fullPage: true });
      await page.setViewportSize(viewport);
      // F29 chooses the former secondary: composition swaps to the previous primary.
      const oldPrimary = await primary.getByRole('combobox').inputValue();
      await card(ana.page, 'Clara').click();
      await expect(primary.getByRole('combobox')).toHaveValue(await clara.page.evaluate(() => (window as any).testPeerId));
      await expect(secondarySelect).toHaveValue(oldPrimary);
      await expect.poll(() => page.evaluate(() => (window as any).testSelections.length)).toBe(selections);
      await bia.page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await secondarySelect.selectOption({ label: 'Bia' });
      await expect(secondary.getByText('Transmissão pausada', { exact: true })).toBeVisible();
      if (touch) await page.setViewportSize({ width: viewport.width, height: 1500 });
      await page.locator('.stage-main-container').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: test.info().outputPath(`f22-${label}-paused.png`), fullPage: true });
      await page.setViewportSize(viewport);
      await bia.page.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
      await expect.poll(() => secondary.locator('video').evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await drop(bia.page); await reconnect(bia.page);
      await expect.poll(() => secondary.locator('video').evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
      await primary.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await expect(secondary).toBeVisible();
      if (label === 'desktop') {
        await expect(page.getByText(/(entrou|saiu) da sala/)).toBeHidden();
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.mouse.move(0, 0);
        await page.screenshot({ path: test.info().outputPath('f22-desktop-cinema.png'), animations: 'disabled' });
      }
      await primary.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.contains(document.querySelector('[aria-label="Transmissão secundária"]')))).toBe(true);
      if (label === 'desktop') {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.mouse.move(0, 0);
        await page.screenshot({ path: test.info().outputPath('f22-desktop-fullscreen.png'), animations: 'disabled' });
      }
      await primary.getByRole('button', { name: 'Sair da tela cheia' }).click();
      await primary.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
      const download = page.waitForEvent('download');
      await primary.getByRole('button', { name: 'Salvar imagem', exact: true }).click();
      expect((await download).suggestedFilename()).toMatch(/\.png$/);
      await page.getByRole('button', { name: 'Sair da comparação' }).click();
      await expect(secondary).toHaveCount(0);
      await compare.click();
      await primary.getByRole('combobox').selectOption({ label: 'Bia' });
      await drawer(page); await expect(status(page)).toHaveText('Acompanhamento suspenso'); await closeDrawer(page);
      await ana.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await clara.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(secondary).toHaveCount(0);
      await expect(compare).toHaveCount(0);
    } finally { await closeAll([ana.context, bia.context, clara.context, viewer.context]); }
  });
}
