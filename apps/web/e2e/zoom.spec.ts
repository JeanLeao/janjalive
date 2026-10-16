import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('F21 geometry, stream replacement, wheel scope and touch navigation', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/e2e/fixtures/zoom.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile(new URL('./fixtures/zoom.html', import.meta.url), 'utf8') }));
  await page.goto('/e2e/fixtures/zoom.html');
  const viewport = page.getByTestId('zoom-viewport');
  const video = viewport.locator('video');
  const group = page.getByRole('group', { name: 'Zoom da transmissão' });
  const plus = page.getByRole('button', { name: 'Ampliar zoom' });
  const matrix = () => video.evaluate(v => {
    const m = new DOMMatrix(getComputedStyle(v.parentElement!).transform);
    return { x: m.m41, y: m.m42, scale: m.a };
  });
  for (const [width, height] of [[1280,720], [800,600], [1600,600], [600,1000]]) {
    await page.evaluate(([w,h]) => (window as any).replaceZoomStream(w,h), [width,height]);
    await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).videoWidth)).toBe(width);
    await expect(group).toContainText('100%');
    const box = (await viewport.boundingBox())!;
    // Letterbox space is excluded from wheel zoom.
    const letterbox = width / height > box.width / box.height;
    const p = letterbox ? { x: box.x + box.width / 2, y: box.y + 2 } : { x: box.x + 2, y: box.y + box.height / 2 };
    expect(await viewport.evaluate((el,p) => el.dispatchEvent(new WheelEvent('wheel', { clientX: p.x, clientY: p.y, deltaY: -100, cancelable: true })), p)).toBe(true);
    await expect(group).toContainText('100%');
    for (let i=0;i<4;i++) await plus.click();
    await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
    await page.mouse.down(); await page.mouse.move(box.x+box.width*3, box.y+box.height*3); await page.mouse.up();
    const checkBounds = async () => {
      const m = await matrix();
      const dimensions = await viewport.evaluate(el => ({ w: el.clientWidth, h: el.clientHeight }));
      const fit = Math.min(dimensions.w / width, dimensions.h / height);
      expect(Math.abs(m.x)).toBeLessThanOrEqual(Math.max(0,(width*fit*m.scale-dimensions.w)/2)+1);
      expect(Math.abs(m.y)).toBeLessThanOrEqual(Math.max(0,(height*fit*m.scale-dimensions.h)/2)+1);
    };
    await expect(checkBounds).toPass();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await viewport.boundingBox())!.width).toBe(390);
    await expect(checkBounds).toPass();
    await page.screenshot({ path: test.info().outputPath(`zoom-${width}-${height}.png`) });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await plus.click();
  await expect(group).toContainText('225%');
  await page.screenshot({ path: test.info().outputPath('zoom-fullscreen.png') });
  await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  await page.getByRole('button', { name: 'Reduzir zoom' }).click();
  await page.evaluate(() => (window as any).resizeZoomVideo(800, 600));
  await expect.poll(() => video.evaluate(v => (v as HTMLVideoElement).videoWidth)).toBe(800);
  await expect(group).toContainText('200%');
  await expect.poll(() => video.evaluate(v => {
    const video = v as HTMLVideoElement;
    const viewport = video.parentElement!;
    const fit = Math.min(viewport.clientWidth / video.videoWidth, viewport.clientHeight / video.videoHeight);
    const m = new DOMMatrix(getComputedStyle(video.parentElement!).transform);
    return Math.abs(m.m41) <= Math.max(0, (video.videoWidth * fit * m.a - viewport.clientWidth) / 2) + 1
      && Math.abs(m.m42) <= Math.max(0, (video.videoHeight * fit * m.a - viewport.clientHeight) / 2) + 1;
  })).toBe(true);
  await page.mouse.move(200,650); await page.mouse.wheel(0,300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0,0));
  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Restaurar enquadramento' }).click();
    for (let i=0;i<4;i++) await plus.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const box = (await viewport.boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.width/2, y: box.height/2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.width/2-80, y: box.height/2-80 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await matrix()).y).toBeLessThan(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.width/2, y: box.height/2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(viewport).toHaveCSS('cursor', 'grab');
    await cdp.detach();
  }
  expect(errors).toEqual([]);
});
