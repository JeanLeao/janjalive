import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`F11: creation, host recovery, moderation and invitations (${mobile ? 'mobile' : 'desktop'})`, async ({ browser }) => {
    const hostContext = await browser.newContext({ viewport: mobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 }, hasTouch: mobile });
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    try {
      await hostContext.addInitScript(() => {
        const NativeSocket = window.WebSocket;
        (window as any).f11Sockets = [];
        window.WebSocket = class extends NativeSocket {
          constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); (window as any).f11Sockets.push(this); }
        };
        localStorage.setItem('screen_room_shortcuts_enabled', 'true');
      });
      await host.goto('/');
      await host.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
      await host.getByLabel('Seu nickname temporário (opcional)').fill('Criador');
      await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
      await expect(host).toHaveURL(/\/room\/[a-f0-9]{32}$/);
      const invite = host.url();
      expect(new URL(invite).search).toBe('');
      await guest.goto(invite);
      await host.getByRole('button', { name: /Ver participantes/ }).first().click();
      const drawer = host.getByRole('dialog', { name: 'Participantes', exact: true });
      await expect(drawer.getByText('Você é o host desta sala.')).toBeVisible();
      await expect(drawer.getByText('Host', { exact: true })).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^Remover / })).toHaveCount(1);
      await drawer.getByRole('button', { name: 'Bloquear entradas', exact: true }).click();
      await expect(drawer.getByText('Sala bloqueada', { exact: true })).toBeVisible();
      await expect(drawer.getByText('Novas entradas bloqueadas.', { exact: true })).toBeVisible();
      await host.screenshot({ path: test.info().outputPath(`f11-${mobile ? 'mobile' : 'desktop'}-locked.png`) });
      await guest.getByRole('button', { name: /Ver participantes/ }).first().click();
      const guestDrawer = guest.getByRole('dialog', { name: 'Participantes', exact: true });
      await expect(guestDrawer.getByRole('button', { name: 'Bloquear entradas' })).toHaveCount(0);
      await expect(guestDrawer.getByRole('button', { name: /^Remover / })).toHaveCount(0);
      const denied = await guestContext.newPage();
      await denied.goto(invite);
      await expect(denied.getByRole('alert')).toContainText('Sala bloqueada pelo host');
      // Reload restores both independent credentials from this tab's room session.
      await host.reload();
      await host.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label')?.startsWith('Ver participantes') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await host.getByRole('button', { name: /Ver participantes/ }).first().click();
      await expect(drawer.getByText('Você é o host desta sala.')).toBeVisible();
      await expect(drawer.getByText('Sala bloqueada', { exact: true })).toBeVisible();
      const remove = drawer.getByRole('button', { name: /^Remover / });
      if (mobile) await remove.tap(); else { await remove.focus(); await host.keyboard.press('Enter'); }
      await expect(drawer.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
      await host.keyboard.press('Escape');
      await expect(remove).toBeFocused();
      await remove.click();
      await host.screenshot({ path: test.info().outputPath(`f11-${mobile ? 'mobile' : 'desktop'}-confirmation.png`) });
      await drawer.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
      await expect(guest.getByRole('alert')).toContainText('Você foi removido da sala pelo host');
      await expect(drawer.getByText('Participante removido.', { exact: true })).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^Remover / })).toHaveCount(0);
      await drawer.getByRole('button', { name: 'Desbloquear entradas', exact: true }).click();
      await expect(drawer.getByText('Entradas abertas', { exact: true })).toBeVisible();
      await drawer.getByRole('button', { name: 'Fechar lista de participantes' }).click();
      await host.getByRole('button', { name: 'Mais opções da sala' }).click();
      await host.getByRole('menuitem', { name: 'Mostrar QR Code' }).click();
      await expect(host.getByRole('textbox', { name: 'Link da sala' })).toHaveValue(invite);
      await host.keyboard.press('Escape');
      const fresh = await guestContext.newPage(); await fresh.goto(invite);
      await expect(fresh.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await fresh.getByRole('button', { name: /Ver participantes/ }).first().click();
      await expect(fresh.getByRole('dialog', { name: 'Participantes', exact: true }).getByText('Host', { exact: true })).toBeVisible();
      await host.getByRole('button', { name: 'Mais opções da sala' }).click();
      await host.getByRole('menuitem', { name: 'Sair da sala', exact: true }).click();
      await expect(fresh.getByText('Sala sem administrador. Novas entradas permanecem abertas.')).toBeVisible();
    } finally { await hostContext.close(); await guestContext.close(); }
  });
}

test('F11: nonexistent room has clear guidance and never creates a room', async ({ page }) => {
  await page.goto('/room/f11-never-created');
  await expect(page.getByRole('alert')).toContainText('Crie uma nova sala na página inicial');
});

