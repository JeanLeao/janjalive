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
      constructor(url: string | URL, protocols?: string | string[]) { if ((window as any).blockSignal && String(url).includes('/signal')) throw new Error('test: reconnection held'); super(url, protocols); (window as any).testSockets.push(this); this.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.type === 'peer-joined') (window as any).testJoins = ((window as any).testJoins || 0) + 1; } catch {} }); }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        if ((window as any).testCaptureGate) await (window as any).testCaptureGate;
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
const follow = (page: Page, name: string) => page.getByRole('menuitem', { name: `Seguir ${name}`, exact: true });
const chip = (page: Page) => page.getByRole('status').filter({ hasText: 'Seguindo' });
const indicate = (page: Page) => page.getByRole('menuitem', { name: 'Indicar aos seguidores', exact: true });

async function menu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Acompanhamento', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await trigger.tap(); else await trigger.click();
  }
  await expect(page.getByRole('menu')).toBeVisible();
}
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
    await menu(v1.page); await follow(v1.page, 'Ana').click();
    await expect(chip(v1.page)).toContainText('Seguindo AnaAcompanhando');
    await card(v2.page, 'Bia').click();
    await menu(v2.page); await follow(v2.page, 'Bia').click();
    await expect(chip(v2.page)).toContainText('Seguindo BiaAcompanhando');
    await card(v3.page, 'Bia').click();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();

    // Bia is on Ana's stage and points her followers at it; only Vitor moves.
    await expect(stageBadge(bia.page, 'Ana')).toBeVisible();
    await menu(bia.page); await indicate(bia.page).click();
    await expect(stageBadge(v2.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();
    await expect(chip(v2.page)).toContainText('Acompanhando');

    // Ana shows Bia's stream and indicates it: Vera follows, Vitor (following Bia) and Vilma do not.
    await card(ana.page, 'Bia').click();
    await menu(ana.page); await indicate(ana.page).click();
    await expect(stageBadge(v1.page, 'Bia')).toBeVisible();
    await expect(stageBadge(v2.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v3.page, 'Bia')).toBeVisible();

    // Manual selection suspends, keeps the presenter, and later indications do not override it.
    await card(v1.page, 'Ana').click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(chip(v1.page)).toContainText('Seguindo AnaSuspenso');
    await menu(ana.page); await indicate(ana.page).click();
    await menu(ana.page); await indicate(ana.page).click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await expect(stageBadge(v1.page, 'Bia')).toHaveCount(0);
    await menu(v1.page); await v1.page.getByRole('menuitem', { name: 'Retomar', exact: true }).click();
    await expect(stageBadge(v1.page, 'Bia')).toBeVisible();
    await expect(chip(v1.page)).toContainText('Seguindo AnaAcompanhando');

    // A late participant gets the current indication when it starts following.
    const late = await open(browser, room, 'Lia'); contexts.push(late.context);
    await expect(card(late.page, 'Ana').or(card(late.page, 'Bia')).first()).toBeVisible();
    await menu(late.page); await follow(late.page, 'Ana').click();
    await expect(stageBadge(late.page, 'Bia')).toBeVisible();

    // Stopping following keeps manual control and ignores new indications.
    await menu(v1.page); await v1.page.getByRole('menuitem', { name: 'Parar de seguir', exact: true }).click();
    await expect(chip(v1.page)).toHaveCount(0);
    await card(v1.page, 'Ana').click();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();
    await menu(ana.page); await indicate(ana.page).click();
    await expect(stageBadge(late.page, 'Bia')).toBeVisible();
    await expect(stageBadge(v1.page, 'Ana')).toBeVisible();

    // The indicated stream ending stops forcing it: the follower falls back to what remains and can navigate.
    await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(stageBadge(late.page, 'Ana')).toBeVisible();
    await expect(chip(late.page)).toContainText('Transmissão indisponível');
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
    await menu(viewer.page); await follow(viewer.page, 'Ana').click();
    await card(ana.page, 'Bia').click();
    await menu(ana.page); await indicate(ana.page).click();
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
    await expect(chip(viewer.page)).toContainText('Seguindo AnaAcompanhando');

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

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 375, height: 700 }, true], ['mobile-320', { width: 320, height: 700 }, true]] as const) {
  test(`F29 controls are keyboard and ${touch ? 'touch' : 'pointer'} operable without covering the stage (${label})`, async ({ browser }) => {
    const room = `f29-ui-${label}-${Date.now()}`;
    const presenter = await open(browser, room, 'Ana', viewport, touch);
    const viewer = await open(browser, room, 'Vera', viewport, touch);
    try {
      await startLive(presenter.page);
      await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
      await menu(viewer.page);
      const seguir = follow(viewer.page, 'Ana');
      await expect(seguir).toBeVisible();
      const box = (await seguir.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(touch ? 44 : 28);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      if (touch) await seguir.tap(); else { await seguir.focus(); await viewer.page.keyboard.press('Enter'); }
      await expect(chip(viewer.page)).toContainText('Seguindo AnaAcompanhando');
      const row = (await viewer.page.getByRole('group', { name: 'Seguir apresentador' }).boundingBox())!;
      expect(row.x + row.width).toBeLessThanOrEqual(viewport.width);
      const status = viewer.page.getByText(/Reproduzindo|Reproduzir|Falha|Carregando|Aguardando/).first();
      if (await status.isVisible()) expect((await status.boundingBox())!.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
      await expect(viewer.page.getByRole('menu')).toBeHidden();
      await viewer.page.screenshot({ path: `../../screenshots/f29-review/after-${label}-active.png`, animations: 'disabled' });
      await menu(viewer.page);
      const stop = viewer.page.getByRole('menuitem', { name: 'Parar de seguir', exact: true });
      await stop.focus();
      await expect(stop).toBeFocused();
      if (touch) await stop.tap(); else await viewer.page.keyboard.press('Space');
      await expect(chip(viewer.page)).toHaveCount(0);
      await menu(presenter.page);
      await expect(indicate(presenter.page)).toBeVisible();
      await viewer.page.screenshot({ path: test.info().outputPath(`f29-viewer-${label}.png`) });
      await test.info().attach(`f29-viewer-${label}`, { path: test.info().outputPath(`f29-viewer-${label}.png`), contentType: 'image/png' });
    } finally { await closeAll([presenter.context, viewer.context]); }
  });
}

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 375, height: 700 }, true], ['mobile-320', { width: 320, height: 700 }, true]] as const) {
  test(`F29 empty stage: follower identifies and stops following when no stream is active (${label})`, async ({ browser }) => {
    const room = `f29-empty-${label}-${Date.now()}`;
    const presenter = await open(browser, room, 'Ana', viewport, touch);
    const viewer = await open(browser, room, 'Vera', viewport, touch);
    try {
      await startLive(presenter.page);
      await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();

      // Espectador começa a seguir Ana
      await menu(viewer.page);
      const seguir = follow(viewer.page, 'Ana');
      if (touch) await seguir.tap(); else { await seguir.focus(); await viewer.page.keyboard.press('Enter'); }
      await expect(chip(viewer.page)).toContainText('Seguindo AnaAcompanhando');

      // Presenter para o compartilhamento de tela -> palco entra no estado vazio
      await presenter.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(viewer.page.getByText('Nenhuma transmissão ativa', { exact: true })).toBeVisible();

      // No palco vazio, o chip e o botão de parar de seguir continuam visíveis
      await expect(chip(viewer.page)).toBeVisible();
      await expect(chip(viewer.page)).toContainText('Transmissão indisponível');
      await expect(viewer.page.getByRole('menu')).toBeHidden();
      await viewer.page.screenshot({ path: `../../screenshots/f29-review/after-${label}-empty.png`, animations: 'disabled' });
      await menu(viewer.page);
      const stop = viewer.page.getByRole('menuitem', { name: 'Parar de seguir', exact: true });
      await expect(stop).toBeVisible();

      // Validar dimensões e limites de tela
      const stopBox = (await stop.boundingBox())!;
      expect(stopBox.height).toBeGreaterThanOrEqual(touch ? 44 : 28);
      expect(stopBox.x).toBeGreaterThanOrEqual(0);
      expect(stopBox.x + stopBox.width).toBeLessThanOrEqual(viewport.width);

      // Parar de seguir pelo teclado ou toque
      if (touch) {
        await stop.tap();
      } else {
        await stop.focus();
        await expect(stop).toBeFocused();
        await viewer.page.keyboard.press('Space');
      }

      // Chip e botão de seguir desaparecem, palco vazio preservado
      await expect(chip(viewer.page)).toHaveCount(0);
      await expect(viewer.page.getByText('Nenhuma transmissão ativa', { exact: true })).toBeVisible();
      await viewer.page.screenshot({ path: test.info().outputPath(`f29-empty-${label}.png`) });
      await test.info().attach(`f29-empty-${label}`, { path: test.info().outputPath(`f29-empty-${label}.png`), contentType: 'image/png' });
    } finally { await closeAll([presenter.context, viewer.context]); }
  });
}

