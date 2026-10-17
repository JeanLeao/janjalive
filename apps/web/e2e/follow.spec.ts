import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// F29 — Seguir apresentador. Capture is synthetic (canvas); permissions, real audio and STUN/TURN are not covered.

async function open(browser: Browser, room: string, name: string, viewport?: { width: number; height: number }, hasTouch = false) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  await page.addInitScript((nickname) => {
    sessionStorage.setItem('screen_room_display_name', nickname);
    (window as any).testSockets = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); (window as any).testSockets.push(this); this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.type === 'peer-joined') (window as any).testJoins = ((window as any).testJoins || 0) + 1; } catch {} }); }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d')!;
        let frame = 0;
        const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? '#ff0000' : '#0000ff'; ctx.fillRect(0, 0, 640, 360); }, 50);
        const stream = canvas.captureStream(20);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        return stream;
      },
    });
  }, name);
  await page.goto(`/room/${room}`);
  await expect(page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Ver participantes/ }).first()).toBeVisible();
  return { context, page };
}

async function startLive(page: Page) {
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
}

const stageBadge = (page: Page, name: string, state = 'Transmitindo') => page.getByText(`${name} · ${state}`, { exact: true });
const card = (page: Page, name: string) => page.getByRole('button', { name: `Destacar transmissão de ${name}`, exact: true });
const follow = (page: Page, name: string) => page.getByRole('button', { name: `Seguir ${name}`, exact: true });
const chip = (page: Page) => page.getByRole('status').filter({ hasText: 'Seguindo' });
const indicate = (page: Page) => page.getByRole('button', { name: 'Indicar aos seguidores', exact: true });

async function closeAll(contexts: BrowserContext[]) { await Promise.all(contexts.map(context => context.close())); }

