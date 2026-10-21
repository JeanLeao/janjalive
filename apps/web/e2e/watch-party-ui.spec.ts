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
  await expect.poll(async () => {
    const docOk = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    const panel = page.locator('.stage-main-container, .stage-empty-container').first();
    const panelOk = await panel.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth && [...el.querySelectorAll('[class*=prepBox], [class*=stagecard], [aria-label="Controles de reprodução do vídeo"]')].every(card => {
        const rect = card.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right &&
          (card.getAttribute('aria-label') !== 'Controles de reprodução do vídeo' || (rect.top >= bounds.top && rect.bottom <= bounds.bottom));
      });
    });
    return docOk && panelOk;
  }).toBe(true);
}

async function captureWidths(page: Page, name: string) {
  const original = page.viewportSize()!;
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await noOverflow(page);
    await capture(page, `${name}-${width}`);
  }
  await page.setViewportSize(original);
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
    await expect(a.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await expect(a.getByText(/entrou na sala\./)).toHaveCount(0);
    await capture(a, 'incumbent-room-desktop');
    await capture(b, 'incumbent-room-mobile');
    await Promise.all([a, b].map(p => p.getByRole('button', { name: /Assistir vídeo com a sala|Vídeo compartilhado/ }).click()));
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
    await captureWidths(b, 'invitation');
    await b.getByRole('button', { name: 'Aceitar vídeo', exact: true }).tap();
    await expect(b.getByRole('heading', { name: 'Transferindo vídeo' })).toBeVisible();
    await expect(b.getByTestId('watch-video')).toHaveCount(0);
    await captureWidths(b, 'transfer');
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
    await captureWidths(b, 'viewer');
    await b.setViewportSize({ width: 320, height: 844 });
    await b.getByRole('button', { name: 'Voltar às transmissões' }).tap();
    await expect(b.getByRole('button', { name: 'Vídeo compartilhado', exact: true })).toHaveCount(1);
    await capture(b, 'active-session-streams-320');
    await b.getByRole('button', { name: 'Vídeo compartilhado', exact: true }).tap();
    await expect(b.getByTestId('watch-video')).toBeVisible();
    await b.setViewportSize({ width: 390, height: 844 });
    for (const width of [1280, 768, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await noOverflow(a);
      await capture(a, `horizontal-paused-${width}`);
    }
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.getByRole('button', { name: /Participantes da sessão/ }).click();
    await expect(a.getByRole('dialog', { name: 'Participantes do vídeo' })).toBeVisible();
    await captureWidths(a, 'participants');
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.getByRole('button', { name: 'Fechar participantes' }).click();
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
    await captureWidths(a, 'cinema');
    await a.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
    // Chromium requires leaving native fullscreen before resizing its window.
    for (const width of [1280, 768, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await a.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => a.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await noOverflow(a);
      await capture(a, `fullscreen-${width}`);
      await a.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      await expect.poll(() => a.evaluate(() => !!document.fullscreenElement)).toBe(false);
    }
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
    await captureWidths(a, 'chat');
    await a.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    await a.getByRole('button', { name: /Participantes da sessão/ }).click();
    await a.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
    await a.getByRole('button', { name: 'Confirmar encerramento' }).click();
    const vertical = await videoFile(a, 'video/webm;codecs=vp8', false, true);
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Uma viagem em retrato.webm', mimeType: 'video/webm', buffer: vertical });
    await expect(a.getByTestId('watch-video')).toBeVisible();
    for (const width of [1280, 768, 390, 320]) {
      await a.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await noOverflow(a);
      const stage = (await a.locator('.stage-main-container').boundingBox())!;
      const metadata = (await a.locator('[class*=videoMetaPill]').boundingBox())!;
      const media = (await a.getByTestId('watch-video').boundingBox())!;
      expect(media.y).toBeGreaterThanOrEqual(metadata.y + metadata.height);
      for (const control of [a.getByRole('button', { name: 'Reproduzir para todos' }), a.getByRole('button', { name: 'Silenciar vídeo', exact: true }), a.getByLabel('Posição do vídeo'), a.getByLabel('Volume do vídeo'), a.getByRole('status').filter({ hasText: 'Pausado para a sala' })]) {
        const bounds = (await control.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(stage.y);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(stage.y + stage.height);
      }
      await capture(a, `vertical-${width}`);
      if (width === 1280) {
        await a.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
        await expect.poll(async () => {
          const chat = (await a.locator('#room-chat-panel').boundingBox())!;
          const media = (await a.getByTestId('watch-video').boundingBox())!;
          return media.y >= stage.y && media.y + media.height <= stage.y + stage.height && media.x + media.width <= chat.x;
        }).toBe(true);
        await capture(a, 'vertical-chat-desktop');
        await a.getByRole('button', { name: 'Fechar chat', exact: true }).click();
      }
    }
    await b.getByRole('button', { name: 'Recusar vídeo', exact: true }).tap();
    await capture(b, 'declined-mobile');
    await a.getByRole('button', { name: /Participantes da sessão/ }).click();
    await a.getByRole('button', { name: 'Convidar participantes indisponíveis' }).click();
    await b.getByRole('button', { name: 'Aceitar vídeo', exact: true }).tap();
    await expect(b.getByTestId('watch-video')).toBeVisible();
    await captureWidths(b, 'vertical-viewer');
    await a.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
    await a.getByRole('button', { name: 'Confirmar encerramento' }).click();
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'incompatível.webm', mimeType: 'video/webm', buffer: Buffer.from('invalid') });
    await expect(a.getByRole('alert').filter({ hasText: /Codec|decodificar/ })).toBeVisible();
    await expect.poll(async () => {
      const alert = (await a.getByRole('alert').filter({ hasText: /Codec|decodificar/ }).boundingBox())!;
      const stage = (await a.locator('.stage-main-container').boundingBox())!;
      return alert.y >= stage.y && alert.y + alert.height <= stage.y + stage.height;
    }).toBe(true);
    await capture(a, 'error-320');
    await a.getByRole('button', { name: 'Voltar às transmissões' }).click();
    await expect(a.getByRole('button', { name: /Assistir vídeo com a sala|Vídeo compartilhado/ })).toBeFocused();
    await captureWidths(a, 'return');
  } finally { await host.close(); await guest.close(); }
});


