import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import { synthetic, start, publish, dock } from './fixtures/camera';

async function view(page: Page, mode: string, position?: string) {
  const toggle = page.getByRole('button', { name: 'Expandir ferramentas', exact: true }).first();
  if (await toggle.isVisible()) await toggle.click();
  const control = page.getByRole('button', { name: 'Visualização da câmera', exact: true }).first();
  if (page.viewportSize()!.width < 600) await control.tap(); else await control.click();
  await page.getByLabel('Modo da câmera', { exact: true }).selectOption(mode);
  if (position) await page.getByLabel('Posição da câmera', { exact: true }).selectOption(position);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Modo da câmera', { exact: true })).not.toBeVisible();
  await expect(control).toBeFocused();
}
async function playing(page: Page, count = 1) {
  await expect(page.getByTestId('stage-camera')).toHaveCount(count);
  await expect.poll(() => page.getByTestId('stage-camera').evaluateAll(videos => videos.every(v => {
    const video = v as HTMLVideoElement;
    return video.videoWidth > 0 && video.readyState >= 2 && video.muted && (video.srcObject as MediaStream).getAudioTracks().length === 0;
  }))).toBe(true);
}
for (const width of [1280, 390, 320]) {
  test(`webcam C: layouts, local privacy, source switch and cleanup ${width}`, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600 });
    const host = await context.newPage(), viewer = await context.newPage();
    try {
      await synthetic(host); await synthetic(viewer);
      await gotoRoom(host, `/room/stage-${width}`); await gotoRoom(viewer, `/room/stage-${width}`);
      await host.evaluate(() => { (window as any).screenAudio = true; });
      await start(host);
      await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
      await publish(host); await playing(viewer); await playing(host);
      expect(await viewer.locator('.stage-camera-composition').getAttribute('data-camera-mode')).toBe('overlay');
      const before = await host.evaluate(() => ({ captures: (window as any).cameraRequests.length, offers: (window as any).sent.filter((m: any) => m.data?.type === 'offer').length }));
      for (const position of ['bottom-left', 'top-right', 'top-left', 'bottom-right']) {
        await view(viewer, 'overlay', position);
        await viewer.screenshot({ path: info.outputPath(`overlay-${position}-${width}.png`) });
        const camera = await viewer.getByTestId('stage-camera').boundingBox();
        expect(camera!.x).toBeGreaterThanOrEqual(0); expect(camera!.x + camera!.width).toBeLessThanOrEqual(width);
      }
      await view(viewer, 'separate'); await playing(viewer);
      await viewer.screenshot({ path: info.outputPath(`separate-${width}.png`) });
      const screen = await viewer.getByTestId('zoom-viewport').boundingBox(), camera = await viewer.getByTestId('stage-camera').boundingBox();
      if (width > 600) expect(screen!.x + screen!.width).toBeLessThanOrEqual(camera!.x);
      else expect(screen!.y + screen!.height).toBeLessThanOrEqual(camera!.y);
      await view(viewer, 'hidden'); await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
      await playing(host);
      await viewer.screenshot({ path: info.outputPath(`hidden-${width}.png`) });
      expect(await host.evaluate(() => ({ captures: (window as any).cameraRequests.length, offers: (window as any).sent.filter((m: any) => m.data?.type === 'offer').length }))).toEqual(before);
      await view(viewer, 'overlay', 'bottom-left');
      await dock(host); await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await playing(viewer);
      await viewer.screenshot({ path: info.outputPath(`switch-${width}.png`) });
      await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click(); await playing(viewer);
      expect(await host.evaluate(() => (window as any).sharedAudio.readyState)).toBe('live');
      await dock(host); await host.getByRole('button', { name: 'Desligar câmera — câmera ao vivo', exact: true }).click();
      await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
      await viewer.screenshot({ path: info.outputPath(`absent-${width}.png`) });
      await publish(host); await playing(viewer);
      const late = await context.newPage(); await synthetic(late); await gotoRoom(late, `/room/stage-${width}`); await playing(late);
      await viewer.evaluate(() => { (window as any).sockets.at(-1).close(4001, 'test interruption'); });
      await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
      await playing(viewer);
      await host.evaluate(() => { (window as any).sockets.at(-1).close(4001, 'test interruption'); });
      await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
      await viewer.screenshot({ path: info.outputPath(`disconnect-${width}.png`) });
    } finally { await context.close(); }
  });
}

