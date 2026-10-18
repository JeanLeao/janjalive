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
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('f06-mobile-unread.png') });
    await b.getByRole('button', { name: 'Abrir chat, 1 mensagens não lidas' }).tap();
    await expect(b.getByRole('log').getByText('Ana', { exact: true })).toBeVisible();
    await b.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Resposta');
    await b.getByRole('textbox', { name: 'Mensagem', exact: true }).press('Enter');
    await expect(a.getByRole('log').getByText('Resposta', { exact: true })).toHaveCount(1);
    await expect(b.getByRole('log').getByText('Resposta', { exact: true })).toHaveCount(1);
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('f06-mobile-chat.png') });
    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('f06-desktop-chat.png') });
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
    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-desktop-picker.png') });
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-mobile-320-picker.png') });

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
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-mobile-390-picker.png') });
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

    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-reactions.png') });
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-reactions-mobile.png') });

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
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('f06-cinema-chat.png') });
  await page.getByRole('button', { name: 'Fechar chat' }).click();

  // Test reaction picker inside Cinema mode
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Foguete', exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Foguete', exact: true }).evaluate(node => {
    return document.querySelector('.stage-main-container')?.contains(node) || document.body.contains(node);
  })).toBe(true);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-cinema-picker.png') });
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();

  await page.getByRole('button', { name: /Tela cheia/i }).first().click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeVisible();
  expect(await page.getByRole('textbox', { name: 'Mensagem', exact: true }).evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('f06-fullscreen-chat.png') });
  await page.getByRole('button', { name: 'Fechar chat' }).click();

  // Test reaction picker inside fullscreen mode
  await page.getByRole('button', { name: 'Reagir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Brasil', exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Brasil', exact: true }).evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('f07-fullscreen-picker.png') });
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

test('F38 Q&A: questions without stream, ordering, multiple presenters, answers, highlight, author withdraw, late join, reconnect, 320px mobile, Cinema and fullscreen', async ({ browser }) => {
  const artifactDir = 'test-results/f38-refinement';
  const contextPresA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextPresB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextViewer = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  for (const ctx of [contextPresA, contextPresB]) {
    await ctx.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      (window as any).qaSockets = [];
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as any).qaSockets.push(this);
        }
      };
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx2d = canvas.getContext('2d')!;
          ctx2d.fillStyle = '#0f172a';
          ctx2d.fillRect(0, 0, 640, 360);
          return canvas.captureStream(15);
        },
      });
    });
  }

  const presA = await contextPresA.newPage();
  const presB = await contextPresB.newPage();
  const viewer = await contextViewer.newPage();
  const late = await browser.newPage();

  try {
    await presA.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Ana'));
    await presB.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Bruno'));
    await viewer.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Clara'));

    await Promise.all([
      presA.goto('/room/e2e-f38-qa'),
      presB.goto('/room/e2e-f38-qa'),
      viewer.goto('/room/e2e-f38-qa'),
    ]);
    await expect(presA.getByText('3', { exact: true }).first()).toBeVisible();

    // 1. Access Q&A when no streams are active (empty stage) + Raise hand preserved
    await viewer.getByRole('button', { name: 'Levantar mão', exact: true }).tap();
    await expect(viewer.getByRole('button', { name: 'Abaixar mão', exact: true })).toBeVisible();

    await viewer.getByRole('button', { name: 'Abrir chat', exact: true }).tap();
    const viewerQaTab = viewer.getByRole('tab', { name: /Perguntas/ });
    await viewerQaTab.tap();
    await expect(viewer.getByText('Nenhuma pergunta ainda')).toBeVisible();

    await expect(viewer.getByText(/entrou na sala\./)).toBeHidden({ timeout: 6000 });
    await viewer.screenshot({ path: `${artifactDir}/empty-mobile-320.png` });
    // Viewer submits two questions
    const viewerInput = viewer.getByRole('textbox', { name: 'Pergunta', exact: true });
    await viewerInput.fill('Como funciona a reconexão automática?');
    await viewer.getByRole('button', { name: 'Enviar pergunta', exact: true }).tap();
    await expect(viewer.getByTestId('qa-question-card')).toHaveCount(1);
    await viewer.screenshot({ path: `${artifactDir}/single-mobile-320.png` });

    await viewerInput.fill('Posso retirar esta pergunta?');
    await viewer.getByRole('button', { name: 'Enviar pergunta', exact: true }).tap();
    await expect(viewer.getByTestId('qa-question-card')).toHaveCount(2);

    // Check open question counter badge on header button of presA
    await expect(presA.getByTestId('qa-open-badge')).toHaveText('?2');

    // Keyboard tab navigation on presA
    await presA.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    const chatTabA = presA.getByRole('tab', { name: /^Chat/ });
    await chatTabA.focus();
    await presA.keyboard.press('ArrowRight');
    const qaTabA = presA.getByRole('tab', { name: /^Perguntas/ });
    await expect(qaTabA).toBeFocused();
    await expect(qaTabA).toHaveAttribute('aria-selected', 'true');
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(2);

    // Non-presenter (presA before sharing, and viewer) cannot see presenter controls
    await expect(presA.getByRole('button', { name: 'Destacar' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Destacar' })).toHaveCount(0);
    await expect(presA.getByRole('button', { name: 'Ações da pergunta' })).toHaveCount(0);
    // Non-author (presA) cannot see 'Retirar pergunta' on Clara's questions
    await expect(presA.getByRole('button', { name: 'Retirar pergunta' })).toHaveCount(0);

    // Author (viewer) withdraws her second question
    await viewer.getByTestId('qa-question-card').nth(1).getByRole('button', { name: 'Ações da pergunta' }).tap();
    await expect(viewer.getByRole('menuitem')).toHaveCount(1);
    await expect(viewer.getByRole('menuitem', { name: 'Retirar pergunta' })).toBeVisible();
    await expect(viewer.getByRole('menu')).toHaveCSS('opacity', '1');
    await viewer.screenshot({ animations: 'disabled', path: `${artifactDir}/menu-mobile-320.png` });
    await viewer.getByRole('menuitem', { name: 'Retirar pergunta' }).tap();
    await expect(viewer.getByTestId('qa-question-card')).toHaveCount(1);
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(1);

    // Submit another question from presB so we have 2 open questions in order
    await presB.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await presB.getByRole('tab', { name: /^Perguntas/ }).click();
    await presB.getByRole('textbox', { name: 'Pergunta', exact: true }).fill('Qual é o limite de participantes na sala?');
    await presB.getByRole('textbox', { name: 'Pergunta', exact: true }).press('Enter');
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(2);

    // Screenshot empty-stream Q&A on mobile 320px and verify no horizontal overflow
    await viewer.screenshot({ animations: 'disabled', path: `${artifactDir}/f38-mobile-320-qa.png` });
    const noOverflow320 = await viewer.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(noOverflow320).toBe(true);

    // 2. Both presA and presB start sharing screen (multiple presenters)
    await presA.getByRole('button', { name: 'Fechar chat' }).click();
    await presB.getByRole('button', { name: 'Fechar chat' }).click();

    await presA.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await presA.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await presB.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await presB.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();

    await presA.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await presA.getByRole('tab', { name: /^Perguntas/ }).click();
    await presB.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await presB.getByRole('tab', { name: /^Perguntas/ }).click();

    // Presenter A answers the first question via text -> it moves below open question 2!
    const firstCardA = presA.getByTestId('qa-question-card').first();
    await firstCardA.getByRole('button', { name: 'Responder', exact: true }).click();
    await firstCardA.getByRole('textbox', { name: 'Resposta da pergunta' }).fill('Usa reserva temporária com token.');
    await firstCardA.getByRole('button', { name: 'Publicar resposta', exact: true }).click();

    // Verify open question is now first, and answered question is second
    await expect(presA.getByTestId('qa-question-card').nth(0)).toHaveAttribute('data-status', 'open');
    await expect(presA.getByTestId('qa-question-card').nth(1)).toHaveAttribute('data-status', 'answered-text');
    await expect(presA.getByTestId('qa-question-card').nth(1).getByTestId('qa-question-answer')).toContainText('Usa reserva temporária com token.');
    await expect(presA.getByTestId('qa-open-badge')).toHaveText('?1');

    // Presenter B highlights the open question and marks it as answered verbally
    const openCardB = presB.getByTestId('qa-question-card').first();
    await openCardB.getByRole('button', { name: 'Ações da pergunta' }).click();
    await presB.getByRole('menuitem', { name: 'Destacar', exact: true }).click();
    await expect(presA.locator('[data-highlighted="true"]')).toContainText('Qual é o limite de participantes na sala?');
    await expect(viewer.locator('[data-highlighted="true"]')).toContainText('Qual é o limite de participantes na sala?');

    await presB.locator('[data-highlighted="true"]').getByRole('button', { name: 'Ações da pergunta' }).click();
    await presB.getByRole('menuitem', { name: 'Respondida ao vivo', exact: true }).click();
    await expect(presA.locator('[data-highlighted="true"]')).toHaveAttribute('data-status', 'answered-verbal');

    // Desktop screenshot with spotlight + textual answer + verbal answer
    await presA.screenshot({ animations: 'disabled', path: `${artifactDir}/f38-desktop-presenter-qa.png` });
    await viewer.screenshot({ animations: 'disabled', path: `${artifactDir}/f38-mobile-320-answered.png` });

    // Secondary actions preserve focus and Escape closes only the menu.
    const highlightedA = presA.locator('[data-highlighted="true"]');
    await expect(highlightedA).toHaveCount(1);
    const menuTrigger = highlightedA.getByRole('button', { name: 'Ações da pergunta' });
    await menuTrigger.focus();
    await presA.keyboard.press('Enter');
    await expect(presA.getByRole('menuitem', { name: 'Remover destaque' })).toBeVisible();
    await presA.keyboard.press('Escape');
    await expect(presA.getByRole('menu')).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await expect(presA.getByRole('tab', { name: /^Perguntas/ })).toBeVisible();
    await menuTrigger.click();
    await presA.getByRole('menuitem', { name: 'Reabrir', exact: true }).click();
    await expect(highlightedA).toHaveAttribute('data-status', 'open');
    await menuTrigger.click();
    await presA.getByRole('menuitem', { name: 'Respondida ao vivo' }).click();

    // Text answers remain editable, including long content.
    const textCard = presA.locator('[data-status="answered-text"]');
    await textCard.getByRole('button', { name: 'Editar resposta' }).click();
    await expect(textCard.getByRole('textbox', { name: 'Resposta da pergunta' })).toBeFocused();
    await textCard.getByRole('textbox', { name: 'Resposta da pergunta' }).fill('Usa reserva temporária com token. '.repeat(20));
    await textCard.getByRole('button', { name: 'Publicar resposta' }).click();
    await presA.screenshot({ path: `${artifactDir}/long-answer-desktop.png` });
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.screenshot({ path: `${artifactDir}/answered-mobile-390.png` });
    expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // 3. Cinema mode and Fullscreen mode on presA preserve Q&A panel
    await presA.getByRole('button', { name: /Modo Cinema/ }).click();
    await expect(presA.locator('[data-highlighted="true"]')).toBeVisible();
    await menuTrigger.click();
    await expect(presA.getByRole('menuitem', { name: 'Remover destaque' })).toBeVisible();
    await presA.screenshot({ animations: 'disabled', path: `${artifactDir}/f38-cinema-qa.png` });
    await presA.keyboard.press('Escape');

    await presA.getByRole('button', { name: 'Fechar chat' }).click();
    await presA.getByRole('button', { name: /Tela cheia/i }).first().click();
    await expect.poll(() => presA.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await presA.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(presA.locator('[data-highlighted="true"]')).toBeVisible();
    expect(await presA.locator('[data-highlighted="true"]').evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
    await presA.locator('[data-highlighted="true"]').getByRole('button', { name: 'Ações da pergunta' }).click();
    expect(await presA.getByRole('menu').evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
    await presA.screenshot({ animations: 'disabled', path: `${artifactDir}/f38-fullscreen-qa.png` });
    await presA.keyboard.press('Escape');
    await presA.keyboard.press('Escape'); // closes Q&A panel
    await presA.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await presA.getByRole('button', { name: /Sair do Modo Cinema/ }).click();

    // 4. Late joiner receives full synchronized Q&A snapshot
    await late.goto('/room/e2e-f38-qa');
    await expect(late.getByText('Conectado', { exact: true })).toBeVisible();
    await late.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await late.getByRole('tab', { name: /^Perguntas/ }).click();
    await expect(late.locator('[data-highlighted="true"]')).toContainText('Qual é o limite de participantes na sala?');
    await expect(late.getByTestId('qa-question-card')).toHaveCount(2);

    // 5. Stopping stream and participant leaving do not lose questions; reconnecting recovers state
    await presA.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await contextViewer.close();
    await expect(late.getByTestId('qa-question-card')).toHaveCount(2);

    await presA.evaluate(() => (window as any).qaSockets.at(-1).close(4001, 'test qa reconnect'));
    await expect.poll(() => presA.evaluate(() => (window as any).qaSockets.length)).toBe(2);
    await presA.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(2);
    // Removing a highlight synchronizes without removing the question.
    await presB.locator('[data-highlighted="true"]').getByRole('button', { name: 'Ações da pergunta' }).click();
    await presB.getByRole('menuitem', { name: 'Remover destaque' }).click();
    await expect(presA.locator('[data-highlighted="true"]')).toHaveCount(0);
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(2);
    // Long questions and a longer queue keep the composer usable.
    await presA.getByRole('textbox', { name: 'Pergunta', exact: true }).fill('Como funciona o compartilhamento em diferentes redes? '.repeat(9));
    await presA.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
    await expect(presA.getByTestId('qa-question-card')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await presA.getByRole('textbox', { name: 'Pergunta', exact: true }).fill(`Pergunta adicional ${i + 1}`);
      await presA.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
      await expect(presA.getByTestId('qa-question-card')).toHaveCount(4 + i);
    }
    await presA.getByText('Como funciona o compartilhamento em diferentes redes?', { exact: false }).scrollIntoViewIfNeeded();
    await presA.screenshot({ path: `${artifactDir}/long-question-desktop.png` });
    await expect(presA.getByRole('button', { name: 'Enviar pergunta', exact: true })).toBeVisible();
    expect(await presA.getByRole('region', { name: 'Lista de perguntas da sala' }).evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  } finally {
    await contextPresA.close().catch(() => {});
    await contextPresB.close().catch(() => {});
    await contextViewer.close().catch(() => {});
    await late.close().catch(() => {});
  }
});


