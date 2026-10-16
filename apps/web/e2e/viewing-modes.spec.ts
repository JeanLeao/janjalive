import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function mockPiP(page: Page, supported = true, webkit = false) {
  await page.addInitScript(({ supported, webkit }) => {
    let element: HTMLVideoElement | null = null;
    const state = window as any;
    state.pipCalls = 0;
    state.pipExits = 0;
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, get: () => supported && !webkit });
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => webkit ? null : element });
    state.closePiP = () => {
      const previous = element;
      element = null;
      if (previous) {
        (previous as any).webkitPresentationMode = 'inline';
        previous.dispatchEvent(new Event(webkit ? 'webkitpresentationmodechanged' : 'leavepictureinpicture'));
      }
    };
    document.exitPictureInPicture = async () => {
      state.pipExits++;
      if (state.pipExitReject) throw new Error('Denied');
      state.closePiP();
    };
    HTMLVideoElement.prototype.requestPictureInPicture = async function () {
      state.pipCalls++;
      if (state.pipReject) throw new Error('Denied');
      if (state.pipDelay) await new Promise(resolve => { state.resolvePiP = resolve; });
      element = this;
      this.dispatchEvent(new Event('enterpictureinpicture'));
      return {} as PictureInPictureWindow;
    };
    if (!supported) Object.defineProperty(HTMLVideoElement.prototype, 'requestPictureInPicture', { configurable: true, value: undefined });
    if (webkit) {
      const proto = HTMLVideoElement.prototype as any;
      proto.webkitSupportsPresentationMode = () => supported;
      proto.webkitSetPresentationMode = function (mode: string) {
        state.pipCalls++;
        this.webkitPresentationMode = mode;
        if (mode === 'inline') state.closePiP();
        else { element = this; this.dispatchEvent(new Event('webkitpresentationmodechanged')); }
      };
    }
  }, { supported, webkit });
}

const mainVideo = (page: Page) => page.getByTestId('zoom-viewport').locator('video');
const enterPiP = (page: Page) => page.getByRole('button', { name: 'Janela flutuante (PiP)', exact: true });
const exitPiP = (page: Page) => page.getByRole('button', { name: 'Fechar janela flutuante', exact: true });

