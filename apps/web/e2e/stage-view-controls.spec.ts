import { test, expect } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import { videoFile } from './fixtures/watch-video';

for (const width of [1280, 390, 320]) {
  test(`shared video rail, keyboard, touch and chat at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    try {
      const page = await context.newPage();
      await gotoRoom(page, '/room/shared-controls');
      await page.getByRole('button', { name: 'Assistir vídeo com a sala' }).click();
      const stage = page.getByRole('region', { name: 'Vídeo compartilhado', exact: true });
      const rail = stage.getByRole('group', { name: 'Visualização do vídeo compartilhado' });
      const toggle = rail.locator('[data-control-id="tools-toggle"]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(stage.locator('[class*=stageTopbar]')).toHaveCount(0);
      await rail.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await expect(rail.locator('[data-control-id="cinema-toggle"]')).toHaveAttribute('aria-pressed', 'true');
      await rail.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
      await toggle.focus(); await page.keyboard.press('Enter');
      await expect(toggle).toBeFocused();
      await expect(rail.getByRole('button')).toHaveCount(1);
      await page.getByRole('button', { name: 'Voltar às transmissões' }).click();
      await page.getByRole('button', { name: 'Assistir vídeo com a sala' }).click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      if (width < 500) await toggle.tap(); else await toggle.click();
      await rail.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect(rail.locator('[data-control-id="fullscreen-toggle"]')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => stage.evaluate(el => document.fullscreenElement === el)).toBe(true);
      await toggle.click();
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); return document.exitFullscreen(); });
      await expect(toggle).toBeFocused();
      await toggle.click();
      await page.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Vídeo claro.webm', mimeType: 'video/webm', buffer: await videoFile(page) });
      await expect(page.getByTestId('watch-video')).toBeVisible();
      await expect(page.getByRole('button', { name: /Participantes da sessão/ })).toBeVisible();
      await page.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
      await expect.poll(async () => {
        const r = (await rail.boundingBox())!, c = (await page.locator('#room-chat-panel').boundingBox())!;
        return r.x + r.width <= c.x || r.x >= c.x + c.width;
      }).toBe(true);
      await page.getByRole('button', { name: /Participantes da sessão/ }).click();
      await expect(page.getByRole('dialog', { name: 'Participantes do vídeo' })).toBeVisible();
      await page.getByRole('button', { name: 'Fechar participantes' }).click();
      await expect(page.getByRole('dialog', { name: 'Participantes do vídeo' })).toBeHidden();
      for (const control of await rail.getByRole('button').all()) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        const playback = (await page.getByRole('region', { name: 'Controles de reprodução do vídeo' }).boundingBox())!;
        const dock = (await page.locator('.floating-dock-wrapper').boundingBox())!;
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(playback.y);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(dock.y);
      }
      await page.screenshot({ path: test.info().outputPath(`rail-chat-${width}.png`) });
      await rail.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      const assertContextualLayout = async () => {
        await expect.poll(() => stage.evaluate(el => {
          const filename = el.querySelector('[class*=videoMetaPill]')!.getBoundingClientRect();
          const actions = el.querySelector('[class*=stageAccess]')!.getBoundingClientRect();
          return filename.right <= actions.left || filename.bottom <= actions.top;
        })).toBe(true);
        await page.getByRole('button', { name: /Participantes da sessão/ }).click();
        await expect(page.getByRole('dialog', { name: 'Participantes do vídeo' })).toBeVisible();
        await page.getByRole('button', { name: 'Fechar participantes' }).click();
        await expect(page.getByRole('dialog', { name: 'Participantes do vídeo' })).toBeHidden();
      };
      await assertContextualLayout();
      await page.screenshot({ path: test.info().outputPath(`rail-cinema-chat-${width}.png`) });
      await rail.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
      await rail.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await assertContextualLayout();
      await rail.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      await page.getByRole('button', { name: 'Fechar chat', exact: true }).click();
      await page.screenshot({ path: test.info().outputPath(`rail-${width}.png`) });
    } finally { await context.close(); }
  });
}
