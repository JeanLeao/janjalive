import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
async function fixture(page: Page, supported = true) {
  await page.addInitScript(({ supported }) => {
    const state = window as any;
    state.deviceListeners = new Set();
    const add = navigator.mediaDevices.addEventListener.bind(navigator.mediaDevices);
    const remove = navigator.mediaDevices.removeEventListener.bind(navigator.mediaDevices);
    navigator.mediaDevices.addEventListener = ((type: string, listener: any, options: any) => {
      if (type === 'devicechange') state.deviceListeners.add(listener);
      add(type, listener, options);
    }) as any;
    navigator.mediaDevices.removeEventListener = ((type: string, listener: any, options: any) => {
      if (type === 'devicechange') state.deviceListeners.delete(listener);
      remove(type, listener, options);
    }) as any;
    state.outputs = [{ kind: 'audiooutput', deviceId: 'test-headset', label: 'Saída de teste' }];
    state.sinks = [];
    state.nativeDenied = false;
    state.inputRequests = 0;
    navigator.mediaDevices.getUserMedia = () => { state.inputRequests++; return Promise.reject(); };
    state.pendingEnumerations = [];
    navigator.mediaDevices.enumerateDevices = () => state.delayEnumeration
      ? new Promise((resolve, reject) => state.pendingEnumerations.push({ resolve, reject }))
      : Promise.resolve(state.outputs);
    (navigator.mediaDevices as any).selectAudioOutput = () => state.nativeDenied
      ? Promise.reject(new DOMException('', 'NotAllowedError')) : state.delayNative ? new Promise(resolve => { state.finishNative = resolve; }) : Promise.resolve(state.outputs[0]);
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', { configurable: true, value: supported ? function (this: HTMLMediaElement, id: string) {
      const video = this;
      state.sinks.push(id);
      return new Promise<void>((resolve) => {
        const finish = () => { Object.defineProperty(video, 'sinkId', { configurable: true, value: id }); resolve(); };
        if (state.delaySink) state.finishSink = finish;
        else finish();
      });
    } : undefined });
    HTMLMediaElement.prototype.play = function () {
      if (state.blockPlay && !this.muted) return Promise.reject(new DOMException('', 'NotAllowedError'));
      return Promise.resolve();
    };
  }, { supported });
  await page.route('**/e2e/fixtures/audio-output.html', async route => route.fulfill({ contentType: 'text/html', body: (await readFile(new URL('./fixtures/zoom.html', import.meta.url), 'utf8')).replace('zoom.tsx', 'audio-output.tsx') }));
  await page.goto('/e2e/fixtures/audio-output.html');
  await expect(page.getByText('Saída de áudio', { exact: true })).toBeVisible();
}
const output = (page: Page) => page.getByLabel('Dispositivo de saída', { exact: true });
const video = (page: Page) => page.locator('video').first();
test('F28 selection, stream recreation, removal latch, explicit default and input privacy', async ({ page }) => {
  await fixture(page);
  await output(page).selectOption('test-headset');
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).sinkId)).toBe('test-headset');
  await page.evaluate(() => (window as any).setAudioPaused(true));
  await expect(page.locator('video')).toHaveCount(0);
  await page.evaluate(() => { (window as any).delaySink = true; (window as any).setAudioPaused(false); });
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(true);
  await page.evaluate(() => { (window as any).delaySink = false; (window as any).finishSink(); });
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).sinkId)).toBe('test-headset');
  await page.evaluate(() => { (window as any).outputs = []; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
  await expect(page.getByRole('status').filter({ hasText: 'Áudio suspenso' })).toBeVisible();
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(true);
  await output(page).selectOption('');
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).sinkId)).toBe('');
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(false);
  expect(await page.evaluate(() => (window as any).inputRequests)).toBe(0);
});
test('F28 native rejection retains preference and autoplay remains independent', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Escolher saída no navegador' }).click();
  await expect(output(page)).toHaveValue('test-headset');
  await page.evaluate(() => { (window as any).nativeDenied = true; });
  await page.getByRole('button', { name: 'Escolher saída no navegador' }).click();
  await expect(page.getByRole('alert')).toContainText('cancelada');
  await expect(output(page)).toHaveValue('test-headset');
  await page.evaluate(() => { (window as any).blockPlay = true; (window as any).setAudioAvailable(false); });
  await page.evaluate(() => (window as any).setAudioAvailable(true));
  await expect(page.getByRole('button', { name: 'Ativar áudio', exact: true }).first()).toBeVisible();
  await expect(output(page)).toHaveValue('test-headset');
});
test('F28 unsupported mobile browser retains default playback and accessible guidance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, false);
  await expect(page.getByText(/Use as configurações de áudio do sistema/)).toBeVisible();
  await expect(output(page)).toHaveCount(0);
  await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('F28 output controls support keyboard and touch-sized targets on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await output(page).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  const choose = page.getByRole('button', { name: 'Escolher saída no navegador' });
  await expect(choose).toBeFocused();
  expect((await choose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await output(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test('F28 comparison retains one audible source and individual volume/mute while routing all players', async ({ page }) => {
  await fixture(page);
  await output(page).selectOption('test-headset');
  await page.evaluate(() => (window as any).addSecondSource());
  await page.getByTestId('output-settings').evaluate(element => { element.style.display = 'none'; });
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluateAll(elements => elements.filter(v => !(v as HTMLVideoElement).muted).length)).toBe(1);
  const menus = page.getByRole('button', { name: 'Áudio da transmissão', exact: true });
  await menus.last().click();
  await page.getByRole('slider', { name: 'Volume da transmissão' }).fill('0.35');
  await page.getByRole('button', { name: 'Ouvir esta transmissão' }).click();
  await expect.poll(() => page.locator('video').evaluateAll(elements => elements.filter(v => !(v as HTMLVideoElement).muted).map(v => [(v as HTMLVideoElement).sinkId, (v as HTMLVideoElement).volume]))).toEqual([['test-headset', 0.35]]);
  await page.getByRole('button', { name: 'Silenciar transmissão', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluateAll(elements => elements.filter(v => !(v as HTMLVideoElement).muted).length)).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('output-settings').evaluate(element => { element.style.display = ''; });
  await output(page).selectOption('');
  await expect.poll(() => page.locator('video').evaluateAll(elements => elements.filter(v => !(v as HTMLVideoElement).muted).length)).toBe(0);
});

test('F28 obsolete native results and listener cleanup after unmount', async ({ page }) => {
  await fixture(page);
  expect(await page.evaluate(() => (window as any).deviceListeners.size)).toBe(1);
  await page.evaluate(() => { (window as any).delayNative = true; });
  await page.getByRole('button', { name: 'Escolher saída no navegador' }).click();
  await output(page).selectOption('');
  await page.evaluate(() => (window as any).finishNative((window as any).outputs[0]));
  await expect(output(page)).toHaveValue('');
  await page.evaluate(() => (window as any).unmountAudio());
  await expect.poll(() => page.evaluate(() => (window as any).deviceListeners.size)).toBe(0);
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
});
for (const width of [1280, 390]) {
  test(`F28 settings drawer integration and focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.goto('/room/e2e-f28-settings?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();
    const trigger = page.getByRole('button', { name: width < 600 ? 'Configurações e convite' : 'Abrir configurações e diagnósticos' });
    await trigger.click();
    if (width < 600) await page.getByRole('menuitem', { name: 'Configurações e diagnósticos' }).click();
    const drawer = page.getByRole('dialog', { name: 'Configurações' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('tab', { name: 'Áudio', exact: true }).click();
    await expect(drawer.getByText('Áudio da tela', { exact: true })).toBeVisible();
    await expect(output(page)).toBeVisible();
    await output(page).selectOption('test-headset');
    await expect(output(page)).toHaveValue('test-headset');
    await page.screenshot({ path: `/tmp/f28-settings-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const scenario of ['present', 'removed', 'previously-unavailable', 'manual-default', 'manual-native', 'manual-native-pending'] as const) {
  test(`F28 consecutive devicechange checks preserve restoration intent: ${scenario}`, async ({ page }) => {
    await fixture(page);
    await output(page).selectOption('test-headset');
    await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(false);
    if (scenario === 'previously-unavailable') {
      await page.evaluate(() => {
        (window as any).outputs = [];
        navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
      });
      await expect(page.getByRole('status').filter({ hasText: 'Áudio suspenso' })).toBeVisible();
    }
    if (scenario === 'manual-native-pending') {
      await page.evaluate(() => { (window as any).delayNative = true; });
      await page.getByRole('button', { name: 'Escolher saída no navegador' }).click();
    }
    await page.evaluate(() => {
      (window as any).delayEnumeration = true;
      for (let index = 0; index < 3; index++) navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
    });
    await expect.poll(() => page.evaluate(() => (window as any).pendingEnumerations.length)).toBe(3);
    await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(true);
    if (scenario === 'manual-default') await output(page).selectOption('');
    if (scenario === 'manual-native') {
      await page.evaluate(() => {
        (window as any).outputs = [{ kind: 'audiooutput', deviceId: 'test-other', label: 'Outra saída de teste' }];
      });
      await page.getByRole('button', { name: 'Escolher saída no navegador' }).click();
      await expect(output(page)).toHaveValue('test-other');
    }
    if (scenario === 'manual-native-pending') {
      await page.evaluate(() => (window as any).finishNative({ kind: 'audiooutput', deviceId: 'test-other', label: 'Outra saída de teste' }));
      await expect(output(page)).toHaveValue('test-other');
    }
    // Resolve the latest check first; old checks deliberately disagree and must be ignored.
    await page.evaluate(({ present }) => {
      const state = window as any;
      const available = [{ kind: 'audiooutput', deviceId: 'test-headset', label: 'Saída de teste' }];
      state.pendingEnumerations[2].resolve(present ? available : []);
    }, { present: scenario !== 'removed' && !scenario.startsWith('manual') });
    const suspended = scenario === 'removed' || scenario === 'previously-unavailable';
    await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(suspended);
    await page.evaluate(({ present }) => {
      const state = window as any;
      const available = [{ kind: 'audiooutput', deviceId: 'test-headset', label: 'Saída de teste' }];
      state.pendingEnumerations[1].resolve(present ? [] : available);
      state.pendingEnumerations[0].reject(new DOMException('', 'NotAllowedError'));
    }, { present: scenario !== 'removed' && !scenario.startsWith('manual') });
    await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).muted)).toBe(suspended);
    await expect(output(page)).toHaveValue(scenario === 'manual-default' ? '' : scenario.startsWith('manual-native') ? 'test-other' : 'test-headset');
    if (!suspended) {
      await expect.poll(() => video(page).evaluate(v => (v as HTMLMediaElement).sinkId)).toBe(scenario === 'manual-default' ? '' : scenario.startsWith('manual-native') ? 'test-other' : 'test-headset');
      await expect(page.getByRole('status').filter({ hasText: 'Saída pronta' })).toBeVisible();
    } else await expect(page.getByRole('status').filter({ hasText: 'Áudio suspenso' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
