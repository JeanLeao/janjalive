import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`F12: protected room creation, creator key modal, visitor key prompt and admission (${mobile ? 'mobile' : 'desktop'})`, async ({ browser }) => {
    const hostContext = await browser.newContext({
      viewport: mobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 },
      hasTouch: mobile,
    });
    const guestContext = await browser.newContext({
      viewport: mobile ? { width: 360, height: 800 } : { width: 1440, height: 1000 },
      hasTouch: mobile,
    });

    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    // 1. Creator visits home page and creates protected room
    await host.goto('/');
    await host.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))
      )
    );

    await host.getByLabel('Seu nickname temporário (opcional)').fill('Criador');

    // Check the protected room checkbox
    const protectCheckbox = host.getByLabel('Proteger sala com chave de acesso');
    await expect(protectCheckbox).toBeVisible();
    await protectCheckbox.check();

    // Click "Criar sala"
    await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
    await expect(host).toHaveURL(/\/room\/[a-f0-9]{32}$/);

    const inviteUrl = host.url();
    expect(new URL(inviteUrl).search).toBe('');

    // 2. Creator sees initial announcement modal with generated key
    const creatorModal = host.getByRole('dialog', { name: 'Sala protegida criada' });
    await expect(creatorModal).toBeVisible();
    const keyInput = creatorModal.getByLabel('Chave de acesso da sala');
    await expect(keyInput).toBeVisible();
    const generatedKey = await keyInput.inputValue();
    expect(generatedKey.length).toBeGreaterThanOrEqual(16);

    // Dismiss creator modal
    await creatorModal.getByRole('button', { name: 'Entendido' }).click();
    await expect(creatorModal).not.toBeVisible();

    // Verify "Protegida" badge is visible in header
    await expect(host.getByText('Protegida')).toBeVisible();

    // 3. Visitor navigates to the room invite link
    await guest.goto(inviteUrl);

    // Visitor sees Key Prompt Modal
    const visitorModal = guest.getByRole('dialog', { name: 'Sala protegida por chave' });
    await expect(visitorModal).toBeVisible();
    const visitorKeyInput = visitorModal.getByTestId('room-key-input');
    await expect(visitorKeyInput).toBeVisible();

    // Visitor tries invalid key first
    await visitorKeyInput.fill('wrong-access-key-123');
    await visitorModal.getByTestId('submit-room-key-btn').click();

    // Expect error feedback
    await expect(guest.getByText('Chave de acesso incorreta')).toBeVisible();

    // Visitor enters valid key
    await visitorKeyInput.fill(generatedKey);
    await visitorModal.getByTestId('submit-room-key-btn').click();

    // Key prompt modal disappears on successful admission
    await expect(visitorModal).not.toBeVisible();

    // Guest is admitted into the room
    await expect(guest.getByText('Protegida')).toBeVisible();

    // 4. Reload restores connection without asking for key again
    await guest.reload();
    await guest.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        button => button.getAttribute('aria-label')?.startsWith('Ver participantes') || button.textContent?.includes('sala •')
      )
    );
    // Key modal should not be shown on legitimate reconnection
    await expect(guest.getByRole('dialog', { name: 'Sala protegida por chave' })).toHaveCount(0);
    await expect(guest.getByText('Protegida')).toBeVisible();

    // 5. Check Invite Modal: contains ONLY clean URL and guidance
    const moreBtn = host.getByRole('button', { name: 'Mais opções da sala' });
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await host.getByRole('menuitem', { name: 'Mostrar QR Code' }).click();
    } else {
      await host.getByRole('button', { name: /QR Code|Convidar/ }).first().click();
    }

    const inviteModal = host.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(inviteModal).toBeVisible();
    const linkInput = inviteModal.getByLabel('Link da sala');
    const copiedLink = await linkInput.inputValue();
    expect(copiedLink).toBe(inviteUrl);
    expect(new URL(copiedLink).search).toBe('');
    await expect(inviteModal.getByText('Sala protegida por chave')).toBeVisible();
    await expect(inviteModal.getByLabel('Chave de acesso da sala')).toHaveValue(generatedKey);
  });
}