for (const width of [1280, 390]) test(`webcam C: compare, Cinema, fullscreen and independent screen tools ${width}`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 600 });
  try {
    const a = await context.newPage(), b = await context.newPage(), viewer = await context.newPage();
    for (const page of [a, b, viewer]) { await synthetic(page); await gotoRoom(page, `/room/camera-compare-${width}`); }
    await start(a); await publish(a); await start(b); await publish(b);
    await playing(viewer);
    await expect.poll(() => viewer.getByTestId('zoom-viewport').locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Comparar', exact: true }).click(); await playing(viewer, 2);
    await expect.poll(() => viewer.getByTestId('zoom-viewport').locator('video').evaluateAll(videos => videos.every(v => (v as HTMLVideoElement).videoWidth > 0))).toBe(true);
    await viewer.screenshot({ path: info.outputPath(`compare-overlay-${width}.png`) });
    const identities = await viewer.getByTestId('stage-camera').evaluateAll(videos => videos.map(v => (v as HTMLVideoElement).srcObject && ((v as HTMLVideoElement).srcObject as MediaStream).id));
    expect(new Set(identities).size).toBe(2);
    await view(viewer, 'separate'); await playing(viewer, 2);
    await viewer.screenshot({ path: info.outputPath(`compare-separate-${width}.png`) });
    if (width < 600) {
      await viewer.getByTestId('stage-camera').nth(1).scrollIntoViewIfNeeded();
      await viewer.screenshot({ path: info.outputPath(`compare-secondary-${width}.png`) });
      await viewer.locator('.stage-main-container').evaluate(el => { el.scrollTop = 0; });
    }
    await view(viewer, 'hidden'); await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
    await view(viewer, 'overlay', 'top-right'); await playing(viewer, 2);
    await viewer.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await viewer.screenshot({ path: info.outputPath(`cinema-${width}.png`) });
    await viewer.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => viewer.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await view(viewer, 'separate');
    await viewer.screenshot({ path: info.outputPath(`fullscreen-${width}.png`) });
    await viewer.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
    await viewer.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();
    await view(viewer, 'overlay', 'bottom-left');
    const before = await viewer.getByTestId('stage-camera').first().boundingBox();
    await viewer.getByRole('button', { name: 'Ampliar zoom', exact: true }).first().click();
    expect(await viewer.getByTestId('stage-camera').first().boundingBox()).toEqual(before);
    // Camera is a sibling of the screen transform, and never a screen tool's media source.
    expect(await viewer.getByTestId('zoom-viewport').locator('[data-testid="stage-camera"]').count()).toBe(0);
    const secondaryId = await viewer.getByRole('combobox', { name: 'Transmissão secundária', exact: true }).inputValue();
    await viewer.getByRole('combobox', { name: 'Transmissão principal', exact: true }).selectOption(secondaryId);
    await playing(viewer, 2);
    expect(await viewer.getByTestId('stage-camera').first().evaluate(v => ((v as HTMLVideoElement).srcObject as MediaStream).id)).toBe(identities[1]);
    expect(await viewer.locator('.stage-camera-composition').first().getAttribute('data-camera-mode')).toBe('overlay');
    if (width > 600) {
      await view(viewer, 'overlay', 'top-right');
      await viewer.getByRole('button', { name: 'Abrir chat', exact: true }).click();
      await expect(viewer.locator('#room-chat-panel')).toBeVisible();
      const camera = await viewer.getByTestId('stage-camera').nth(1).boundingBox();
      const tools = await viewer.locator('.comparison-panel').nth(1).locator('.stage-view-controls').boundingBox();
      expect(camera!.x + camera!.width).toBeLessThanOrEqual(tools!.x);
      await viewer.screenshot({ path: info.outputPath('compare-chat-1280.png') });
    }
    await dock(a); await a.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(viewer.getByTestId('stage-camera')).toHaveCount(1);
    await b.close(); await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
  } finally { await context.close(); }
});

