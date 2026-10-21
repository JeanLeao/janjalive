import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gotoRoom } from './fixtures/rooms';
import { videoFile } from './fixtures/watch-video';

// Opt-in captures live outside Git; normal runs retain evidence in test-results.
const evidence = process.env.F14_EVIDENCE_DIR;
async function capture(page: Page, name: string) {
  const path = evidence ? resolve(evidence, `${name}.png`) : test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const panel = page.getByRole('region', { name: 'Watch Party', exact: true });
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
}

test('F14 UI: responsive preparation, consent, player, availability and stage modes', async ({ browser }) => {
  test.setTimeout(120000);
  if (evidence) await mkdir(evidence, { recursive: true });
  const host = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const a = await host.newPage(), b = await guest.newPage();
    // Hold binary frames to capture an actual receiving state, preserving wire order.
    await a.addInitScript(() => {
      const native = RTCDataChannel.prototype.send;
      (window as any).holdWatchFrames = true;
      const queue: Array<() => void> = [];
      let firstFrame = true;
      RTCDataChannel.prototype.send = function (data: any) {
        if (firstFrame && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) { firstFrame = false; native.call(this, data as any); return; }
        if ((window as any).holdWatchFrames && (data instanceof ArrayBuffer || ArrayBuffer.isView(data) || queue.length)) {
          const channel = this; queue.push(() => native.call(channel, data));
        } else native.call(this, data);
      };
      (window as any).releaseWatchFrames = () => {
        (window as any).holdWatchFrames = false;
        for (const send of queue.splice(0)) send();
      };
    });
    await Promise.all([a, b].map((p, i) => gotoRoom(p, `/room/f14-ui?name=${i ? 'Marina' : 'Rafael'}`)));
    await Promise.all([a, b].map(p => p.getByRole('button', { name: /^Watch Party/ }).click()));
    for (const width of [1280, 768, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await noOverflow(a);
      await capture(a, `empty-${width}`);
    }
    await a.setViewportSize({ width: 1280, height: 900 });
    const horizontal = await videoFile(a);
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Uma viagem pela costa.webm', mimeType: 'video/webm', buffer: horizontal });
    await expect(a.getByTestId('watch-video')).toBeVisible();
    await expect(b.getByRole('button', { name: 'Aceitar vídeo', exact: true })).toBeVisible();
    await capture(b, 'invitation-mobile');
    await b.getByRole('button', { name: 'Aceitar vídeo', exact: true }).tap();
    await expect(b.getByRole('heading', { name: 'Transferindo' })).toBeVisible();
    await expect(b.getByTestId('watch-video')).toHaveCount(0);
    await capture(b, 'transfer-mobile');
    await capture(a, 'transfer-controller');
    await a.evaluate(() => (window as any).releaseWatchFrames());
    await expect(b.getByTestId('watch-video')).toBeVisible();
    await expect(a.getByText('1/1 prontos')).toBeVisible();
    await expect(b.getByLabel('Posição do vídeo')).toBeDisabled();
    await b.getByRole('button', { name: 'Silenciar vídeo', exact: true }).tap();
    expect(await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await b.getByRole('button', { name: 'Ativar som do vídeo', exact: true }).tap();
    const volume = (await b.getByLabel('Volume do vídeo').boundingBox())!;
    expect(volume.height).toBeGreaterThanOrEqual(44);
    await b.touchscreen.tap(volume.x + volume.width * .3, volume.y + volume.height / 2);
    expect(await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.volume)).toBeLessThan(.8);
    await expect(b.getByRole('button', { name: 'Reproduzir para todos' })).toHaveCount(0);
    for (const width of [1280, 768, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await noOverflow(a);
      await capture(a, `horizontal-paused-${width}`);
    }
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.locator('summary[aria-label="Disponibilidade dos participantes"]').scrollIntoViewIfNeeded();
    await capture(a, 'participants-desktop');
    await a.setViewportSize({ width: 320, height: 844 });
    await a.locator('summary[aria-label="Disponibilidade dos participantes"]').scrollIntoViewIfNeeded();
    await capture(a, 'participants-320');
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.getByRole('button', { name: 'Reproduzir para todos' }).focus();
    await a.keyboard.press('Enter');
    await expect.poll(() => a.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.5);
    await capture(a, 'horizontal-playing-desktop');
    await a.getByRole('button', { name: 'Pausar para todos' }).click();
    await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('waiting')));
    await expect(b.getByRole('status').filter({ hasText: 'Carregando neste dispositivo' })).toBeVisible();
    await capture(b, 'buffering-mobile');
    await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => {
      const native = v.play.bind(v); let reject = true;
      v.play = () => reject ? (reject = false, Promise.reject(new DOMException('blocked', 'NotAllowedError'))) : native();
    });
    await a.getByRole('button', { name: 'Reproduzir para todos' }).click();
    await expect(b.getByRole('button', { name: 'Ativar reprodução neste dispositivo' })).toBeVisible();
    await capture(b, 'blocked-mobile');
    await b.getByRole('button', { name: 'Ativar reprodução neste dispositivo' }).tap();
    await a.getByRole('button', { name: 'Pausar para todos' }).click();
    await a.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await capture(a, 'cinema-desktop');
    await a.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
    await a.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => a.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await capture(a, 'fullscreen-desktop');
    await a.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
    await a.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
    await capture(a, 'chat-desktop');
    await a.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    await a.getByRole('button', { name: 'Encerrar Watch Party' }).click();
    const vertical = await videoFile(a, 'video/webm;codecs=vp8', false, true);
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Uma viagem em retrato.webm', mimeType: 'video/webm', buffer: vertical });
    await expect(a.getByTestId('watch-video')).toBeVisible();
    for (const width of [1280, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await noOverflow(a);
      const stage = (await a.locator('.stage-main-container').boundingBox())!;
      for (const control of [a.getByRole('button', { name: 'Reproduzir para todos' }), a.getByRole('button', { name: 'Silenciar vídeo', exact: true }), a.getByLabel('Posição do vídeo'), a.getByLabel('Volume do vídeo')]) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(stage.y);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(stage.y + stage.height);
      }
      await capture(a, `vertical-${width}`);
    }
    await b.getByRole('button', { name: 'Recusar vídeo', exact: true }).tap();
    await capture(b, 'declined-mobile');
    await a.getByRole('button', { name: 'Encerrar Watch Party' }).click();
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'incompatível.webm', mimeType: 'video/webm', buffer: Buffer.from('invalid') });
    await expect(a.getByRole('alert').filter({ hasText: /Codec|decodificar/ })).toBeVisible();
    await expect.poll(async () => {
      const alert = (await a.getByRole('alert').filter({ hasText: /Codec|decodificar/ }).boundingBox())!;
      const stage = (await a.locator('.stage-main-container').boundingBox())!;
      return alert.y >= stage.y && alert.y + alert.height <= stage.y + stage.height;
    }).toBe(true);
    await capture(a, 'error-320');
    await a.getByRole('button', { name: 'Voltar às transmissões' }).click();
    await expect(a.getByRole('button', { name: /^Watch Party/ })).toBeFocused();
    await capture(a, 'return-320');
  } finally { await host.close(); await guest.close(); }
});
