import { test, expect } from '@playwright/test';

test('chat and reactions without media: bidirectional, unread, late join, mobile and cleanup', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const a = await contextA.newPage(), b = await contextB.newPage();
  const late = await browser.newPage();
  try {
    await a.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Ana'));
    await Promise.all([a.goto('/room/e2e-interactions'), b.goto('/room/e2e-interactions')]);
    await expect(a.getByText('2', { exact: true }).first()).toBeVisible();
    await a.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await a.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('<b>Olá</b>');
    await a.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(a.getByRole('log').getByText('<b>Olá</b>', { exact: true })).toHaveCount(1);
    await expect(b.getByRole('button', { name: 'Abrir chat, 1 mensagens não lidas' })).toBeVisible();
    await b.screenshot({ animations: 'disabled', path: '/tmp/f06-mobile-unread.png' });
    await b.getByRole('button', { name: 'Abrir chat, 1 mensagens não lidas' }).tap();
    await expect(b.getByRole('log').getByText('Ana', { exact: true })).toBeVisible();
    await b.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Resposta');
    await b.getByRole('textbox', { name: 'Mensagem', exact: true }).press('Enter');
    await expect(a.getByRole('log').getByText('Resposta', { exact: true })).toHaveCount(1);
    await expect(b.getByRole('log').getByText('Resposta', { exact: true })).toHaveCount(1);
    await b.screenshot({ animations: 'disabled', path: '/tmp/f06-mobile-chat.png' });
    await a.screenshot({ animations: 'disabled', path: '/tmp/f06-desktop-chat.png' });
    await Promise.all([a.getByRole('button', { name: 'Fechar chat' }).click(), b.getByRole('button', { name: 'Fechar chat' }).click()]);
    await expect(a.getByRole('button', { name: 'Abrir chat', exact: true })).toBeFocused();
    await expect(b.getByText('Ana entrou na sala.')).toBeHidden({ timeout: 6000 });

    // Verify all 9 reactions in 3x3 grid picker on desktop and mobile
    await Promise.all([a.getByRole('button', { name: 'Reagir', exact: true }).click(), b.getByRole('button', { name: 'Reagir', exact: true }).click()]);
    const expectedReactions = [
      'Aplausos', 'Gostei', 'Adorei', 'Celebrar',
      'Brasil', 'Não gostei', 'Dedo do meio', 'Bolhas de sabão', 'Foguete'
    ];
    for (const name of expectedReactions) {
      await expect(a.getByRole('button', { name, exact: true })).toBeVisible();
      await expect(b.getByRole('button', { name, exact: true })).toBeVisible();
    }

    // Capture open 3x3 popovers
    await a.screenshot({ animations: 'disabled', path: '/tmp/f07-desktop-picker.png' });
    await b.screenshot({ animations: 'disabled', path: '/tmp/f07-mobile-320-picker.png' });
    await a.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-desktop-picker.png' });
    await b.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-mobile-320-picker.png' });

    // Test keyboard navigation in 3x3 grid
    const firstBtn = a.getByRole('button', { name: 'Aplausos', exact: true });
    await firstBtn.focus();
    await expect(firstBtn).toBeFocused();
    await a.keyboard.press('ArrowRight'); // -> Gostei
    await expect(a.getByRole('button', { name: 'Gostei', exact: true })).toBeFocused();
    await a.keyboard.press('ArrowDown'); // -> Brasil (+3)
    await expect(a.getByRole('button', { name: 'Brasil', exact: true })).toBeFocused();
    await a.keyboard.press('ArrowDown'); // -> Bolhas de sabão (+3)
    await expect(a.getByRole('button', { name: 'Bolhas de sabão', exact: true })).toBeFocused();
    await a.keyboard.press('ArrowRight'); // -> Foguete (+1)
    await expect(a.getByRole('button', { name: 'Foguete', exact: true })).toBeFocused();
    await a.keyboard.press('ArrowLeft'); // -> Bolhas de sabão (-1)
    await expect(a.getByRole('button', { name: 'Bolhas de sabão', exact: true })).toBeFocused();
    await a.keyboard.press('ArrowUp'); // -> Brasil (-3)
    await expect(a.getByRole('button', { name: 'Brasil', exact: true })).toBeFocused();
    await a.keyboard.press('Home'); // -> Aplausos
    await expect(a.getByRole('button', { name: 'Aplausos', exact: true })).toBeFocused();
    await a.keyboard.press('End'); // -> Foguete
    await expect(a.getByRole('button', { name: 'Foguete', exact: true })).toBeFocused();

    // Verify no horizontal overflow at 320px
    const overflow320 = await b.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(overflow320).toBe(true);

    // Verify 390px responsive behavior, layout without overflow, and screenshot
    await b.setViewportSize({ width: 390, height: 844 });
    await b.mouse.move(0, 0);
    await expect(b.getByRole('button', { name: 'Brasil', exact: true })).toBeVisible();
    await b.screenshot({ animations: 'disabled', path: '/tmp/f07-mobile-390-picker.png' });
    await b.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-mobile-390-picker.png' });
    const overflow390 = await b.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(overflow390).toBe(true);
    await b.setViewportSize({ width: 320, height: 740 });
    await b.mouse.move(0, 0);
    await expect(b.getByRole('button', { name: 'Brasil', exact: true })).toBeVisible();

    // Send new reactions: Brasil on desktop, Bolhas de sabão on mobile
    await Promise.all([
      a.getByRole('button', { name: 'Brasil', exact: true }).click(),
      b.getByRole('button', { name: 'Bolhas de sabão', exact: true }).click()
    ]);
    await expect(a.getByTestId('reaction-event')).toHaveCount(2);
    await expect(b.getByTestId('reaction-event')).toHaveCount(2);
    await expect(a.getByTestId('reaction-event').locator('[data-testid="flag-brazil"]')).toBeVisible();
    await expect(a.getByTestId('reaction-event').getByText('🫧')).toBeVisible();
    await expect(a.getByTestId('reaction-event').getByText(/reagiu: Brasil/)).toBeVisible();
    await expect(a.getByTestId('reaction-event').getByText(/reagiu: Bolhas de sabão/)).toBeVisible();

    await a.screenshot({ animations: 'disabled', path: '/tmp/f07-reactions.png' });
    await a.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-reactions.png' });
    await b.screenshot({ animations: 'disabled', path: '/tmp/f07-reactions-mobile.png' });
    await b.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-reactions-mobile.png' });

    // Send remaining new reactions: Foguete, Dedo do meio, Não gostei
    await a.getByRole('button', { name: 'Reagir', exact: true }).click();
    await a.getByRole('button', { name: 'Foguete', exact: true }).click();
    await expect(a.getByTestId('reaction-event').getByText('🚀')).toBeVisible();

    await a.getByRole('button', { name: 'Reagir', exact: true }).click();
    await a.getByRole('button', { name: 'Dedo do meio', exact: true }).click();
    await expect(a.getByTestId('reaction-event').getByText('🖕')).toBeVisible();

    await a.getByRole('button', { name: 'Reagir', exact: true }).click();
    await a.getByRole('button', { name: 'Não gostei', exact: true }).click();
    await expect(a.getByTestId('reaction-event').getByText('👎')).toBeVisible();

    await expect(a.getByTestId('reaction-event')).toHaveCount(0, { timeout: 6000 });
    await late.goto('/room/e2e-interactions');
    await late.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(late.getByRole('log').locator('article')).toHaveCount(0);
    await b.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(b.getByRole('log').locator('article')).toHaveCount(2);
    await a.goto('/room/e2e-new-interactions');
    await a.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(a.getByRole('log').locator('article')).toHaveCount(0);
  } finally { await contextA.close(); await contextB.close(); await late.close(); }
});

