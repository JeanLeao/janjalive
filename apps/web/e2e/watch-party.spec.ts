import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';

import { videoFile } from './fixtures/watch-video';

async function mode(page: Page) {
  const button = page.locator('[data-control-id="empty-watch-entry"], [data-control-id="watch-party"]').first();
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap();
  else await button.click();
}
async function ready(page: Page) {
  const accept = page.getByRole('button', { name: 'Aceitar vídeo', exact: true });
  await expect(accept).toBeVisible({ timeout: 15000 });
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await accept.tap(); else { await accept.focus(); await page.keyboard.press('Enter'); }
  await expect(page.getByTestId('watch-video')).toBeVisible({ timeout: 25000 });
  await expect.poll(() => page.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
}
for (const mobile of [false, true]) test(`F14: P2P consent, playback, late join, recovery and cleanup ${mobile ? 'mobile' : 'desktop'}`, async ({ browser }) => {
  test.setTimeout(120000);
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile })));
  try {
    const [a, b, c, late] = await Promise.all(contexts.map(ctx => ctx.newPage()));
    for (const page of [a, b, c, late]) await page.addInitScript(() => {
      const NativeWS = WebSocket;
      (window as any).watchEvents = []; (window as any).watchSocket = null;
      window.WebSocket = class extends NativeWS { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes('/signal')) { (window as any).watchSocket = this; this.addEventListener('message', e => (window as any).watchEvents.push(JSON.parse(e.data))); } } };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      (window as any).watchUrls = new Set<string>();
      URL.createObjectURL = blob => { const url = create(blob); (window as any).watchUrls.add(url); return url; };
      URL.revokeObjectURL = url => { (window as any).watchUrls.delete(url); revoke(url); };
    });
    await Promise.all([a, b, c].map((p, i) => gotoRoom(p, `/room/f14?name=Watcher${i}`)));
    await expect(a.getByRole('button', { name: 'Ver participantes (3)', exact: true }).first()).toBeVisible();
    const file = await videoFile(a);
    await Promise.all([a, b, c].map(mode));
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'invalid.webm', mimeType: 'video/webm', buffer: Buffer.from('invalid') });
    await expect(a.getByRole('alert').filter({ hasText: /Codec|decodificar/ })).toBeVisible();
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'large.webm', mimeType: 'video/webm', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(a.getByRole('alert').filter({ hasText: /20 MiB/ })).toBeVisible();
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'party.webm', mimeType: 'video/webm', buffer: file });
    await expect(a.getByRole('button', { name: 'Reproduzir para todos' })).toBeVisible();
    await expect(b.getByRole('button', { name: 'Aceitar vídeo' })).toBeVisible();
    expect(await b.getByTestId('watch-video').count()).toBe(0);
    await b.screenshot({ path: test.info().outputPath('invitation.png') });
    // Both recipients receive through actual local RTCDataChannels.
    await Promise.all([b, c].map(ready));
    await expect(b.getByRole('button', { name: 'Reproduzir para todos' })).toHaveCount(0);
    const playback = a.getByRole('button', { name: 'Reproduzir para todos' });
    await playback.focus(); await a.keyboard.press('Enter');
    for (const page of [a, b, c]) {
      const blocked = page.getByRole('button', { name: 'Ativar reprodução neste dispositivo' });
      if (await blocked.isVisible()) await blocked.click();
      await expect.poll(() => page.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 12000 }).toBeGreaterThan(0.7);
    }
    await a.getByRole('button', { name: 'Pausar para todos' }).click();
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await a.getByLabel('Posição do vídeo').fill('3');
    await a.getByLabel('Posição do vídeo').dispatchEvent('pointerup');
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 3))).toBeLessThan(0.7);
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
    await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.dispatchEvent(new Event('waiting')));
    await expect(b.getByRole('status').filter({ hasText: /Carregando neste/ })).toBeVisible();
    await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => { v.currentTime = 0; });
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 3))).toBeLessThan(0.7);
    await gotoRoom(late, '/room/f14?name=Late'); await mode(late);
    await a.screenshot({ path: test.info().outputPath('late-controller.png') });
    await late.screenshot({ path: test.info().outputPath('late-viewer.png') });
    await ready(late);
    await expect.poll(() => late.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 3))).toBeLessThan(0.7);
    // Force a rejected audible play and recover through a real user click.
    await c.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => { const play = v.play.bind(v); let reject = true; v.play = () => { if (reject) { reject = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } return play(); }; });
    await a.getByRole('button', { name: 'Reproduzir para todos' }).click();
    await c.getByRole('button', { name: 'Ativar reprodução neste dispositivo' }).click();
    await expect.poll(() => c.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await a.getByRole('button', { name: 'Pausar para todos' }).click();
    await b.getByRole('button', { name: 'Silenciar vídeo', exact: true }).click();
    expect(await b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await a.screenshot({ path: test.info().outputPath('controller.png') });
    await b.screenshot({ path: test.info().outputPath('viewer.png') });
    for (const page of [a, b]) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.getByRole('button', { name: 'Voltar às transmissões' }).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    await b.getByRole('button', { name: 'Voltar às transmissões' }).click();
    expect(await b.getByTestId('watch-video').count()).toBe(0);
    await mode(b); await expect(b.getByTestId('watch-video')).toBeVisible();
    await a.evaluate(() => (window as any).watchSocket.close(1000));
    for (const page of [b, c, late]) {
      await expect(page.getByRole('button', { name: /^Selecionar (vídeo local|outro vídeo)$/ })).toBeVisible();
      await expect(page.getByTestId('watch-video')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => (window as any).watchUrls.size)).toBe(0);
    }
  } finally { await Promise.all(contexts.map(ctx => ctx.close())); }
});