for (const mobile of [false, true]) {
  test.describe(mobile ? 'touch' : 'mouse', () => {
    test.use({ hasTouch: mobile });
    test(`Cinema preserves video, zoom, fullscreen and presenter selection (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
      await mockPiP(page);
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      await page.goto('/room/modes?demo=multi');
      const video = mainVideo(page);
      await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await video.evaluate(v => { (window as any).originalVideo = v; (window as any).originalStream = (v as HTMLVideoElement).srcObject; });
      const before = (await page.getByTestId('zoom-viewport').boundingBox())!;
      await page.getByRole('button', { name: 'Modo Cinema', exact: true }).focus();
      await page.keyboard.press('Enter');
      const after = (await page.getByTestId('zoom-viewport').boundingBox())!;
      expect(after.width * after.height).toBeGreaterThan(before.width * before.height);
      await expect(page.getByRole('button', { name: /Destacar transmissão/ })).toHaveCount(0);
      await expect.poll(() => video.evaluate(v => v === (window as any).originalVideo && (v as HTMLVideoElement).srcObject === (window as any).originalStream && !(v as HTMLVideoElement).paused)).toBe(true);
      await page.getByRole('button', { name: 'Ampliar zoom' }).click();
      await expect(page.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('125%');
      const bounds = (await page.getByTestId('zoom-viewport').boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(0, -100);
      await expect(page.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('150%');
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 - 30, bounds.y + bounds.height / 2);
      await page.mouse.up();
      await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v.parentElement!).transform).m41)).toBeLessThan(0);
      await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await expect(page.getByRole('button', { name: 'Sair do Modo Cinema' })).toBeVisible();
      await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
      await expect(page.getByRole('button', { name: 'Sair do Modo Cinema' })).toHaveAttribute('aria-pressed', 'true');
      const streamsButton = page.getByRole('button', { name: 'Transmissões (1)' });
      if (mobile) await streamsButton.tap(); else await streamsButton.click();
      const preview = page.getByRole('button', { name: /Destacar transmissão/ });
      await expect(preview).toBeVisible();
      expect(await preview.locator('video').evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
      await enterPiP(page).click();
      await expect(exitPiP(page)).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`cinema-${mobile ? 'mobile' : 'desktop'}.png`) });
      await preview.click();
      await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
      await expect(enterPiP(page)).toBeEnabled();
      await expect(page.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('100%');
      expect(await page.locator('video').evaluateAll(videos => videos.filter(v => !(v as HTMLVideoElement).muted).length)).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
      await expect(page.getByRole('button', { name: 'Modo Cinema', exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`normal-${mobile ? 'mobile' : 'desktop'}.png`) });
    });
  });
}

test('PiP errors, concurrent requests, external closure and late completion after unmount', async ({ page }) => {
  await mockPiP(page);
  await page.goto('/room/modes?demo=single');
  await expect(enterPiP(page)).toBeEnabled();
  await page.evaluate(() => { (window as any).pipReject = true; });
  await enterPiP(page).click();
  await expect(page.getByRole('alert')).toContainText('Tente novamente');
  await page.evaluate(() => { (window as any).pipReject = false; });
  await enterPiP(page).click();
  await expect(exitPiP(page)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { (window as any).pipExitReject = true; });
  await exitPiP(page).click();
  await expect(page.getByRole('alert')).toContainText('Tente novamente');
  await expect(exitPiP(page)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => { (window as any).pipExitReject = false; (window as any).closePiP(); });
  await expect(enterPiP(page)).toHaveAttribute('aria-pressed', 'false');
  await enterPiP(page).click();
  await exitPiP(page).click();
  await expect(enterPiP(page)).toBeEnabled();
  await page.evaluate(() => { (window as any).pipDelay = true; });
  await enterPiP(page).click();
  await expect(enterPiP(page)).toBeDisabled();
  expect(await page.evaluate(() => (window as any).pipCalls)).toBe(4);
  await page.getByRole('button', { name: 'Sair da sala', exact: true }).click();
  await page.evaluate(() => (window as any).resolvePiP());
  await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
});

test('PiP closes on stream replacement, track ending and removal; restart remains usable', async ({ page }) => {
  await mockPiP(page);
  await page.route('**/e2e/fixtures/zoom.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile(new URL('./fixtures/zoom.html', import.meta.url), 'utf8') }));
  await page.goto('/e2e/fixtures/zoom.html');
  await expect(enterPiP(page)).toBeEnabled();
  await enterPiP(page).click();
  await page.evaluate(() => (window as any).replaceZoomStream(640, 360));
  await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
  await enterPiP(page).click();
  await mainVideo(page).evaluate(v => {
    const track = ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0];
    track.stop(); track.dispatchEvent(new Event('ended'));
  });
  await expect(enterPiP(page)).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
  await page.evaluate(() => (window as any).replaceZoomStream(800, 600));
  await expect(enterPiP(page)).toBeEnabled();
  await enterPiP(page).click();
  await mainVideo(page).evaluate(v => {
    const stream = (v as HTMLVideoElement).srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    stream.removeTrack(track);
    // Scripted removeTrack does not dispatch the browser's removetrack event.
    stream.dispatchEvent(new MediaStreamTrackEvent('removetrack', { track }));
  });
  await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
});

test('unavailable PiP has accessible explanation', async ({ page }) => {
  await mockPiP(page, false);
  await page.goto('/room/modes?demo=single');
  await expect(enterPiP(page)).toBeDisabled();
  await expect(page.getByLabel('Janela flutuante indisponível neste navegador ou vídeo', { exact: true })).toBeVisible();
});

test('WebKit presentation mode synchronizes entry and external exit', async ({ page }) => {
  await mockPiP(page, true, true);
  await page.goto('/room/modes?demo=single');
  await expect(enterPiP(page)).toBeEnabled();
  await enterPiP(page).click();
  await expect(exitPiP(page)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).closePiP());
  await expect(enterPiP(page)).toHaveAttribute('aria-pressed', 'false');
  await enterPiP(page).click();
  await exitPiP(page).click();
  await expect(enterPiP(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as any).pipExits)).toBe(0);
});


test('PiP requests remain serialized across stream replacement', async ({ page }) => {
  await mockPiP(page);
  await page.route('**/e2e/fixtures/zoom.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile(new URL('./fixtures/zoom.html', import.meta.url), 'utf8') }));
  await page.goto('/e2e/fixtures/zoom.html');
  await expect(enterPiP(page)).toBeEnabled();
  await page.evaluate(() => { (window as any).pipDelay = true; });
  await enterPiP(page).click();
  await page.evaluate(() => (window as any).replaceZoomStream(640, 360));
  await expect(enterPiP(page)).toBeEnabled();
  await enterPiP(page).click();
  await expect(page.getByRole('alert')).toContainText('Aguarde');
  expect(await page.evaluate(() => (window as any).pipCalls)).toBe(1);
  await page.evaluate(() => { (window as any).pipDelay = false; (window as any).resolvePiP(); });
  await expect.poll(() => page.evaluate(() => (window as any).pipExits)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.pictureInPictureElement === null)).toBe(true);
  await enterPiP(page).click();
  await expect(exitPiP(page)).toBeVisible();
});
