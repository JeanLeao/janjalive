import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { synthetic, cameraSenders, dock } from './fixtures/camera';

async function createRoom() {
  const ws = new WebSocket('ws://127.0.0.1:4310/signal');
  try {
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const response = new Promise<{ roomId: string; hostCredential: string }>((resolve, reject) => ws.once('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'room-created') resolve(message); else reject(new Error('Cannot create test room'));
    }));
    ws.send(JSON.stringify({ type: 'create-room' }));
    return await response;
  } finally { ws.close(); }
}

for (const mobile of [false, true]) test(`spectator camera approval, preview, camera-only delivery and revocation ${mobile ? 'mobile' : 'desktop'}`, async ({ browser }, info) => {
  const room = await createRoom();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1280, height: 800 }, hasTouch: mobile });
  try {
    await hostContext.addInitScript(({ roomId, hostCredential }) => sessionStorage.setItem(`screen_room_session:${roomId}`, JSON.stringify({ hostCredential })), room);
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await synthetic(host); await synthetic(guest);
    await Promise.all([host.goto(`/room/${room.roomId}`), guest.goto(`/room/${room.roomId}`)]);
    await expect(host.getByRole('button', { name: /Ver participantes \(2\)/ }).first()).toBeVisible();
    await dock(guest);
    await guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Cancelar solicitação de câmera', exact: true })).toBeVisible();
    expect(await guest.evaluate(() => (window as any).cameraRequests.length)).toBe(0);
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    await host.getByRole('button', { name: /^Autorizar câmera de / }).click();
    await expect(guest.getByRole('button', { name: 'Ativar câmera', exact: true })).toBeEnabled();
    expect(await guest.evaluate(() => (window as any).cameraRequests.length)).toBe(0);
    await guest.getByRole('button', { name: 'Ativar câmera', exact: true }).focus();
    await guest.keyboard.press('Enter');
    await expect(guest.getByRole('dialog').getByLabel('Prévia local da câmera', { exact: true })).toBeVisible();
    expect(await cameraSenders(guest)).toBe(0);
    expect(await guest.evaluate(() => (window as any).cameraRequests[0].constraints.audio)).toBe(false);
    await guest.getByRole('button', { name: 'Transmitir câmera', exact: true }).click();
    await expect.poll(() => cameraSenders(guest)).toBeGreaterThan(0);
    await host.getByRole('button', { name: 'Fechar lista de participantes', exact: true }).click();
    const gallery = host.getByRole('region', { name: 'Câmeras dos espectadores' });
    await expect(gallery.getByTestId('stage-camera')).toBeVisible();
    await expect.poll(() => gallery.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await expect(guest.getByText('Nenhuma transmissão ativa', { exact: true })).toBeVisible();
    await expect(guest.locator('.floating-dock-bar')).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({ path: info.outputPath(`spectator-camera-${mobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' });
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    await host.getByRole('button', { name: /^Revogar câmera de / }).click();
    await expect.poll(() => guest.evaluate(() => (window as any).cameraTracks[0].readyState)).toBe('ended');
    await expect.poll(() => cameraSenders(guest)).toBe(0);
    await expect(gallery).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true })).toBeVisible();
  } finally { await hostContext.close(); await guestContext.close(); }
});

test('denied requests never capture; revocation invalidates a pending browser permission', async ({ browser }) => {
  const room = await createRoom();
  const hostContext = await browser.newContext(), guestContext = await browser.newContext();
  try {
    await hostContext.addInitScript(({ roomId, hostCredential }) => sessionStorage.setItem(`screen_room_session:${roomId}`, JSON.stringify({ hostCredential })), room);
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await synthetic(host); await synthetic(guest);
    await Promise.all([host.goto(`/room/${room.roomId}`), guest.goto(`/room/${room.roomId}`)]);
    await dock(guest);
    await guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true }).click();
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    await host.getByRole('button', { name: /^Recusar câmera de / }).click();
    await expect(guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true })).toBeVisible();
    expect(await guest.evaluate(() => (window as any).cameraRequests.length)).toBe(0);
    await guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true }).click();
    await host.getByRole('button', { name: /^Autorizar câmera de / }).click();
    await guest.evaluate(() => { (window as any).cameraDeferred = true; });
    await guest.getByRole('button', { name: 'Ativar câmera', exact: true }).click();
    await expect.poll(() => guest.evaluate(() => typeof (window as any).resolveCamera)).toBe('function');
    await host.getByRole('button', { name: /^Revogar câmera de / }).click();
    await expect(guest.getByRole('button', { name: 'Solicitar câmera ao líder', exact: true })).toBeVisible();
    await guest.evaluate(() => (window as any).resolveCamera());
    await expect.poll(() => guest.evaluate(() => (window as any).cameraTracks[0].readyState)).toBe('ended');
    expect(await cameraSenders(guest)).toBe(0);
  } finally { await hostContext.close(); await guestContext.close(); }
});
