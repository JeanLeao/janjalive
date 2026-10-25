import { gotoRoom } from './fixtures/rooms';
import { test, expect, Page } from '@playwright/test';

async function enableShortcuts(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('screen_room_shortcuts_enabled', 'true');
  });
}

test.describe('F10 — Convites por QR Code', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('Abertura a partir do menu Mais opções no cabeçalho, conteúdo, cópia e restauração de foco via Escape', async ({ page }) => {
    await page.goto('/room/e2e-qr-header?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // 1. Quick copy button in header pill works without opening modal
    const roomPill = page.locator('.room-header-room-pill');
    await expect(roomPill).toBeVisible();
    await roomPill.click();
    await expect(page.getByRole('dialog', { name: 'Convidar para a sala' })).toBeHidden();

    // 2. Open More Options menu in header
    const moreBtn = page.getByRole('button', { name: 'Mais opções da sala' });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    // 3. Click "Mostrar QR Code"
    const qrMenuItem = page.getByRole('menuitem', { name: 'Mostrar QR Code' });
    await expect(qrMenuItem).toBeVisible();
    await qrMenuItem.click();

    // 4. Modal is visible
    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    // Verify Title & Instruction
    await expect(modal.getByText(/Escaneie o QR Code com a câmera do celular/i)).toBeVisible();

    // Verify SVG QR Code rendered
    const qrSvg = modal.locator('svg[role="img"][aria-label*="QR Code"]');
    await expect(qrSvg).toBeVisible();

    // Verify URL input: must have query string and fragment stripped
    const urlInput = modal.getByRole('textbox', { name: 'Link da sala' });
    await expect(urlInput).toBeVisible();
    const inputValue = await urlInput.inputValue();
    expect(inputValue).toContain('/room/e2e-qr-header');
    expect(inputValue).not.toContain('demo=single');
    expect(inputValue).not.toContain('#');

    // Verify local address notice
    await expect(modal.getByText(/A sala está em um endereço local/i)).toBeVisible();

    // Verify "Copiar link" action in modal
    const copyBtn = modal.getByRole('button', { name: 'Copiar link' });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(modal.getByRole('button', { name: 'Link copiado!' })).toBeVisible();

    // 5. Close with Escape key and verify focus restoration to More options button
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(moreBtn).toBeFocused();
  });

  test('Abertura a partir do dock inferior, fechamento por botão Fechar e restauração de foco', async ({ page }) => {
    await page.goto('/room/e2e-qr-dock?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Open dock menu "Configurações e convite"
    await page.getByRole('button', { name: 'Mostrar controles da sala', exact: true }).click();
    const dockSettingsBtn = page.getByRole('button', { name: 'Configurações e convite' });
    await expect(dockSettingsBtn).toBeVisible();
    await dockSettingsBtn.click();

    const qrMenuItem = page.getByRole('menuitem', { name: 'Mostrar QR Code' });
    await expect(qrMenuItem).toBeVisible();
    await qrMenuItem.click();

    // Modal opens
    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    // Close via "Fechar" button
    const closeBtn = modal.getByRole('button', { name: 'Fechar', exact: true });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(modal).toBeHidden();

    // Focus restored to dock settings button
    await expect(dockSettingsBtn).toBeFocused();
  });

  test('Abertura no estado sem transmissão ativa, preservando botão de cópia rápida', async ({ page }) => {
    await gotoRoom(page, '/room/e2e-qr-empty');
    await expect(page.getByText('Nenhuma transmissão ativa')).toBeVisible();
    await expect(page.getByText('Conectado')).toBeVisible();

    // "Copiar convite" button is visible and does not open modal
    const copyInviteBtn = page.getByRole('button', { name: 'Copiar convite' });
    await expect(copyInviteBtn).toBeVisible();
    await copyInviteBtn.click();
    await expect(page.getByRole('dialog', { name: 'Convidar para a sala' })).toBeHidden();

    // "Mostrar QR Code" button is present in empty stage
    const qrStageBtn = page.getByRole('button', { name: 'Mostrar QR Code' });
    await expect(qrStageBtn).toBeVisible();
    await qrStageBtn.click();

    // Modal opens
    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    // Close with header close button
    const headerCloseBtn = modal.getByRole('button', { name: 'Fechar modal de convite' });
    await expect(headerCloseBtn).toBeVisible();
    await headerCloseBtn.click();
    await expect(modal).toBeHidden();

    // Focus restored to "Mostrar QR Code" button
    await expect(qrStageBtn).toBeFocused();
  });

  test('Atalhos F31 (N/P/F/I) permanecem inativos enquanto o modal de QR Code estiver aberto com foco', async ({ page }) => {
    await enableShortcuts(page);
    await page.goto('/room/e2e-qr-shortcuts?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Check Firminha is featured
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();

    // Shortcuts are working: N switches to Ana
    await page.keyboard.press('KeyN');
    await expect(page.locator('.stage-main-container').getByText(/Ana/).first()).toBeVisible();

    // Open QR Code modal from header
    const moreBtn = page.getByRole('button', { name: 'Mais opções da sala' });
    await moreBtn.click();
    await page.getByRole('menuitem', { name: 'Mostrar QR Code' }).click();

    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    // Press N, P, F, I while modal is open -> stream should NOT change, chat panel should NOT open
    await page.keyboard.press('KeyN');
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyF');
    await page.keyboard.press('KeyI');

    // Still Ana (did not change)
    await expect(page.locator('.stage-main-container').getByText(/Ana/).first()).toBeVisible();
    await expect(page.locator('#room-chat-panel')).toBeHidden();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Shortcuts work again after modal closed: P switches back to Firminha
    await page.keyboard.press('KeyP');
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();
  });

  test('Funcionamento no modo Cinema', async ({ page }) => {
    await page.goto('/room/e2e-qr-cinema?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Toggle Cinema mode from stage view controls
    const cinemaBtn = page.locator('[data-control-id="cinema-toggle"]');
    await expect(cinemaBtn).toBeVisible();
    await cinemaBtn.click();

    // Header is hidden in Cinema mode
    await expect(page.locator('.room-header-root')).toBeHidden();

    // Floating dock is still available: open QR modal
    await page.getByRole('button', { name: 'Mostrar controles da sala', exact: true }).click();
    const dockSettingsBtn = page.getByRole('button', { name: 'Configurações e convite' });
    await expect(dockSettingsBtn).toBeVisible();
    await dockSettingsBtn.click();

    await page.getByRole('menuitem', { name: 'Mostrar QR Code' }).click();

    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Still in Cinema mode
    await expect(page.locator('.room-header-root')).toBeHidden();
  });

  test('Layout responsivo em largura de 320 px sem transbordamento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/room/e2e-qr-mobile?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Open modal from dock
    await page.getByRole('button', { name: 'Mostrar controles da sala', exact: true }).click();
    const dockSettingsBtn = page.getByRole('button', { name: 'Configurações e convite' });
    await dockSettingsBtn.click();
    await page.getByRole('menuitem', { name: 'Mostrar QR Code' }).click();

    const modal = page.getByRole('dialog', { name: 'Convidar para a sala' });
    await expect(modal).toBeVisible();

    // Check no horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);

    // QR Code and buttons are visible and functional
    await expect(modal.locator('svg[role="img"][aria-label*="QR Code"]')).toBeVisible();
    const copyBtn = modal.getByRole('button', { name: 'Copiar link' });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(modal.getByRole('button', { name: 'Link copiado!' })).toBeVisible();
  });
});