test('F29 target stopped and restarted while presenter was disconnected does not restore stale indication', async ({ browser }) => {
  const room = `f29-reconnect-stale-${Date.now()}`;
  const ana = await open(browser, room, 'Ana'), bia = await open(browser, room, 'Bia'), viewer = await open(browser, room, 'Vera');
  const contexts = [ana, bia, viewer].map(p => p.context);
  try {
    await startLive(ana.page);
    await startLive(bia.page);
    await menu(viewer.page); await follow(viewer.page, 'Ana').click();
    await card(ana.page, 'Bia').click();
    await menu(ana.page); await indicate(ana.page).click();
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

    // Ana cai involuntariamente
    await ana.page.evaluate(() => {
      ((window as any).testSockets as WebSocket[]).filter(s => s.readyState === WebSocket.OPEN && s.url.includes('/signal')).forEach(s => s.close(4001, 'test drop'));
    });
    await expect(chip(viewer.page)).toContainText('Aguardando reconexão');

    // Enquanto Ana está fora, Bia encerra a transmissão e depois inicia uma nova
    await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewer.page.getByText('Nenhuma transmissão ativa', { exact: true })).toBeVisible();
    await startLive(bia.page);
    await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

    // Ana reconecta com a mesma identidade
    await expect.poll(() => viewer.page.evaluate(() => (window as any).testJoins || 0), { timeout: 15000 }).toBe(1);

    // O seguidor de Ana (viewer) NÃO deve ser forçado para Bia com a indicação obsoleta!
    // Como a indicação foi invalidada quando Bia parou, viewer destaca o stream da própria Ana
    await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
    await expect(chip(viewer.page)).toContainText('Seguindo AnaAcompanhando');
  } finally { await closeAll(contexts); }
});