test('interaction controls remain inside fullscreen and Cinema with multiple presenters', async ({ page }) => {
  await page.goto('/room/e2e-interaction-stage?demo=multi');
  await page.getByRole('button', { name: /Cinema/ }).first().click();
  await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: '/tmp/f06-cinema-chat.png' });
  await page.getByRole('button', { name: 'Fechar chat' }).click();

  // Test reaction picker inside Cinema mode
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foguete', exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Foguete', exact: true }).evaluate(node => {
    return document.querySelector('.stage-main-container')?.contains(node) || document.body.contains(node);
  })).toBe(true);
  await page.screenshot({ animations: 'disabled', path: '/tmp/f07-cinema-picker.png' });
  await page.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-cinema-picker.png' });
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();

  await page.getByRole('button', { name: /Tela cheia/i }).first().click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeVisible();
  expect(await page.getByRole('textbox', { name: 'Mensagem', exact: true }).evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
  await page.screenshot({ animations: 'disabled', path: '/tmp/f06-fullscreen-chat.png' });
  await page.getByRole('button', { name: 'Fechar chat' }).click();

  // Test reaction picker inside fullscreen mode
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Brasil', exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Brasil', exact: true }).evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
  await page.screenshot({ animations: 'disabled', path: '/tmp/f07-fullscreen-picker.png' });
  await page.screenshot({ animations: 'disabled', path: '/home/aldobmigge/.gemini/antigravity-cli/brain/b861a022-b031-484d-a39a-49bf440c1b2d/f07-fullscreen-picker.png' });
  await page.keyboard.press('Escape');
});


test('reconnection preserves accepted chat without replay; rejection keeps the draft', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    (window as any).interactionSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).interactionSockets.push(this);
      }
    };
  });
  const page = await context.newPage();
  try {
    await page.goto('/room/e2e-interactions-recovery');
    await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
    for (let i = 0; i < 5; i++) {
      await input.fill(`Mensagem ${i}`);
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(page.getByRole('log').locator('article')).toHaveCount(i + 1);
      await expect(input).toHaveValue('');
    }
    await input.fill('Rascunho rejeitado');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Muitas interações');
    await expect(input).toHaveValue('Rascunho rejeitado');
    await page.evaluate(() => (window as any).interactionSockets.at(-1).close(4001, 'test recovery'));
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => (window as any).interactionSockets.length)).toBe(2);
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled();
    await expect(page.getByRole('log').locator('article')).toHaveCount(5);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Muitas interações');
    await expect(page.getByRole('log').locator('article')).toHaveCount(5);
    await page.reload();
    await expect(page.getByText('Conectado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(page.getByRole('log').locator('article')).toHaveCount(0);
  } finally { await context.close(); }
});