test('F29 independent presenters, isolated followers, manual suspension, resume, stop, late join and stream end', async ({ browser }) => {
  const room = `f29-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia');
  const v1 = await open(browser, room, 'Vera'), v2 = await open(browser, room, 'Vitor'), v3 = await open(browser, room, 'Vilma');
  const contexts = [ana, bia, v1, v2, v3].map(p => p.context);
  try {
    await expect(ana.page.getByRole('button', { name: 'Ver participantes (5)', exact: true }).first()).toBeVisible();
    await startLive(ana.page);
    for (const v of [v1, v2, v3]) await expect(stageBadge(v.page, 'Ana')).toBeVisible();
    await startLive(bia.page);
    for (const v of [v1, v2, v3]) await expect(card(v.page, 'Bia')).toBeVisible();
    await expect(indicate(v1.page)).toHaveCount(0);

    // Following starts off; Vera follows Ana, Vitor follows Bia, Vilma follows nobody and browses Bia manually.
    await expect(chip(v1.page)).toHaveCount(0);
    await follow(v1.page, 'Ana').click();
    await expect(chip(v1.page)).toContainText('Seguindo Ana · Acompanhando');
    await card(v2.page, 'Bia').click();
    await follow(v2.page, 'Bia').click();
    await expect(chip(v2.page)).toContainText('Seguindo Bia · Acompanhando');
    await card(v3.page, 'Bia').click();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();

    // Bia is on Ana's stage and points her followers at it; only Vitor moves.
    await expect(stageBadge(bia.page, 'Ana')).toBeVisible();
    await indicate(bia.page).click();
    await expect(stageBadge(v2.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();
    await expect(chip(v2.page)).toContainText('Acompanhando');

    // Ana shows Bia's stream and indicates it: Vera follows, Vitor (following Bia) and Vilma do not.
    await card(ana.page, 'Bia').click();
    await indicate(ana.page).click();
    await expect(stageBadge(v1.page, 'Bia')).toBeVisible();
    await expect(stageBadge(v2.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();

    // Manual selection suspends, keeps the presenter, and later indications do not override it.
    await card(v1.page, 'Ana').click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(chip(v1.page)).toContainText('Seguindo Ana · Suspenso');
    await indicate(ana.page).click();
    await indicate(ana.page).click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v1.page, 'Bia')).toHaveCount(0);
    await v1.page.getByRole('button', { name: 'Retomar', exact: true }).click();
    await expect(stageBadge(v1.page, 'Bia')).toBeVisible();
    await expect(chip(v1.page)).toContainText('Seguindo Ana · Acompanhando');

    // A late participant gets the current indication when it starts following.
    const late = await open(browser, room, 'Lia'); contexts.push(late.context);
    await expect(card(late.page, 'Ana').or(card(late.page, 'Bia')).first()).toBeVisible();
    if (await stageBadge(late.page, 'Ana').isVisible()) await follow(late.page, 'Ana').click();
    else { await card(late.page, 'Ana').click(); await follow(late.page, 'Ana').click(); }
    await expect(stageBadge(late.page, 'Bia')).toBeVisible();

    // Stopping following keeps manual control and ignores new indications.
    await v1.page.getByRole('button', { name: 'Parar de seguir', exact: true }).click();
    await expect(chip(v1.page)).toHaveCount(0);
    await card(v1.page, 'Ana').click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await indicate(ana.page).click();
    await expect(stageBadge(late.page, 'Bia')).toBeVisible();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();

    // The indicated stream ending stops forcing it: the follower falls back to what remains and can navigate.
    await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(stageBadge(late.page, 'Ana')).toBeVisible();
    await expect(chip(late.page)).toContainText('Seguindo Ana · Acompanhando');
    await expect(card(late.page, 'Bia')).toHaveCount(0);
  } finally { await closeAll(contexts); }
});

test('F29 pause, F27 source swap and presenter reconnection keep following without wrong highlights', async ({ browser }) => {
  const room = `f29-life-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia'), viewer = await open(browser, room, 'Vera');
  const contexts = [ana, bia, viewer].map(p => p.context);
  try {
    await startLive(ana.page);
    await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
    await startLive(bia.page);
    await expect(card(viewer.page, 'Bia')).toBeVisible();
    await follow(viewer.page, 'Ana').click();
    await card(ana.page, 'Bia').click();
    await indicate(ana.page).click();
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

    // Pause/resume of the indicated stream keeps the highlight and shows the paused state.
    await bia.page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(stageBadge(viewer.page, 'Bia', 'Pausado')).toBeVisible();
    await expect(chip(viewer.page)).toContainText('Acompanhando');
    await bia.page.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

    // F27: a new source (new streamId) keeps the indication.
    await bia.page.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await bia.page.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
    await expect(chip(viewer.page)).toContainText('Seguindo Ana · Acompanhando');

    // The followed presenter drops: following waits, then is restored with the same identity.
    await ana.page.evaluate(() => {
      ((window as any).testSockets as WebSocket[]).filter(s => s.readyState === WebSocket.OPEN && s.url.includes('/signal')).forEach(s => s.close(4001, 'test interruption'));
    });
    await expect(chip(viewer.page)).toContainText('Aguardando reconexão');
    await expect(chip(viewer.page)).toContainText('Acompanhando', { timeout: 15000 });
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

    // A viewer who took manual control keeps it across the same drop.
    await card(viewer.page, 'Ana').click();
    await expect(chip(viewer.page)).toContainText('Suspenso');
    await ana.page.evaluate(() => {
      ((window as any).testSockets as WebSocket[]).filter(s => s.readyState === WebSocket.OPEN && s.url.includes('/signal')).forEach(s => s.close(4001, 'test interruption'));
    });
    await expect.poll(() => viewer.page.evaluate(() => (window as any).testJoins || 0), { timeout: 15000 }).toBe(2);
    await expect(chip(viewer.page)).toContainText('Suspenso');

    // A voluntary exit ends following for good.
    await ana.page.getByRole('button', { name: 'Sair da sala', exact: true }).first().click();
    await expect(chip(viewer.page)).toHaveCount(0);
  } finally { await closeAll(contexts); }
});

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 375, height: 700 }, true]] as const) {
  test(`F29 controls are keyboard and ${touch ? 'touch' : 'pointer'} operable without covering the stage (${label})`, async ({ browser }) => {
    const room = `f29-ui-${label}-${Date.now()}`;
    const presenter = await open(browser, room, 'Ana', viewport, touch);
    const viewer = await open(browser, room, 'Vera', viewport, touch);
    try {
      await startLive(presenter.page);
      await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
      const seguir = follow(viewer.page, 'Ana');
      await expect(seguir).toBeVisible();
      const box = (await seguir.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(touch ? 44 : 28);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      if (touch) await seguir.tap(); else { await seguir.focus(); await viewer.page.keyboard.press('Enter'); }
      await expect(chip(viewer.page)).toContainText('Seguindo Ana · Acompanhando');
      const row = (await viewer.page.getByRole('group', { name: 'Seguir apresentador' }).boundingBox())!;
      expect(row.x + row.width).toBeLessThanOrEqual(viewport.width);
      const status = viewer.page.getByText(/Reproduzindo|Reproduzir|Falha|Carregando|Aguardando/).first();
      if (await status.isVisible()) expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
      const stop = viewer.page.getByRole('button', { name: 'Parar de seguir', exact: true });
      await stop.focus();
      await expect(stop).toBeFocused();
      if (touch) await stop.tap(); else await viewer.page.keyboard.press('Space');
      await expect(chip(viewer.page)).toHaveCount(0);
      await expect(indicate(presenter.page)).toBeVisible();
      await viewer.page.screenshot({ path: test.info().outputPath(`f29-viewer-${label}.png`) });
      await test.info().attach(`f29-viewer-${label}`, { path: test.info().outputPath(`f29-viewer-${label}.png`), contentType: 'image/png' });
    } finally { await closeAll([presenter.context, viewer.context]); }
  });
}