for (const [label, viewport, touch] of [['desktop', { width: 1280, height: 800 }, false], ['mobile-320', { width: 320, height: 700 }, true]] as const) {
  test(`F29 contextual availability, direct switching, Cinema and fullscreen (${label})`, async ({ browser }) => {
    const room = `f29-context-${label}-${Date.now()}`;
    const ana = await open(browser, room, 'Ana', viewport, touch);
    const bia = await open(browser, room, 'Bia', viewport, touch);
    const viewer = await open(browser, room, 'Vera', viewport, touch);
    for (const session of [ana, bia, viewer]) session.page.setDefaultTimeout(10000);
    const snapshot = async (page: Page, state: string) => {
      await expect(page.getByText(/(entrou|saiu) da sala/)).toBeHidden();
      await page.getByRole('group', { name: 'Seguir apresentador' }).screenshot({ path: test.info().outputPath(`${state}-control.png`), animations: 'disabled' });
      await page.screenshot({ path: `../../screenshots/f29-review/after-${label}-${state}.png`, animations: 'disabled' });
    };
    const assertMenu = async (page: Page, names: string[]) => {
      await menu(page);
      await expect(page.getByRole('menuitem')).toHaveText(names);
      await expect(page.getByRole('menu')).toBeVisible();
      const bounds = (await page.getByRole('menu').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    };
    try {
      await expect(viewer.page.getByRole('button', { name: 'Acompanhamento', exact: true })).toHaveCount(0);
      await ana.page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await expect(ana.page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeVisible();
      await expect(indicate(ana.page)).toHaveCount(0);
      await expect(viewer.page.getByRole('button', { name: 'Acompanhamento', exact: true })).toHaveCount(0);
      await ana.page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
      await expect(stageBadge(viewer.page, 'Ana')).toBeVisible();
      await startLive(bia.page);
      await expect(card(viewer.page, 'Bia')).toBeVisible();
      await assertMenu(viewer.page, ['Seguir Ana', 'Seguir Bia']);
      await follow(viewer.page, 'Ana').click();
      await assertMenu(viewer.page, ['Seguir Bia', 'Parar de seguir']);
      await snapshot(viewer.page, 'switch-menu');
      // Switch directly, without selecting another stage, suspending or stopping first.
      if (touch) await follow(viewer.page, 'Bia').tap(); else await follow(viewer.page, 'Bia').click();
      await expect(chip(viewer.page)).toContainText('Seguindo BiaAcompanhando');
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();
      await card(viewer.page, 'Ana').click();
      await assertMenu(viewer.page, ['Retomar', 'Seguir Ana', 'Parar de seguir']);
      await snapshot(viewer.page, 'suspended');
      await viewer.page.getByRole('menuitem', { name: 'Retomar', exact: true }).click();
      await expect(stageBadge(viewer.page, 'Bia')).toBeVisible();

      await bia.page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(stageBadge(viewer.page, 'Bia', 'Pausado')).toBeVisible();
      await assertMenu(bia.page, ['Seguir Ana', 'Indicar aos seguidores']);
      await indicate(bia.page).click();
      await expect(bia.page.getByText('Solicitação de indicação enviada.', { exact: true })).toBeVisible();
      await bia.page.evaluate(() => { (window as any).testCaptureGate = new Promise(resolve => { (window as any).releaseCapture = resolve; }); });
      await bia.page.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await assertMenu(bia.page, ['Seguir Ana']);
      await expect(indicate(bia.page)).toHaveCount(0);
      await bia.page.keyboard.press('Escape');
      await bia.page.evaluate(() => { (window as any).releaseCapture(); (window as any).testCaptureGate = null; });
      await expect(bia.page.getByRole('button', { name: 'Confirmar troca', exact: true })).toBeVisible();
      await expect(indicate(bia.page)).toHaveCount(0);
      await bia.page.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
      await assertMenu(bia.page, ['Seguir Ana', 'Indicar aos seguidores']);
      await bia.page.keyboard.press('Escape');

      await viewer.page.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
      await viewer.page.getByRole('button', { name: 'Restaurar enquadramento', exact: true }).click();
      await viewer.page.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await assertMenu(viewer.page, ['Seguir Ana', 'Parar de seguir']);
      const followBounds = (await viewer.page.getByRole('button', { name: 'Acompanhamento', exact: true }).boundingBox())!;
      const accessBounds = (await viewer.page.locator('.stage-top-right-access').boundingBox())!;
      expect(followBounds.x + followBounds.width <= accessBounds.x || followBounds.y >= accessBounds.y + accessBounds.height || followBounds.y + followBounds.height <= accessBounds.y).toBe(true);
      await snapshot(viewer.page, 'cinema');
      await viewer.page.keyboard.press('Escape');
      await viewer.page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => viewer.page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      const trigger = viewer.page.getByRole('button', { name: 'Acompanhamento', exact: true });
      await trigger.focus();
      await viewer.page.keyboard.press('Enter');
      await expect(viewer.page.getByRole('menuitem', { name: 'Parar de seguir', exact: true })).toBeVisible();
      await snapshot(viewer.page, 'fullscreen');
      await viewer.page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      if (await viewer.page.evaluate(() => Boolean(document.fullscreenElement))) {
        await viewer.page.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      }
      await viewer.page.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();

      // Hold signaling reconnects without interrupting Vite's independent development socket.
      await bia.page.evaluate(() => {
        (window as any).blockSignal = true;
        ((window as any).testSockets as WebSocket[]).filter(s => s.url.includes('/signal')).forEach(s => s.close(4001, 'test drop'));
      });
      await expect(chip(viewer.page)).toContainText('Aguardando reconexão');
      await expect(indicate(bia.page)).toHaveCount(0);
      if (await bia.page.getByRole('button', { name: 'Acompanhamento', exact: true }).isVisible()) {
        await menu(bia.page);
        await expect(indicate(bia.page)).toHaveCount(0);
      }
      await snapshot(viewer.page, 'reconnecting');
      await bia.page.evaluate(() => { (window as any).blockSignal = false; });
      await expect(chip(viewer.page)).toContainText('Acompanhando', { timeout: 15000 });
      // The deliberately failed socket construction produces the app's dismissible error alert.
      if (await bia.page.getByRole('alert').isVisible()) await bia.page.getByRole('alert').getByRole('button').click();
      await bia.page.keyboard.press('Escape');
      await assertMenu(bia.page, ['Seguir Ana', 'Indicar aos seguidores']);
      await bia.page.keyboard.press('Escape');
      await viewer.page.evaluate(() => {
        (window as any).blockSignal = true;
        ((window as any).testSockets as WebSocket[]).filter(s => s.url.includes('/signal')).forEach(s => s.close(4001, 'test viewer drop'));
      });
      await expect(chip(viewer.page)).toContainText('Aguardando reconexão');
      await menu(viewer.page);
      await expect(viewer.page.getByRole('menuitem', { name: 'Parar de seguir', exact: true })).toBeVisible();
      await expect(viewer.page.getByRole('menuitem', { name: 'Retomar', exact: true })).toHaveCount(0);
      await expect(indicate(viewer.page)).toHaveCount(0);
      await viewer.page.keyboard.press('Escape');
      await viewer.page.evaluate(() => { (window as any).blockSignal = false; });
      await expect(chip(viewer.page)).toContainText('Acompanhando', { timeout: 15000 });
      if (await viewer.page.getByRole('alert').isVisible()) await viewer.page.getByRole('alert').getByRole('button').click();
      await bia.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(chip(viewer.page)).toContainText('Transmissão indisponível');
      await snapshot(viewer.page, 'unavailable');
      await assertMenu(bia.page, ['Seguir Ana']);
      await expect(indicate(bia.page)).toHaveCount(0);
      await viewer.page.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await ana.page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(viewer.page.getByText('Nenhuma transmissão ativa', { exact: true })).toBeVisible();
      await assertMenu(viewer.page, ['Parar de seguir']);
      await snapshot(viewer.page, 'empty-cinema');
    } finally { await closeAll([ana.context, bia.context, viewer.context]); }
  });
}


test('F29 announced sharing without received media remains unavailable while connecting', async ({ browser }) => {
  const room = `f29-no-media-${Date.now()}`;
  test.setTimeout(30000);
  const ana = await open(browser, room, 'Ana');
  const viewer = await open(browser, room, 'Vera');
  try {
    // Announce capture without creating any WebRTC tracks: presence alone is not a playable presentation.
    await ana.page.evaluate(() => {
      const socket = ((window as any).testSockets as WebSocket[]).find(s => s.url.includes('/signal') && s.readyState === WebSocket.OPEN)!;
      socket.send(JSON.stringify({ type: 'update-sharing', active: true, paused: false, streamId: 'announced-without-media', hasAudio: false, audioMuted: false }));
    });
    await menu(viewer.page);
    await follow(viewer.page, 'Ana').click();
    await expect(chip(viewer.page)).toContainText('Transmissão indisponível');
    await expect(viewer.page.getByText('Conectando à transmissão', { exact: true })).toBeVisible();
    await viewer.page.screenshot({ path: '../../screenshots/f29-review/after-desktop-no-media.png', animations: 'disabled' });
    await menu(viewer.page);
    await expect(viewer.page.getByRole('menuitem')).toHaveText(['Parar de seguir']);
    await expect(indicate(viewer.page)).toHaveCount(0);
  } finally { await closeAll([ana.context, viewer.context]); }
});
