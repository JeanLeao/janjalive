import { test, expect, type Page } from '@playwright/test';

async function openLobby(page: Page, path = '/') {
  await page.goto(path);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button =>
    button.textContent === 'Criar sala' && Object.keys(button).some(key => key.startsWith('__reactProps'))));
}

for (const width of [1280, 768, 390, 320]) {
  test(`lobby: layout, keyboard, touch and modal focus at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width < 400 });
    const page = await context.newPage();
    await openLobby(page);
    await expect(page).toHaveTitle('Janjalive — Compartilhamento de tela no navegador');
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth))).toBe(width);
    for (const name of ['Criar sala', 'Entrar com código']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThan(800);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    // The checkbox's label/body provides the touch target around its smaller visual square.
    const protection = page.getByText('Proteger sala com chave de acesso', { exact: true });
    expect((await protection.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width < 400) await protection.tap(); else await protection.click();
    await expect(page.getByRole('checkbox')).toBeChecked();
    await page.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    for (const [trigger, title] of [['Sobre', 'Sobre o Janjalive'], ['Ajuda', 'Dicas e Ajuda'], ['Entrar com código', 'Entrar com código']]) {
      const opener = page.getByRole('button', { name: trigger, exact: true });
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      }
      if (trigger === 'Ajuda') {
        const topic = dialog.getByRole('button', { name: 'Clipes e Watch Party' });
        await topic.focus(); await page.keyboard.press('Enter');
        await expect(topic).toHaveAttribute('aria-expanded', 'true');
        await expect(dialog.getByText(/A sincronização é aproximada/)).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      if (width < 400) await opener.tap(); else await opener.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Fechar modal', exact: true }).click();
      await expect(opener).toBeFocused();
    }
    await page.getByRole('link', { name: 'Voltar para criar sala' }).click();
    await expect(page.getByLabel('Seu nickname temporário (opcional)')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Criar sala', exact: true })).toBeInViewport();
    await context.close();
  });
}

test('lobby: optional nickname persists, query opens code modal, invalid code is recoverable', async ({ page }) => {
  await openLobby(page);
  const nickname = page.getByLabel('Seu nickname temporário (opcional)');
  await nickname.fill('  Visitante de teste  ');
  await openLobby(page, '/?modal=code');
  const dialog = page.getByRole('dialog', { name: 'Entrar com código' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Seu nickname (opcional)')).toHaveValue('Visitante de teste');
  const code = dialog.getByLabel('Código ou link da sala');
  await code.fill('invalid!'); await dialog.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(dialog.getByText(/Identificador de sala inválido/)).toBeVisible();
  await code.fill('valid-code');
  await expect(dialog.getByText(/Identificador de sala inválido/)).toBeHidden();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await nickname.fill('');
  expect(await page.evaluate(() => sessionStorage.getItem('screen_room_display_name'))).toBeNull();
});

test('lobby: real ordinary room creation and invitation by normalized code and full link', async ({ browser }) => {
  const host = await browser.newPage();
  await openLobby(host);
  await host.getByLabel('Seu nickname temporário (opcional)').fill('Anfitrião');
  await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
  await expect(host).toHaveURL(/\/room\/[a-f0-9]{32}$/);
  await expect(host.getByText('Conectado', { exact: true })).toBeVisible();
  const roomUrl = host.url(); const roomId = new URL(roomUrl).pathname.split('/').pop()!;
  // Landing metadata must not follow client navigation into rooms.
  await expect(host).toHaveTitle('Janjalive — compartilhamento em tempo real');
  await expect(host.locator('meta[name="description"]')).toHaveCount(0);
  for (const input of [`  ${roomId.toUpperCase()}  `, roomUrl]) {
    const guest = await browser.newPage();
    await openLobby(guest);
    await guest.getByRole('button', { name: 'Entrar com código', exact: true }).click();
    await guest.getByLabel('Código ou link da sala').fill(input);
    await guest.getByRole('button', { name: 'Entrar na sala' }).click();
    await expect(guest).toHaveURL(roomUrl);
    await expect(guest.getByText('Conectado', { exact: true })).toBeVisible();
    await guest.close();
  }
  await host.close();
});

test('lobby: asynchronous creation shows loading, prevents duplicates and permits retry after error', async ({ page }) => {
  let attempts = 0;
  let release: (() => void) | undefined;
  await page.routeWebSocket(/\/signal$/, socket => {
    socket.onMessage(async raw => {
      if (JSON.parse(String(raw)).type !== 'create-room') return;
      attempts++;
      await new Promise<void>(resolve => { release = resolve; });
      socket.send(JSON.stringify({ type: 'error', message: 'Falha de teste. Tente novamente.' }));
    });
  });
  await openLobby(page);
  const create = page.getByRole('button', { name: 'Criar sala', exact: true });
  await create.click();
  await expect(create).toHaveAttribute('data-loading', 'true');
  await expect(create).toBeDisabled();
  await expect.poll(() => attempts).toBe(1);
  await create.dispatchEvent('click');
  expect(attempts).toBe(1);
  release!();
  await expect(page.getByRole('alert')).toHaveText('Falha de teste. Tente novamente.');
  await expect(create).toBeEnabled();
  await create.click();
  await expect.poll(() => attempts).toBe(2);
  release!();
  await expect(create).toBeEnabled();
});

test('lobby: product demonstrations switch states and stay inert without signaling or capture', async ({ page }) => {
  const sockets: string[] = [];
  // Vite opens its own HMR socket during E2E; only room signaling is relevant.
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname === '/signal') sockets.push(socket.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      value: () => {
        document.documentElement.dataset.captureRequested = 'true';
        return Promise.reject(new Error('Landing must not request capture'));
      },
    });
  });
  await openLobby(page);
  const screenTab = page.getByRole('tab', { name: /Tela e áudio/ });
  const interactionsTab = page.getByRole('tab', { name: /Interações/ });
  const watchTab = page.getByRole('tab', { name: /Watch Party/ });
  const panel = page.getByRole('tabpanel');
  await screenTab.scrollIntoViewIfNeeded();
  await expect(screenTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toContainText('Escolha uma aba, janela ou tela inteira');
  await screenTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(interactionsTab).toBeFocused();
  await expect(interactionsTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toContainText('chat, reações e mão levantada');
  await page.keyboard.press('End');
  await expect(watchTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toContainText('A sincronização é aproximada');
  await page.keyboard.press('ArrowRight');
  await expect(screenTab).toBeFocused();
  await interactionsTab.click();
  await expect(interactionsTab).toHaveAttribute('aria-selected', 'true');
  await screenTab.click();

  const stage = panel.locator('[inert][aria-hidden="true"]');
  await expect(stage).toHaveCount(1);
  await expect(panel.getByText('Demonstração ilustrativa · nenhuma sala conectada')).toBeVisible();
  // Browser hit testing must leave the illustrated room controls inert.
  const share = await stage.getByText('Compartilhar', { exact: true }).boundingBox();
  await page.mouse.click(share!.x + share!.width / 2, share!.y + share!.height / 2);
  await expect(page.locator('html')).not.toHaveAttribute('data-capture-requested', 'true');
  await expect(page).toHaveURL('http://127.0.0.1:4311/');

  const compare = page.getByRole('group', { name: 'Demonstração do modo Comparar' });
  await compare.scrollIntoViewIfNeeded();
  await expect(compare.getByRole('button', { name: 'Comparar' })).toHaveAttribute('aria-pressed', 'true');
  await compare.getByRole('button', { name: 'Uma transmissão' }).click();
  await expect(compare.getByRole('button', { name: 'Uma transmissão' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/o botão Comparar abre a segunda/)).toBeVisible();
  await compare.getByRole('button', { name: 'Comparar' }).click();
  await expect(page.getByText(/código da ficha na tela de Firminha e o resultado na tela de Hanzinza/)).toBeVisible();

  expect(sockets).toEqual([]);
  await expect(page.locator('video, audio')).toHaveCount(0);
});

test('lobby: reduced motion keeps every section in its final state', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await openLobby(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const states = await page.locator('[data-reveal]').evaluateAll(elements => elements.map(element => element.getAttribute('data-reveal')));
  expect(states.length).toBeGreaterThan(0);
  expect(new Set(states)).toEqual(new Set(['static']));
  await expect(page.getByRole('group', { name: 'Demonstração do modo Comparar' }).getByRole('button', { name: 'Comparar' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('h1').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await context.close();
});