test('F14: MP4 decode, decline/retry, spectator reconnect and explicit end', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const [a, b] = await Promise.all(contexts.map(c => c.newPage()));
    for (const page of [a, b]) await page.addInitScript(() => {
      const Native = WebSocket;
      window.WebSocket = class extends Native { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes('/signal')) (window as any).watchSocket = this; } };
    });
    await Promise.all([a, b].map(p => gotoRoom(p, '/room/f14-mp4')));
    await expect(a.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await Promise.all([a, b].map(mode));
    expect(await a.evaluate(() => MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42001E'))).toBe(true);
    const buffer = await videoFile(a, 'video/mp4;codecs=avc1.42001E');
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'movie.mp4', mimeType: 'video/mp4', buffer });
    await b.getByRole('button', { name: 'Recusar vídeo' }).click();
    await a.getByRole('button', { name: /Participantes da sessão/ }).click();
    await expect(a.getByText('Recusado', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Convidar participantes indisponíveis' }).click(); await ready(b);
    await a.getByRole('button', { name: 'Fechar participantes', exact: true }).click();
    await a.getByRole('button', { name: 'Reproduzir para todos' }).click();
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.5);
    await a.getByRole('button', { name: 'Pausar para todos' }).click();
    await b.evaluate(() => (window as any).watchSocket.close(4101));
    await expect(b.getByRole('button', { name: 'Aceitar vídeo' })).toBeVisible({ timeout: 25000 });
    await ready(b);
    await b.getByTestId('watch-video').evaluate(video => video.dispatchEvent(new Event('error')));
    await expect(b.getByTestId('watch-video')).toHaveCount(0);
    await expect(b.getByRole('alert').filter({ hasText: /Codec/ })).toBeVisible();
    await a.getByRole('button', { name: /Participantes da sessão/ }).click();
    await expect(a.getByRole('button', { name: 'Encerrar vídeo compartilhado' })).toBeVisible();
    await a.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
    await a.getByRole('button', { name: 'Confirmar encerramento' }).click();
    for (const page of [a, b]) { await expect(page.getByRole('button', { name: /^Selecionar (vídeo local|outro vídeo)$/ })).toBeVisible(); await expect(page.getByTestId('watch-video')).toHaveCount(0); }
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

for (const accepted of [false, true]) test(`F14: socket replacement reinvites the same peer without a departure (${accepted ? 'complete' : 'pending'})`, async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const [a, b, replacement] = await Promise.all(contexts.map(c => c.newPage()));
    for (const page of [a, b, replacement]) await page.addInitScript(() => {
      const Native = WebSocket;
      (window as any).watchEvents = [];
      window.WebSocket = class extends Native {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          if (String(url).includes('/signal')) {
            (window as any).watchSocket = this;
            this.addEventListener('message', e => (window as any).watchEvents.push(JSON.parse(e.data)));
            this.addEventListener('close', e => { (window as any).watchClose = e.code; });
          }
        }
      };
    });
    await Promise.all([a, b].map(p => gotoRoom(p, '/room/f14-replacement')));
    await expect(a.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await Promise.all([a, b].map(mode));
    const buffer = await videoFile(a);
    await a.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'replacement.webm', mimeType: 'video/webm', buffer });
    await expect(b.getByRole('button', { name: 'Aceitar vídeo', exact: true })).toBeVisible();
    const previousId = await a.evaluate(() => (window as any).watchEvents.find((e: any) => e.type === 'file-event' && e.action === 'request').id);
    if (accepted) await ready(b);
    await a.getByLabel('Posição do vídeo').fill('3');
    await a.getByLabel('Posição do vídeo').dispatchEvent('pointerup');
    if (accepted) await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 3))).toBeLessThan(0.7);
    const storage = await b.evaluate(() => Object.entries(sessionStorage));
    await replacement.addInitScript(entries => { for (const [key, value] of entries) sessionStorage.setItem(key, value); }, storage);
    await a.evaluate(() => { (window as any).watchEvents = []; });
    // Keep b's actual socket open: the new page joins with its identity/token.
    await replacement.goto(b.url());
    await expect.poll(() => b.evaluate(() => (window as any).watchClose)).toBe(4000);
    await mode(replacement);
    await expect(replacement.getByRole('button', { name: 'Aceitar vídeo', exact: true })).toBeVisible();
    await expect(replacement.getByTestId('watch-video')).toHaveCount(0);
    const events = await a.evaluate(() => (window as any).watchEvents);
    expect(events.filter((e: any) => e.type === 'peer-joined')).toHaveLength(1);
    expect(events.filter((e: any) => e.type === 'peer-left')).toHaveLength(0);
    const requests = events.filter((e: any) => e.type === 'file-event' && e.action === 'request');
    expect(requests).toHaveLength(1);
    expect(requests[0].id).not.toBe(previousId);
    if (!accepted) expect(events.some((e: any) => e.type === 'file-event' && e.id === previousId && e.action === 'cancel')).toBe(true);
    await ready(replacement);
    await expect.poll(() => replacement.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 3))).toBeLessThan(0.7);
    expect(await a.evaluate(() => (window as any).watchEvents.filter((e: any) => e.type === 'file-event' && e.action === 'request').length)).toBe(1);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test('F14: existing captures, local audio, output routing and stage modes coexist', async ({ browser }) => {
  test.setTimeout(90000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const [a, b] = await Promise.all(contexts.map(c => c.newPage()));
    for (const page of [a, b]) await page.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const ctx = canvas.getContext('2d')!; let frame = 0;
        const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? '#a5d6ff' : '#164e63'; ctx.fillRect(0, 0, 320, 180); }, 50);
        const stream = canvas.captureStream(20);
        stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer));
        (window as any).watchCapture = stream;
        return stream;
      };
      navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'audiooutput', deviceId: 'watch-output', label: 'Saída de teste' } as MediaDeviceInfo];
      HTMLMediaElement.prototype.setSinkId = function (id: string) { Object.defineProperty(this, 'sinkId', { configurable: true, value: id }); return Promise.resolve(); };
    });
    await Promise.all([a, b].map(p => gotoRoom(p, '/room/f14-coexist')));
    await expect(a.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    for (const page of [a, b]) {
      await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    }
    await expect.poll(() => a.locator('.comparison-canvas video').count()).toBe(1);
    await Promise.all([a, b].map(mode));
    const buffer = await videoFile(b, 'video/webm;codecs=vp8', true);
    await b.getByLabel('Selecionar vídeo local').setInputFiles({ name: 'audio.webm', mimeType: 'video/webm', buffer });
    await b.getByRole('button', { name: 'Reproduzir para todos' }).click();
    await expect.poll(() => b.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1);
    await ready(a);
    const unblock = a.getByRole('button', { name: 'Ativar reprodução neste dispositivo' });
    if (await unblock.isVisible()) await unblock.click();
    await expect.poll(() => a.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    expect(await a.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => (v as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream().getAudioTracks().length)).toBe(1);
    await a.getByLabel('Volume do vídeo').fill('0.25');
    expect(await a.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.volume)).toBe(0.25);
    await a.getByRole('button', { name: 'Abrir configurações e diagnósticos' }).click();
    await a.getByRole('tab', { name: 'Áudio', exact: true }).click();
    await a.getByLabel('Dispositivo de saída', { exact: true }).selectOption('watch-output');
    await a.keyboard.press('Escape');
    await expect.poll(() => a.getByTestId('watch-video').evaluate((v: HTMLVideoElement) => v.sinkId)).toBe('watch-output');
    await a.getByRole('button', { name: 'Abrir chat', exact: true }).first().click();
    const ordinary = Buffer.from('F15 during Watch Party');
    await a.getByLabel('Escolher arquivo').setInputFiles({ name: 'ordinary.txt', mimeType: 'text/plain', buffer: ordinary });
    for (const checkbox of await a.getByRole('checkbox').all()) await checkbox.check();
    await a.getByRole('button', { name: /Solicitar envio/ }).click();
    await b.getByRole('button', { name: /Abrir chat/ }).first().click();
    await b.getByRole('button', { name: 'Aceitar', exact: true }).click();
    const fileDownload = b.waitForEvent('download');
    await b.getByRole('button', { name: 'Baixar arquivo', exact: true }).click();
    const downloaded = await fileDownload;
    expect(await (await import('node:fs/promises')).readFile((await downloaded.path())!)).toEqual(ordinary);
    for (const page of [a, b]) await page.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    for (const page of [a, b]) expect(await page.evaluate(() => (window as any).watchCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'live'))).toBe(true);
    await b.getByRole('button', { name: 'Pausar para todos' }).click();
    await a.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Sair do Modo Cinema' })).toBeVisible();
    await a.getByRole('button', { name: 'Sair do Modo Cinema' }).click();
    await a.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => a.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await a.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
    await a.getByRole('button', { name: 'Voltar às transmissões' }).click();
    await expect(a.getByTestId('watch-video')).toHaveCount(0);
    await expect.poll(() => a.locator('.comparison-canvas video').first().evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
    await a.getByRole('button', { name: 'Comparar', exact: true }).click();
    await expect(a.locator('.comparison-panel')).toHaveCount(2);
    await a.getByRole('button', { name: 'Sair da comparação', exact: true }).click();
    await b.getByRole('button', { name: /Participantes da sessão/ }).click();
    await b.getByRole('button', { name: 'Encerrar vídeo compartilhado' }).click();
    await b.getByRole('button', { name: 'Confirmar encerramento' }).click();
    for (const page of [a, b]) expect(await page.evaluate(() => (window as any).watchCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'live'))).toBe(true);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
