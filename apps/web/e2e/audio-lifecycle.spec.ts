import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function fixture(page: Page) {
  await page.addInitScript(() => {
    const state = window as any;
    state.playMode = 'resolve';
    state.playCalls = 0;
    state.pendingPlays = [];
    HTMLMediaElement.prototype.play = function () {
      state.playCalls++;
      if (this.muted) {
        if (state.delayMuted) return new Promise((resolve, reject) => state.pendingPlays.push({ resolve, reject }));
        return Promise.resolve();
      }
      if (state.playMode === 'reject') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      if (state.playMode === 'delay') return new Promise((resolve, reject) => state.pendingPlays.push({ resolve, reject }));
      return Promise.resolve();
    };
  });
  await page.route('**/e2e/fixtures/audio.html', async route => route.fulfill({
    contentType: 'text/html',
    body: (await readFile(new URL('./fixtures/zoom.html', import.meta.url), 'utf8')).replace('zoom.tsx', 'audio.tsx'),
  }));
  await page.goto('/e2e/fixtures/audio.html');
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts?.())).toEqual([1]);
}

const activate = (page: Page) => page.getByRole('button', { name: 'Ativar áudio', exact: true });

test('F24 audio listeners detach on repeated removal, ending, pause and unmount', async ({ page }) => {
  await fixture(page);
  for (let index = 0; index < 5; index++) await page.evaluate(() => (window as any).replaceAudio());
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 1]);
  await page.evaluate(() => (window as any).endAudio());
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 0]);
  await page.evaluate(() => (window as any).replaceAudio());
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 0, 1]);
  await page.evaluate(() => (window as any).setAudioPaused(true));
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 0, 0]);
  await page.evaluate(() => (window as any).setAudioPaused(false));
  await expect.poll(() => page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 0, 1]);
  await page.evaluate(() => (window as any).unmountAudio());
  expect(await page.evaluate(() => (window as any).audioListenerCounts())).toEqual([0, 0, 0, 0, 0, 0, 0]);
});

test('F24 blocked autoplay clears on unavailable audio and pause; late play results are ignored', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => { (window as any).playMode = 'reject'; (window as any).setAudioAvailable(false); });
  await expect.poll(() => page.locator('video').first().evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
  await page.evaluate(() => (window as any).setAudioAvailable(true));
  await expect(activate(page).first()).toBeVisible();
  await page.evaluate(() => (window as any).setAudioAvailable(false));
  await expect(activate(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
  await expect(page.getByText('Sem faixa de áudio', { exact: true })).toBeVisible();
  await expect(activate(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => { (window as any).playMode = 'delay'; (window as any).setAudioAvailable(true); });
  await expect.poll(() => page.evaluate(() => (window as any).pendingPlays.length)).toBe(1);
  await page.evaluate(() => (window as any).setAudioPaused(true));
  await expect(page.locator('video')).toHaveCount(0);
  await page.evaluate(() => (window as any).pendingPlays.shift().reject(new Error('late rejection')));
  await expect(activate(page)).toHaveCount(0);
  await page.evaluate(() => { (window as any).playMode = 'reject'; (window as any).setAudioPaused(false); });
  await expect(activate(page).first()).toBeVisible();
  await page.evaluate(() => { (window as any).playMode = 'delay'; });
  await activate(page).first().click();
  await expect.poll(() => page.evaluate(() => (window as any).pendingPlays.length)).toBe(1);
  await page.evaluate(() => (window as any).setAudioAvailable(false));
  await page.evaluate(() => (window as any).pendingPlays.shift().resolve());
  await expect(activate(page)).toHaveCount(0);
  expect(await page.locator('video').first().evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
  await page.evaluate(() => (window as any).endAudio());
  const calls = await page.evaluate(() => (window as any).playCalls);
  await expect(activate(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).playCalls)).toBe(calls);
});


test('F24 stale muted fallback cannot report failure after resume or unmount', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => (window as any).setAudioAvailable(false));
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
  await page.evaluate(() => {
    (window as any).playMode = 'reject';
    (window as any).delayMuted = true;
    (window as any).setAudioAvailable(true);
  });
  await expect.poll(() => page.evaluate(() => (window as any).pendingPlays.length)).toBe(1);
  await page.evaluate(() => {
    (window as any).delayMuted = false;
    (window as any).playMode = 'resolve';
    (window as any).setAudioPaused(true);
  });
  await expect(page.locator('video')).toHaveCount(0);
  await page.evaluate(() => (window as any).setAudioPaused(false));
  await expect(page.locator('video')).toHaveCount(1);
  await page.evaluate(() => (window as any).pendingPlays.shift().reject(new Error('stale fallback')));
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toHaveCount(0);
  await expect(activate(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).setAudioAvailable(false));
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
  await page.evaluate(() => { (window as any).playMode = 'delay'; (window as any).setAudioAvailable(true); });
  await expect.poll(() => page.evaluate(() => (window as any).pendingPlays.length)).toBe(1);
  await page.evaluate(() => (window as any).unmountAudio());
  await page.evaluate(() => (window as any).pendingPlays.shift().reject(new Error('unmounted')));
  await expect(page.locator('video')).toHaveCount(0);
});