test('F11: removal stops pending capture and prevents automatic recovery', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const host = await a.newPage(), guest = await b.newPage();
  try {
    await b.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      (window as any).socketCount = 0;
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes('/signal')) (window as any).socketCount++; }
      };
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
        (window as any).captureRequested = true;
        await new Promise<void>(resolve => { (window as any).releaseCapture = resolve; });
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
        const stream = canvas.captureStream(15); (window as any).captured = stream;
        return stream;
      } });
    });
    await host.goto('/');
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
    await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
    await expect(host).toHaveURL(/\/room\/[a-f0-9]{32}$/);
    await guest.goto(host.url());
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await guest.getByRole('button', { name: 'Compartilhar tela', exact: true }).first().click();
    await expect.poll(() => guest.evaluate(() => (window as any).captureRequested)).toBe(true);
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    const drawer = host.getByRole('dialog', { name: 'Participantes', exact: true });
    await drawer.getByRole('button', { name: /^Remover / }).click();
    await drawer.getByRole('button', { name: 'Confirmar remoção' }).click();
    await expect(guest.getByRole('alert')).toContainText('removido da sala');
    await guest.evaluate(() => (window as any).releaseCapture());
    await expect.poll(() => guest.evaluate(() => (window as any).captured?.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
    await guest.getByRole('button', { name: 'Compartilhar tela', exact: true }).first().click();
    await guest.waitForTimeout(1800); // Longer than the initial reconnect delay; terminal removal must stay closed.
    expect(await guest.evaluate(() => (window as any).socketCount)).toBe(1);
    expect(await guest.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('screen_room_session:')).length)).toBe(0);
  } finally { await a.close(); await b.close(); }
});


test('F11: history navigation discards revoked sessions while reload and socket loss recover the host', async ({ browser }) => {
  const hostContext = await browser.newContext(), guestContext = await browser.newContext();
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  try {
    await hostContext.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      (window as any).f11Sockets = [];
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as any).f11Sockets.push(this);
        }
      };
    });
    await host.goto('/');
    await host.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
    await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
    await expect(host).toHaveURL(/\/room\/[a-f0-9]{32}$/);
    const invite = host.url();
    const storageKey = `screen_room_session:${new URL(invite).pathname.split('/').pop()}`;
    // Put the home route behind the guest's room entry without reloading the document.
    await guest.goto('/');
    await guest.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
    await guest.evaluate(url => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); }, invite);
    const count = (page: typeof host, n: number) => page.getByRole('button', { name: `Ver participantes (${n})`, exact: true }).first();
    await expect(count(host, 2)).toBeVisible();
    const assertHost = async () => {
      await host.getByRole('button', { name: /Ver participantes/ }).first().click();
      await expect(host.getByText('Você é o host desta sala.', { exact: true })).toBeVisible();
      await host.getByRole('button', { name: 'Fechar lista de participantes' }).click();
    };
    await assertHost();
    await host.reload();
    await expect(count(host, 2)).toBeVisible();
    await assertHost();
    await host.evaluate(() => {
      (window as any).f11Sockets.filter((socket: WebSocket) => socket.readyState === 1 && socket.url.includes('/signal')).forEach((socket: WebSocket) => socket.close(4001));
    });
    await expect(count(guest, 1)).toBeVisible();
    await expect(count(guest, 2)).toBeVisible();
    await expect(count(host, 2)).toBeVisible();
    await assertHost();

    await guest.goBack();
    await expect(guest).toHaveURL(/\/$/);
    await expect(count(host, 1)).toBeVisible();
    expect(await guest.evaluate(key => sessionStorage.getItem(key) === null, storageKey)).toBe(true);
    await guest.goForward();
    await expect(count(guest, 2)).toBeVisible();

    await host.goBack();
    await expect(host).toHaveURL(/\/$/);
    await expect(count(guest, 1)).toBeVisible();
    expect(await host.evaluate(key => sessionStorage.getItem(key) === null, storageKey)).toBe(true);
    await host.goForward();
    await expect(count(host, 2)).toBeVisible();
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    const drawer = host.getByRole('dialog', { name: 'Participantes', exact: true });
    await expect(drawer.getByText('Sala sem administrador. Novas entradas permanecem abertas.')).toBeVisible();
    await expect(drawer.getByText('Você é o host desta sala.', { exact: true })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: /^Remover |Bloquear entradas/ })).toHaveCount(0);
    await host.reload();
    await expect(count(host, 2)).toBeVisible();
    await host.getByRole('button', { name: /Ver participantes/ }).first().click();
    await expect(drawer.getByText('Você é o host desta sala.', { exact: true })).toHaveCount(0);
  } finally { await hostContext.close(); await guestContext.close(); }
});
