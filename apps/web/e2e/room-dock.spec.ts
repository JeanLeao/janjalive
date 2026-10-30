import { test, expect } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import { videoFile } from './fixtures/watch-video';

for (const width of [1280, 768, 390, 320]) {
  test(`room dock preference and keyboard at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    try {
      const page = await context.newPage();
      await gotoRoom(page, '/room/dock');
      await expect(page.getByRole('button', { name: 'Mostrar controles da sala', exact: true })).toBeHidden();
      await page.getByRole('button', { name: 'Assistir vídeo com a sala' }).click();
      await page.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Vídeo claro.webm', mimeType: 'video/webm', buffer: await videoFile(page, 'video/webm;codecs=vp8', false, false, true) });
      await expect(page.getByTestId('watch-video')).toBeVisible();
      const toggle = page.locator('.dock-toggle');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('.floating-dock-bar')).toBeHidden();
      const bounds = (await toggle.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.getByRole('button', { name: 'Voltar às transmissões' }).click();
      await expect(page.locator('.floating-dock-bar')).toBeVisible();
      await page.locator('[data-control-id="watch-party"]').click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      if (width < 500) await toggle.tap(); else await toggle.click();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
      await expect(toggle).toBeInViewport();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.screenshot({ path: test.info().outputPath(`dock-${width}.png`) });
    } finally { await context.close(); }
  });
}

test('spectator capture request, pause, stop and Cinema preserve dock preference', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    for (const context of [hostContext, viewerContext]) await context.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        if ((window as any).deferCapture) await new Promise(resolve => { (window as any).resolveCapture = resolve; });
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const timer = setInterval(() => { const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 360); }, 50);
        const stream = canvas.captureStream(20);
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
        return stream;
      };
    });
    const host = await hostContext.newPage(), viewer = await viewerContext.newPage();
    await gotoRoom(host, '/room/dock-capture');
    await gotoRoom(viewer, '/room/dock-capture');
    await viewer.getByRole('button', { name: 'Configurações e convite', exact: true }).click();
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    const toggle = viewer.locator('.dock-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await viewer.keyboard.press('Escape');
    await expect(viewer.getByRole('button', { name: 'Configurações e convite', exact: true })).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await viewer.getByRole('button', { name: 'Abrir chat', exact: true }).first().focus();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await viewer.locator('[data-control-id="cinema-toggle"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await viewer.locator('[data-control-id="cinema-toggle"]').click();
    await toggle.click();
    await viewer.evaluate(() => { (window as any).deferCapture = true; });
    await viewer.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await expect(viewer.getByRole('button', { name: 'Cancelar captura', exact: true })).toBeVisible();
    await expect(toggle).toBeHidden();
    await viewer.evaluate(() => { (window as any).resolveCapture(); });
    await viewer.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await viewer.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
    await expect(toggle).toBeHidden();
    await viewer.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewer.locator('.floating-dock-bar')).toBeVisible();
    await expect(toggle).toBeHidden();
  } finally { await hostContext.close(); await viewerContext.close(); }
});