test('F14 UI: solo participants, compact labels and end confirmation', async ({ page }) => {
  if (evidence) await mkdir(evidence, { recursive: true });
  await gotoRoom(page, '/room/f14-solo-ui?name=Rafael');
  await page.getByRole('button', { name: 'Assistir vídeo com a sala', exact: true }).click();
  await page.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Costa.webm', mimeType: 'video/webm', buffer: await videoFile(page) });
  await expect(page.getByTestId('watch-video')).toBeVisible();
  await page.getByRole('button', { name: /Participantes da sessão/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Participantes do vídeo' });
  await expect(drawer.getByText(/Só você por enquanto/)).toBeVisible();
  await expect(drawer.getByText('0/0 prontos')).toHaveCount(0);
  await capture(page, 'solo-participants-desktop');
  await drawer.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
  await expect(drawer.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer.getByRole('button', { name: 'Encerrar vídeo compartilhado' })).toBeFocused();
  await drawer.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
  await capture(page, 'end-confirmation-desktop');
  await page.setViewportSize({ width: 320, height: 844 });
  await noOverflow(page);
  await capture(page, 'end-confirmation-320');
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await drawer.getByRole('button', { name: 'Confirmar encerramento' }).click();
  await expect(page.getByTestId('watch-video')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Escolha um vídeo' })).toBeVisible();
});


test('F14 UI: several spectators and controls against bright video', async ({ browser }) => {
  test.setTimeout(60000);
  if (evidence) await mkdir(evidence, { recursive: true });
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
  try {
    const [host, ready, declined, waiting] = await Promise.all(contexts.map(context => context.newPage()));
    await Promise.all([host, ready, declined, waiting].map(page => gotoRoom(page, '/room/f14-many-ui')));
    await expect(host.getByRole('button', { name: 'Ver participantes (4)', exact: true }).first()).toBeVisible();
    await Promise.all([host, ready, declined, waiting].map(page => page.getByRole('button', { name: 'Assistir vídeo com a sala', exact: true }).click()));
    await host.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'Luz.webm', mimeType: 'video/webm', buffer: await videoFile(host, 'video/webm;codecs=vp8', false, false, true) });
    await ready.getByRole('button', { name: 'Aceitar vídeo', exact: true }).click();
    await expect(ready.getByTestId('watch-video')).toBeVisible();
    await declined.getByRole('button', { name: 'Recusar vídeo', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Participantes da sessão: 1 de 3 prontos' })).toBeVisible();
    await captureWidths(host, 'bright-player');
    await host.getByRole('button', { name: /Participantes da sessão/ }).click();
    const drawer = host.getByRole('dialog', { name: 'Participantes do vídeo' });
    for (const label of ['Assistindo', 'A caminho', 'Indisponíveis']) await expect(drawer.getByRole('heading', { name: new RegExp(label) })).toBeVisible();
    await captureWidths(host, 'several-participants');
    await host.getByRole('button', { name: 'Fechar participantes' }).click();
    await expect(host.getByRole('button', { name: /Participantes da sessão/ })).toBeFocused();
    for (const width of [1280, 320]) {
      await host.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await host.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => host.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await host.getByRole('button', { name: /Participantes da sessão/ }).click();
      await expect(drawer).toBeVisible();
      expect(await drawer.evaluate(el => document.fullscreenElement?.contains(el))).toBe(true);
      await capture(host, `fullscreen-participants-${width}`);
      await host.getByRole('button', { name: 'Fechar participantes' }).click();
      await host.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
    }
    await host.getByRole('button', { name: 'Ver participantes (4)', exact: true }).first().click();
    await captureWidths(host, 'incumbent-participants');
    await host.getByRole('button', { name: 'Fechar lista de participantes' }).click();
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
