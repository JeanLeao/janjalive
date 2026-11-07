import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import { synthetic, dock } from './fixtures/camera';

async function captureFixture(page: Page) {
  await synthetic(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.screenAudio = true; w.displaySurface = 'browser'; w.displayOptions = [];
    const capture = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async (options?: DisplayMediaStreamOptions) => {
      w.displayOptions.push(options);
      const stream = await capture(options); w.lastDisplay = stream;
      const track = stream.getVideoTracks()[0]; const settings = track.getSettings.bind(track); const surface = w.displaySurface;
      track.getSettings = () => ({ ...settings(), displaySurface: surface });
      return stream;
    } });
  });
}

async function openAudio(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as any).sent?.some((message: any) => message.type === 'join') === true)).toBe(true);
  await expect(page.getByRole('button', { name: /Ver participantes \([1-9]\d*\)/ }).first()).toBeVisible();
  const settings = page.getByRole('button', { name: 'Abrir configurações e diagnósticos', exact: true });
  if (await settings.isVisible()) await settings.click();
  else {
    await page.getByRole('button', { name: 'Mais opções da sala', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Configurações', exact: true }).click();
  }
  await page.getByRole('tab', { name: 'Áudio', exact: true }).click();
  return page.getByLabel('Áudio da próxima captura', { exact: true });
}

async function startPreview(page: Page) {
  await dock(page);
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
}

for (const mobile of [false, true]) test(`tab-only audio: selection, sharing, source replacement and no silent system fallback ${mobile ? 'mobile' : 'desktop'}`, async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1280, height: 800 }, hasTouch: mobile });
  const viewerContext = await browser.newContext();
  try {
    const host = await context.newPage(), viewer = await viewerContext.newPage();
    await captureFixture(host);
    await Promise.all([gotoRoom(host, '/room/tab-audio'), gotoRoom(viewer, '/room/tab-audio')]);
    await expect(host.getByRole('button', { name: /Ver participantes \(2\)/ }).first()).toBeVisible();
    const mode = await openAudio(host);
    await expect(mode).toHaveValue('system');
    await mode.selectOption('tab');
    expect(await mode.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await host.screenshot({ path: info.outputPath(`tab-audio-settings-${mobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' });
    await host.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
    await startPreview(host);
    await expect(host.getByText('Áudio somente da aba selecionada. O áudio do sistema não foi solicitado.', { exact: true })).toBeVisible();
    const options = await host.evaluate(() => (window as any).displayOptions[0]);
    expect(options.audio).toBe(true); expect(options.systemAudio).toBe('exclude');
    expect(options.windowAudio).toBe('exclude'); expect(options.video.displaySurface).toBe('browser');
    expect(await host.evaluate(() => (window as any).cameraRequests.length)).toBe(0);
    await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await expect.poll(() => viewer.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await expect.poll(() => host.evaluate(() => (window as any).peers.some((pc: RTCPeerConnection) => pc.getSenders().some(s => s.track?.kind === 'audio')))).toBe(true);
    await expect(await openAudio(host)).toBeDisabled();
    await host.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
    await host.evaluate(() => { (window as any).displaySurface = 'window'; });
    await dock(host); await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await expect.poll(() => host.evaluate(() => (window as any).lastDisplay.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
    expect(await host.evaluate(() => (window as any).screenTracks[0].readyState)).toBe('live');
    await expect(host.getByRole('button', { name: 'Trocar tela', exact: true })).toBeEnabled();
    await host.evaluate(() => { (window as any).displaySurface = 'browser'; (window as any).screenAudio = false; });
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await expect(host.getByText(/A aba foi capturada sem áudio/)).toBeVisible();
    expect(await host.evaluate(() => (window as any).displayOptions.every((option: any) => option.systemAudio === 'exclude'))).toBe(true);
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await expect.poll(() => host.evaluate(() => (window as any).peers.every((pc: RTCPeerConnection) => pc.getSenders().every(s => s.track?.kind !== 'audio')))).toBe(true);
    expect(await host.evaluate(() => (window as any).cameraRequests.length)).toBe(0);
  } finally { await context.close(); await viewerContext.close(); }
});

test('tab-only audio rejects an initial monitor selection, releases capture and permits an explicit mode change', async ({ page }) => {
  await captureFixture(page); await gotoRoom(page, '/room/tab-audio-rejection');
  const mode = await openAudio(page); await mode.selectOption('tab');
  await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
  await page.evaluate(() => { (window as any).displaySurface = 'monitor'; });
  await startPreview(page);
  await expect(page.getByText(/No modo Áudio somente da aba, escolha uma aba/).first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).lastDisplay.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toHaveCount(0);
  const nextMode = await openAudio(page); await expect(nextMode).toBeEnabled(); await nextMode.selectOption('system');
  await page.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
  await startPreview(page);
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).displayOptions[1].systemAudio)).toBeUndefined();
});