test('webcam C: screenshot, clip and PiP use screen only while camera is published', async ({ page }, info) => {
  await synthetic(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.screenDraws = []; w.recordingTracks = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      if (args[0] instanceof HTMLVideoElement) w.screenDraws.push(args[0].closest('[data-testid="zoom-viewport"]') !== null);
      return (draw as any).apply(this, args);
    };
    const sourceTracks = new WeakMap<MediaStreamTrack, string>();
    const clone = MediaStreamTrack.prototype.clone;
    MediaStreamTrack.prototype.clone = function () {
      const copy = clone.call(this);
      sourceTracks.set(copy, sourceTracks.get(this) ?? this.id);
      return copy;
    };
    const NativeRecorder = MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options); w.recordingTracks.push(stream.getTracks().map(track => sourceTracks.get(track) ?? track.id));
      }
    };
    let pip: HTMLVideoElement | null = null;
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => pip });
    HTMLVideoElement.prototype.requestPictureInPicture = async function () {
      pip = this; this.dispatchEvent(new Event('enterpictureinpicture')); return {} as PictureInPictureWindow;
    };
    document.exitPictureInPicture = async () => { const previous = pip; pip = null; previous?.dispatchEvent(new Event('leavepictureinpicture')); };
  });
  await gotoRoom(page, '/room/camera-screen-tools'); await start(page); await publish(page); await playing(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salvar imagem', exact: true }).click();
  await (await download).saveAs(info.outputPath('screen-only.png'));
  expect(await page.evaluate(() => (window as any).screenDraws)).toEqual([true]);
  await page.getByRole('button', { name: 'Janela flutuante (PiP)', exact: true }).click();
  expect(await page.evaluate(() => document.pictureInPictureElement?.closest('[data-testid="zoom-viewport"]') !== null)).toBe(true);
  await page.getByRole('button', { name: 'Fechar janela flutuante', exact: true }).click();
  await page.getByRole('button', { name: /^Clipes/ }).click();
  await page.getByRole('button', { name: 'Iniciar gravação', exact: true }).click();
  await expect(page.getByRole('button', { name: /● Gravando/ })).toBeVisible();
  await page.getByRole('button', { name: 'Parar gravação', exact: true }).click();
  const preview = page.getByLabel('Prévia local do clipe');
  await expect.poll(() => preview.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(640);
  expect(await page.evaluate(() => {
    const w = window as any;
    return w.recordingTracks.length > 0 && w.recordingTracks.every((ids: string[]) =>
      ids.includes(w.screenTracks.at(-1).id) && !ids.includes(w.cameraTracks.at(-1).id));
  })).toBe(true);
});

test('webcam C: failed connection hides camera and recovery restores the same source', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const host = await context.newPage(), viewer = await context.newPage();
    for (const page of [host, viewer]) { await synthetic(page); await gotoRoom(page, '/room/camera-recovery'); }
    await start(host); await publish(host); await playing(viewer);
    await viewer.evaluate(() => {
      const w = window as any;
      w.failedPeer = w.peers.find((pc: RTCPeerConnection) => pc.connectionState === 'connected');
      Object.defineProperty(w.failedPeer, 'connectionState', { configurable: true, value: 'failed' });
      w.failedPeer.dispatchEvent(new Event('connectionstatechange'));
    });
    await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
    await viewer.evaluate(() => {
      const pc = (window as any).failedPeer;
      delete pc.connectionState;
      pc.dispatchEvent(new Event('connectionstatechange'));
    });
    await playing(viewer);
  } finally { await context.close(); }
});
