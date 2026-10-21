import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import fs from 'node:fs/promises';
async function open(page: Page, count = 3) {
  await page.getByRole('button', { name: `Ver participantes (${count})`, exact: true }).first().click();
}
async function send(page: Page, bytes: Buffer, name = 'binary.html') {
  if (!await page.getByLabel('Escolher arquivo').isVisible()) await page.getByRole('button', { name: 'Enviar arquivo', exact: true }).click();
  await page.getByLabel('Escolher arquivo').setInputFiles({ name, mimeType: 'text/html', buffer: bytes });
  for (const box of await page.getByRole('checkbox').all()) {
    if (!await box.isChecked()) { if ((page.viewportSize()?.width ?? 1280) < 500) await box.tap(); else await box.check(); }
    expect(await box.evaluate(input => document.querySelector(`label[for="${input.id}"]`)!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
}
for (const mobile of [false, true]) test(`F15: spectators, multi-recipient consent, binary download, cancellation ${mobile ? 'mobile touch' : 'desktop keyboard'}`, async ({ browser }) => {
  test.setTimeout(mobile ? 90000 : 240000);
  const contexts = await Promise.all([browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile }), browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile }), browser.newContext()]);
  const pages: Page[] = [];
  try {
    const [a, b, c] = await Promise.all(contexts.map(c => c.newPage())); pages.push(a, b, c);
    for (const page of [a, b, c]) await page.addInitScript(() => {
      const NativePC = window.RTCPeerConnection; (window as any).fileTestPCs = [];
      window.RTCPeerConnection = class extends NativePC { constructor(config?: RTCConfiguration) { super(config); (window as any).fileTestPCs.push(this); } };
      const NativeWS = window.WebSocket; (window as any).fileTestMessages = [];
      window.WebSocket = class extends NativeWS { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); this.addEventListener('message', e => (window as any).fileTestMessages.push(JSON.parse(e.data))); } };
    });
    await Promise.all([a, b, c].map(p => gotoRoom(p, '/room/f15?name=FileTester')));
    await expect(a.getByRole('button', { name: 'Ver participantes (3)', exact: true }).first()).toBeVisible();
    expect(await a.evaluate(() => (window as any).fileTestPCs.length)).toBe(0);
    await open(a);
    const bytes = Buffer.from(Array.from({ length: 100_003 }, (_, i) => i % 256));
    await send(a, bytes);
    await expect(b.getByRole('button', { name: 'Arquivo recebido — revisar solicitação' })).toBeVisible();
    await b.getByRole('button', { name: 'Arquivo recebido — revisar solicitação' }).click();
    await c.getByRole('button', { name: 'Arquivo recebido — revisar solicitação' }).click();
    expect(await b.evaluate(() => (window as any).fileTestPCs.length)).toBe(0);
    await c.getByRole('button', { name: 'Recusar', exact: true }).click();
    const accept = b.getByRole('button', { name: 'Aceitar', exact: true });
    if (mobile) await accept.tap(); else { await accept.focus(); await b.keyboard.press('Enter'); }
    await expect(b.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 20000 });
    await expect(a.getByText('Concluído', { exact: true })).toBeVisible();
    await expect(a.getByText('Recusado', { exact: true })).toBeVisible();
    await a.screenshot({ path: test.info().outputPath('sender.png') });
    await b.screenshot({ path: test.info().outputPath('receiver.png') });
    for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await a.locator('video').count()).toBe(0);
    const downloadEvent = b.waitForEvent('download'); await b.getByRole('button', { name: 'Baixar arquivo' }).click(); const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('binary.html'); expect(await fs.readFile((await download.path())!)).toEqual(bytes);
    const messages = await b.evaluate(() => (window as any).fileTestMessages.filter((m: any) => m.type === 'file-event'));
    expect(messages.every((m: any) => !('bytes' in m) && JSON.stringify(m).length < 1024)).toBe(true);
    // A second operation reuses the spectator connection; one cancels, the other completes.
    await send(a, Buffer.alloc(2 * 1024 * 1024, 37), 'second.bin');
    await b.getByRole('button', { name: 'Aceitar', exact: true }).click();
    await c.getByRole('button', { name: 'Aceitar', exact: true }).click();
    const receiving = b.locator('[data-transfer-id]').filter({ hasText: 'second.bin' });
    await receiving.getByRole('button', { name: 'Cancelar entrega' }).click();
    await expect(receiving.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 30000 });
    await expect(a.locator('[data-transfer-id]').filter({ hasText: 'second.bin' }).filter({ hasText: 'Concluído' })).toHaveCount(1);
    // Both recipients complete the same operation, including the exact 20 MiB boundary on desktop.
    const allBytes = Buffer.alloc(mobile ? 131_073 : 20 * 1024 * 1024, 71);
    await send(a, allBytes, 'all.bin');
    await Promise.all([b, c].map(p => p.getByRole('button', { name: 'Aceitar', exact: true }).click()));
    for (const page of [b, c]) {
      const item = page.locator('[data-transfer-id]').filter({ hasText: 'all.bin' });
      await expect(item.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 90000 });
      const event = page.waitForEvent('download'); await item.getByRole('button', { name: 'Baixar arquivo' }).click();
      expect(await fs.readFile((await (await event).path())!)).toEqual(allBytes);
    }
    await expect(a.getByText('Concluído', { exact: true })).toHaveCount(2);
    // Oversized files are rejected before hashing/signaling.
    await a.getByLabel('Escolher arquivo').setInputFiles({ name: 'too-big', mimeType: '', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await a.getByRole('button', { name: 'Confirmar envio' }).click();
    await expect(a.getByRole('alert')).toContainText('20 MiB');
  } catch (e) {
    const details = await Promise.allSettled(pages.map(p => p.evaluate(() => ({
      pcs: (window as any).fileTestPCs.map((pc: RTCPeerConnection) => ({ connection: pc.connectionState, signaling: pc.signalingState, sctp: pc.sctp?.state })),
      states: [...document.querySelectorAll('[data-transfer-id] [role="status"]')].map(e => e.textContent),
    }))));
    await test.info().attach('file-transport-state', { body: JSON.stringify(details), contentType: 'application/json' }); throw e;
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test('F15: presenter connection reuse, bidirectional requests, disconnect cancellation and late join', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const [a, b, late] = await Promise.all(contexts.map(c => c.newPage()));
    for (const page of [a, b]) await page.addInitScript(() => {
      const PC = window.RTCPeerConnection; (window as any).pcs = [];
      window.RTCPeerConnection = class extends PC { constructor(config?: RTCConfiguration) { super(config); (window as any).pcs.push(this); } };
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const ctx = canvas.getContext('2d')!; setInterval(() => { ctx.fillStyle = Math.random() > .5 ? '#f00' : '#00f'; ctx.fillRect(0, 0, 320, 180); }, 100);
        return canvas.captureStream(10);
      } });
    });
    await Promise.all([a, b].map(p => gotoRoom(p, '/room/f15-media')));
    await expect(a.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await a.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await a.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await expect.poll(() => b.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(320);
    await open(a, 2); await open(b, 2);
    await Promise.all([send(a, Buffer.alloc(100_000, 41), 'a.bin'), send(b, Buffer.alloc(100_000, 42), 'b.bin')]);
    await Promise.all([a, b].map(p => p.getByRole('button', { name: 'Aceitar', exact: true }).click()));
    for (const page of [a, b]) {
      await expect(page.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 20000 });
      expect(await page.evaluate(() => (window as any).pcs.filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed').length)).toBe(1);
    }
    await a.getByRole('button', { name: 'Fechar lista de participantes' }).click();
    await a.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(b.locator('video')).toHaveCount(0);
    await gotoRoom(late, '/room/f15-media');
    await open(a); await send(a, Buffer.alloc(20 * 1024 * 1024, 19), 'interrupted.bin');
    await b.getByRole('button', { name: 'Aceitar', exact: true }).click();
    await contexts[1].close();
    await expect(a.locator('[data-transfer-id]').filter({ hasText: 'interrupted.bin' }).filter({ hasText: 'Cancelado' })).toHaveCount(1);
    await late.getByRole('button', { name: 'Arquivo recebido — revisar solicitação' }).click();
    await late.getByRole('button', { name: 'Recusar', exact: true }).click();
    await a.getByRole('button', { name: 'Fechar lista de participantes' }).click();
    await a.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await a.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await expect.poll(() => late.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(320);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
