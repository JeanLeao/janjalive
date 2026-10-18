import { test, expect } from '@playwright/test';

const artifacts = '../../screenshots/f38-polls';

test('polls: presenting, voting, touch, keyboard, history, reconnect, Cinema and fullscreen', async ({ browser }) => {
  const presenterContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const viewerContext = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  for (const context of [presenterContext, viewerContext]) await context.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    (window as any).pollSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols); (window as any).pollSockets.push(this);
      }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === 'string' && (window as any).holdPoll && JSON.parse(data).type === 'vote-poll') {
          (window as any).releasePoll = () => super.send(data);
          return;
        }
        super.send(data);
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 640, 360);
      return canvas.captureStream(15);
    } });
  });
  const p = await presenterContext.newPage(), v = await viewerContext.newPage();
  const lateContext = await browser.newContext(); const late = await lateContext.newPage();
  const room = `/room/polls-${Date.now()}`;
  try {
    await Promise.all([p.goto(room), v.goto(room)]);
    await expect(p.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(v.getByRole('button', { name: 'Levantar mão', exact: true })).toBeEnabled();
    await v.getByRole('button', { name: 'Abrir chat', exact: true }).tap();
    await v.getByRole('tab', { name: /Enquetes/ }).tap();
    await expect(v.getByText('Nenhuma enquete aberta')).toBeVisible();
    await expect(v.getByRole('form', { name: 'Criar enquete' })).toHaveCount(0);
    await v.screenshot({ animations: 'disabled', path: `${artifacts}/empty-mobile-320.png` });
    await p.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await p.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await p.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    const chatTab = p.getByRole('tab', { name: /^Chat/ }); await chatTab.focus();
    await p.keyboard.press('End');
    await expect(p.getByRole('tab', { name: /Enquetes/ })).toBeFocused();
    await p.keyboard.press('ArrowRight'); await expect(chatTab).toBeFocused();
    await p.keyboard.press('ArrowLeft'); await expect(p.getByRole('tab', { name: /Enquetes/ })).toBeFocused();
    await p.getByRole('textbox', { name: 'Pergunta da enquete' }).fill('Qual tema vamos explorar na próxima apresentação?');
    await p.getByRole('textbox', { name: 'Alternativa 1', exact: true }).fill('Conectividade e reconexão');
    await p.getByRole('textbox', { name: 'Alternativa 2', exact: true }).fill('Qualidade de áudio e vídeo');
    await p.getByRole('button', { name: 'Adicionar alternativa' }).click();
    await p.getByRole('textbox', { name: 'Alternativa 3', exact: true }).fill('Privacidade nas salas efêmeras');
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/create-desktop.png` });
    await p.getByRole('button', { name: 'Criar enquete', exact: true }).click();
    await expect(p.getByTestId('poll-card')).toBeVisible();
    await expect(p.getByText('0 votos · Resultados ao vivo')).toBeVisible();
    await expect(v.getByTestId('poll-open-indicator')).toBeVisible();
    await expect(v.getByText('Vote para acompanhar os resultados ao vivo.')).toBeVisible();
    await expect(v.getByRole('button', { name: 'Votar', exact: true })).toBeDisabled();
    await v.getByRole('radio', { name: 'Qualidade de áudio e vídeo' }).tap();
    await v.evaluate(() => (window as any).holdPoll = true);
    await v.getByRole('button', { name: 'Votar', exact: true }).tap();
    await expect(v.getByText('Enviando ação…')).toBeVisible();
    await v.screenshot({ animations: 'disabled', path: `${artifacts}/pending-mobile-320.png` });
    await v.evaluate(() => { (window as any).holdPoll = false; (window as any).releasePoll(); });
    await expect(v.getByText('Seu voto')).toBeVisible();
    await expect(p.getByText('1 voto · Resultados ao vivo')).toBeVisible();
    await v.screenshot({ animations: 'disabled', path: `${artifacts}/results-mobile-320.png` });
    expect(await v.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const optionBox = await v.locator('label').filter({ has: v.getByRole('radio') }).first().boundingBox();
    expect(optionBox!.height).toBeGreaterThanOrEqual(44);
    await v.getByRole('radio', { name: 'Conectividade e reconexão' }).tap();
    await v.getByRole('button', { name: 'Alterar voto', exact: true }).tap();
    await expect(v.getByRole('radio').first()).toBeChecked();
    await p.getByRole('radio').nth(2).check(); await p.getByRole('button', { name: 'Votar', exact: true }).click();
    await expect(p.getByText('2 votos · Resultados ao vivo')).toBeVisible();
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/results-desktop.png` });
    // Live updates and own vote survive a valid reconnect.
    await viewerContext.setOffline(true);
    await v.evaluate(() => (window as any).pollSockets.at(-1).close(4001, 'test reconnect'));
    await expect(v.getByText('Sem conexão. Aguarde a reconexão para participar.')).toBeVisible();
    await v.screenshot({ animations: 'disabled', path: `${artifacts}/disconnected-mobile-320.png` });
    await viewerContext.setOffline(false);
    await expect.poll(() => v.evaluate(() => (window as any).pollSockets.length)).toBe(2);
    await expect(v.getByText('2 votos · Resultados ao vivo')).toBeVisible();
    await expect(v.getByRole('radio').first()).toBeChecked();
    // Late entry gets the open poll, without seeing results before voting.
    await late.goto(room); await expect(late.getByText('Conectado', { exact: true })).toBeVisible();
    await late.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await late.getByRole('tab', { name: /Enquetes/ }).click();
    await expect(late.getByText('Vote para acompanhar os resultados ao vivo.')).toBeVisible();
    await late.getByRole('radio').nth(1).check(); await late.getByRole('button', { name: 'Votar', exact: true }).click();
    await expect(p.getByText('3 votos · Resultados ao vivo')).toBeVisible();
    await p.getByRole('button', { name: /Modo Cinema/ }).click();
    await expect(p.getByTestId('poll-card')).toBeVisible();
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/cinema-desktop.png` });
    await p.getByRole('button', { name: 'Fechar chat' }).click();
    await p.getByRole('button', { name: /Tela cheia/i }).first().click();
    await expect.poll(() => p.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await p.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    expect(await p.getByTestId('poll-card').evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
    await expect(p.locator('#room-chat-panel')).toHaveCSS('transform', 'none');
    await expect(p.getByTestId('poll-card')).toBeVisible();
    await p.getByRole('tab', { name: /Enquetes/ }).focus();
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/fullscreen-desktop.png` });
    await p.keyboard.press('Escape');
    await expect(p.getByRole('button', { name: 'Abrir chat', exact: true })).toBeFocused();
    await p.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await p.getByRole('button', { name: /Sair do Modo Cinema/ }).click();
    await p.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await p.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await expect(p.getByText('Aberta', { exact: true })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Encerrar enquete' })).toHaveCount(0);
    // Re-starting presentation grants the same controls, without a page reload.
    await p.getByRole('button', { name: 'Fechar chat' }).click();
    await p.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await p.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await p.getByRole('button', { name: 'Abrir chat', exact: true }).click();
    await p.getByRole('button', { name: 'Encerrar enquete' }).click();
    await expect(v.getByTestId('poll-open-indicator')).toHaveCount(0);
    await v.locator('summary').filter({ hasText: 'Qual tema vamos explorar na próxima apresentação?' }).click();
    await expect(v.getByText('Encerrada · resultado final')).toBeVisible();
    await expect(v.getByText('3 votos', { exact: true })).toBeVisible();
    await expect(v.getByText(/entrou na sala\./)).toBeHidden({ timeout: 6000 });
    await v.screenshot({ animations: 'disabled', path: `${artifacts}/history-mobile-320.png` });
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/history-desktop.png` });
    // The creation form also fits a 320px touch viewport, including five alternatives.
    await p.setViewportSize({ width: 320, height: 740 });
    await p.getByRole('textbox', { name: 'Pergunta da enquete' }).fill('Uma pergunta longa '.repeat(14));
    for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Adicionar alternativa' }).click();
    await p.getByRole('textbox', { name: 'Alternativa 5', exact: true }).fill('Alternativa com texto longo '.repeat(4));
    await p.getByRole('button', { name: 'Criar enquete', exact: true }).scrollIntoViewIfNeeded();
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.screenshot({ animations: 'disabled', path: `${artifacts}/create-mobile-320.png` });
  } finally { await presenterContext.close(); await viewerContext.close(); await lateContext.close(); }
});
