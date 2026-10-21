import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import fs from 'node:fs/promises';
async function open(page: Page, _count = 3) {
  if (!await page.getByRole('button', { name: 'Fechar chat', exact: true }).isVisible()) await page.getByRole('button', { name: /Abrir chat/ }).first().click();
}
async function send(page: Page, bytes: Buffer, name = 'binary.html') {

  await page.getByLabel('Escolher arquivo').setInputFiles({ name, mimeType: 'text/html', buffer: bytes });
  for (const box of await page.getByRole('checkbox').all()) {
    if (!await box.isChecked()) { if ((page.viewportSize()?.width ?? 1280) < 500) await box.tap(); else await box.check(); }
    expect(await box.evaluate(input => input.closest('label')!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`compose-${name}.png`) });
  await page.getByRole('button', { name: /Solicitar envio/ }).click();
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
    await expect(b.getByRole('button', { name: /Abrir chat, .* solicitações de arquivo/ })).toBeVisible();
    await b.getByRole('button', { name: /Abrir chat, .* solicitações de arquivo/ }).click();
    await c.getByRole('button', { name: /Abrir chat, .* solicitações de arquivo/ }).click();
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('request.png') });
    expect(await b.evaluate(() => (window as any).fileTestPCs.length)).toBe(0);
    await c.getByRole('button', { name: 'Recusar', exact: true }).click();
    const accept = b.getByRole('button', { name: 'Aceitar', exact: true });
    if (mobile) await accept.tap(); else { await accept.focus(); await b.keyboard.press('Enter'); }
    await expect(b.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 20000 });
    await expect(a.getByText('Concluído', { exact: true })).toBeVisible();
    await expect(a.getByText('Recusado', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    await open(b);
    await expect(b.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible();
    await expect(a.locator('[data-file-card]')).toHaveCount(1);
    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('sender.png') });
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('receiver.png') });
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
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('progress.png') });
    const receiving = b.locator('[data-file-card]').filter({ hasText: 'second.bin' });
    await receiving.getByRole('button', { name: 'Cancelar entrega' }).click();
    await expect(receiving.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 30000 });
    await expect(a.locator('[data-file-card]').filter({ hasText: 'second.bin' }).locator('[data-transfer-id]').filter({ hasText: 'Concluído' })).toHaveCount(1);
    // Both recipients complete the same operation, including the exact 20 MiB boundary on desktop.
    const allBytes = Buffer.alloc(mobile ? 131_073 : 20 * 1024 * 1024, 71);
    await send(a, allBytes, 'all.bin');
    await Promise.all([b, c].map(p => p.getByRole('button', { name: 'Aceitar', exact: true }).click()));
    for (const page of [b, c]) {
      const item = page.locator('[data-file-card]').filter({ hasText: 'all.bin' });
      await expect(item.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 90000 });
      const event = page.waitForEvent('download'); await item.getByRole('button', { name: 'Baixar arquivo' }).click();
      expect(await fs.readFile((await (await event).path())!)).toEqual(allBytes);
    }
    await expect(a.getByText('Concluído', { exact: true })).toHaveCount(2);
    // Oversized files are rejected before hashing/signaling.
    await a.getByLabel('Escolher arquivo').setInputFiles({ name: 'too-big', mimeType: '', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
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
    await b.getByRole('button', { name: 'Fechar chat' }).click();
    await b.getByRole('button', { name: /Cinema/ }).first().click();
    await send(a, Buffer.alloc(1000), 'cinema.bin');
    await open(b);
    await expect(b.getByRole('button', { name: 'Aceitar', exact: true })).toBeVisible();
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('cinema-request.png') });
    await b.getByRole('button', { name: 'Fechar chat' }).click();
    await b.getByRole('button', { name: /Tela cheia/i }).first().click();
    await expect.poll(() => b.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await open(b);
    expect(await b.locator('[data-pending-file]').evaluate(n => document.fullscreenElement?.contains(n))).toBe(true);
    await b.screenshot({ animations: 'disabled', path: test.info().outputPath('fullscreen-request.png') });
    await b.getByRole('button', { name: 'Recusar', exact: true }).click();
    await b.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await b.getByRole('button', { name: /Sair do Modo Cinema/ }).click();
    await a.getByRole('button', { name: 'Fechar chat' }).click();
    await a.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(b.locator('video')).toHaveCount(0);
    await gotoRoom(late, '/room/f15-media');
    await open(a); await send(a, Buffer.alloc(20 * 1024 * 1024, 19), 'interrupted.bin');
    await b.getByRole('button', { name: 'Aceitar', exact: true }).click();
    await contexts[1].close();
    await expect(a.locator('[data-file-card]').filter({ hasText: 'interrupted.bin' }).locator('[data-transfer-id]').filter({ hasText: 'Cancelado' })).toHaveCount(1);
    await late.getByRole('button', { name: /Abrir chat, .* solicitações de arquivo/ }).click();
    await late.getByRole('button', { name: 'Recusar', exact: true }).click();
    await a.getByRole('button', { name: 'Fechar chat' }).click();
    await a.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await a.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await expect.poll(() => late.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(320);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

for (const width of [1280, 390, 320]) test(`F15 private chat cards and attachment states ${width}px`, async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 }), browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 }), browser.newContext()]);
  try {
    const [a, b, outsider] = await Promise.all(contexts.map(c => c.newPage()));
    for (const p of [a, b, outsider]) await gotoRoom(p, '/room/f15-private');
    await expect(a.getByRole('button', { name: 'Ver participantes (3)', exact: true }).first()).toBeVisible();
    await open(a); await open(outsider);
    await a.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Rascunho público');
    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('composer.png') });
    await a.getByLabel('Escolher arquivo').setInputFiles({ name: 'private-report.bin', mimeType: '', buffer: Buffer.alloc(2 * 1048576, 37) });
    await a.getByRole('checkbox').first().check();
    await a.screenshot({ animations: 'disabled', path: test.info().outputPath('recipients.png') });
    await a.getByRole('button', { name: /Solicitar envio/ }).click();
    await expect(a.getByRole('textbox', { name: 'Mensagem', exact: true })).toHaveValue('Rascunho público');
    // The first remote checkbox follows room join order. Find its recipient without assumptions.
    await expect(b.getByRole('button', { name: /Abrir chat, .* solicitações de arquivo/ })).toBeVisible();
    const receiver = b;
    const excluded = receiver === b ? outsider : b;
    await open(excluded);
    await expect(excluded.locator('[data-file-card]')).toHaveCount(0);
    await expect(excluded.getByText('private-report.bin')).toHaveCount(0);
    await open(receiver);
    await expect(receiver.getByRole('button', { name: 'Aceitar', exact: true })).toBeVisible();
    await receiver.screenshot({ animations: 'disabled', path: test.info().outputPath('request.png') });
    await receiver.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    await open(receiver);
    await receiver.getByRole('button', { name: 'Aceitar', exact: true }).click();
    await expect(receiver.getByText(/Transferindo/)).toBeVisible();
    await receiver.screenshot({ animations: 'disabled', path: test.info().outputPath('progress.png') });
    await expect(receiver.getByRole('button', { name: 'Baixar arquivo' })).toBeVisible({ timeout: 30000 });
    await receiver.screenshot({ animations: 'disabled', path: test.info().outputPath('complete.png') });
    await a.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(excluded.getByRole('log').getByText('Rascunho público')).toBeVisible();
    for (const p of [a, receiver]) {
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await p.getByRole('log').evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
    }
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
