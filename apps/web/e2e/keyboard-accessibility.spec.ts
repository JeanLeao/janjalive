import { test, expect } from '@playwright/test';

test.describe('F31 - Atalhos de teclado e acessibilidade', () => {
  test('Alt+Shift+I abre e foca o painel de interações sem fechá-lo inesperadamente, e Escape restaura o foco', async ({ page }) => {
    await page.goto('/room/e2e-f31-interactions?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Initially chat panel is closed
    const panel = page.locator('#room-chat-panel');
    await expect(panel).toBeHidden();

    // Focus on copy invite button to establish focus before shortcut
    const inviteBtn = page.getByRole('button', { name: 'Copiar convite' }).first();
    if (await inviteBtn.isVisible()) {
      await inviteBtn.focus();
    }

    // Press Alt+Shift+I to open interactions panel
    await page.keyboard.press('Alt+Shift+KeyI');
    await expect(panel).toBeVisible();

    // Verify focus is inside the panel (panel itself or chat textarea)
    const isFocusInPanel = await page.evaluate(() => {
      const p = document.getElementById('room-chat-panel');
      return p ? p.contains(document.activeElement) : false;
    });
    expect(isFocusInPanel).toBe(true);

    // Pressing Alt+Shift+I again when already open MUST NOT close it, but keep/direct focus inside
    await page.keyboard.press('Alt+Shift+KeyI');
    await expect(panel).toBeVisible();
    const isStillFocusedInPanel = await page.evaluate(() => {
      const p = document.getElementById('room-chat-panel');
      return p ? p.contains(document.activeElement) : false;
    });
    expect(isStillFocusedInPanel).toBe(true);

    // Escape closes panel and returns focus
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    // Focus should be restored (not on document.body)
    const activeTagName = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeTagName).not.toBe('BODY');
  });

  test('Atalhos não disparam durante digitação em campos de texto e contextos de navegação', async ({ page }) => {
    await page.goto('/room/e2e-f31-typing?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // 1. Chat textarea
    await page.keyboard.press('Alt+Shift+KeyI');
    const panel = page.locator('#room-chat-panel');
    await expect(panel).toBeVisible();

    const textarea = page.getByRole('textbox', { name: 'Mensagem' });
    await textarea.focus();
    await expect(textarea).toBeFocused();

    // Press Alt+Shift+N while typing in textarea - should NOT switch streams or close panel
    await page.keyboard.press('Alt+Shift+KeyN');
    await textarea.type('Mensagem de teste');

    // Ensure chat panel is still open and textarea has content
    await expect(textarea).toHaveValue('Mensagem de teste');
    await expect(panel).toBeVisible();

    // Primary stream remains Firminha (not switched)
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();

    // 2. Q&A textbox
    const qaTab = page.getByRole('tab', { name: /^Perguntas/ });
    await qaTab.click();
    const qInput = page.getByRole('textbox', { name: 'Pergunta' });
    await qInput.focus();
    await expect(qInput).toBeFocused();
    await page.keyboard.press('Alt+Shift+KeyN');
    await page.keyboard.press('Alt+Shift+KeyF');
    // Neither stream switched nor fullscreen entered
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

    // Close panel with Escape
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    // 3. Participants nickname input
    const participantsBtn = page.getByRole('banner').getByRole('button', { name: /ver participantes/i });
    await participantsBtn.click();
    const participantsDrawer = page.getByRole('dialog', { name: 'Participantes' });
    await expect(participantsDrawer).toBeVisible();

    const editNickBtn = participantsDrawer.getByRole('button', { name: 'Alterar seu nickname' });
    await editNickBtn.click();
    const nickInput = participantsDrawer.getByRole('textbox', { name: 'Seu nickname' });
    await expect(nickInput).toBeVisible();
    await nickInput.focus();
    await page.keyboard.press('Alt+Shift+KeyN');
    await page.keyboard.press('Alt+Shift+KeyP');
    // Stream not switched
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();

    // Cancel nickname edit
    await nickInput.press('Escape');
    await expect(nickInput).toBeHidden();
    const closeParticipantsBtn = participantsDrawer.getByRole('button', { name: /fechar lista de participantes/i });
    await closeParticipantsBtn.click();
    await expect(participantsDrawer).toBeHidden();
  });

  test('Alt+Shift+N e Alt+Shift+P navegam circularmente entre transmissões e anunciam via live region', async ({ page }) => {
    await page.goto('/room/e2e-f31-cycle?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // In demo=multi, there are two streams: Firminha and Ana
    const liveRegion = page.locator('[data-stage-live-region]');
    await expect(liveRegion).toBeAttached();

    // Initial spotlight
    const badge = page.locator('.stage-main-container').getByText(/Firminha/);
    await expect(badge.first()).toBeVisible();

    // Press Alt+Shift+N to go to next stream (Ana)
    await page.keyboard.press('Alt+Shift+KeyN');
    const anaBadge = page.locator('.stage-main-container').getByText(/Ana/);
    await expect(anaBadge.first()).toBeVisible();
    await expect(liveRegion).toContainText('Transmissão principal: Ana');

    // Press Alt+Shift+N again (circular back to Firminha)
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(badge.first()).toBeVisible();
    await expect(liveRegion).toContainText('Transmissão principal: Firminha');

    // Press Alt+Shift+P (circular back to Ana)
    await page.keyboard.press('Alt+Shift+KeyP');
    await expect(anaBadge.first()).toBeVisible();
    await expect(liveRegion).toContainText('Transmissão principal: Ana');
  });

  test('Navegação entre transmissões com fonte única é no-op', async ({ page }) => {
    await page.goto('/room/e2e-f31-single?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Only Firminha
    const badge = page.locator('.stage-main-container').getByText(/Firminha/);
    await expect(badge.first()).toBeVisible();

    // Press Alt+Shift+N - should not crash or change stream
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(badge.first()).toBeVisible();

    // Press Alt+Shift+P - should not crash or change stream
    await page.keyboard.press('Alt+Shift+KeyP');
    await expect(badge.first()).toBeVisible();
  });

  test('Modo Comparar: atalhos alteram apenas transmissão principal e preservam secundária', async ({ page }) => {
    await page.goto('/room/e2e-f31-compare?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Click compare button
    const compareBtn = page.getByRole('button', { name: 'Comparar' });
    await compareBtn.click();

    // Verify comparison mode active
    const primarySelector = page.locator('select[aria-label="Transmissão principal"]');
    const secondarySelector = page.locator('select[aria-label="Transmissão secundária"]');
    await expect(primarySelector).toBeVisible();
    await expect(secondarySelector).toBeVisible();

    // Verify initial values
    await expect(primarySelector).toHaveValue('peer_firminha');
    await expect(secondarySelector).toHaveValue('peer_ana');

    // Press Alt+Shift+N: swaps primary to peer_ana
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(primarySelector).toHaveValue('peer_ana');
    // Secondary becomes peer_firminha
    await expect(secondarySelector).toHaveValue('peer_firminha');
  });

  test('Troca de transmissão por clique em miniatura restaura foco adequadamente', async ({ page }) => {
    await page.goto('/room/e2e-f31-focus-stream?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    const previewBtn = page.locator('.secondary-preview-btn').first();
    await expect(previewBtn).toBeVisible();

    // Focus and click the secondary preview
    await previewBtn.focus();
    await expect(previewBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // The clicked preview was Ana and is now primary.
    // The previous primary (Firminha) is now the secondary preview card.
    // Focus should be restored to the new preview card, not lost to body.
    await page.waitForTimeout(100);
    const activeIsBody = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBody).toBe(false);

    const activeClass = await page.evaluate(() => document.activeElement?.className);
    expect(activeClass).toContain('secondary-preview-btn');
  });

  test('Q&A inline: cancelar, publicar ou encerrar edição restaura o foco previsivelmente', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('screen_room_display_name', 'Apresentador');
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx2d = canvas.getContext('2d')!;
          ctx2d.fillStyle = '#0f172a';
          ctx2d.fillRect(0, 0, 640, 360);
          return canvas.captureStream(15);
        },
      });
    });

    await page.goto('/room/e2e-f31-qa');
    await page.waitForLoadState('networkidle');

    // Start sharing screen to become presenter
    await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    const liveBtn = page.getByRole('button', { name: 'Entrar ao vivo', exact: true });
    await expect(liveBtn).toBeVisible();
    await liveBtn.click();
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Open chat and switch to Perguntas
    await page.keyboard.press('Alt+Shift+KeyI');
    const qaTab = page.getByRole('tab', { name: /^Perguntas/ });
    await qaTab.click();

    // Submit a question
    const qInput = page.getByRole('textbox', { name: 'Pergunta' });
    await qInput.fill('Qual o cronograma do projeto?');
    await page.getByRole('button', { name: 'Enviar pergunta' }).click();

    // Verify question card appeared
    const qCard = page.locator('[data-testid="qa-question-card"]').first();
    await expect(qCard).toBeVisible();

    // Click Responder button
    const replyBtn = qCard.locator('[data-qa-reply-btn]');
    await expect(replyBtn).toBeVisible();
    await replyBtn.click();

    // Reply textarea appears with Cancelar and Publicar
    const replyTextarea = qCard.getByRole('textbox', { name: 'Resposta da pergunta' });
    await expect(replyTextarea).toBeVisible();

    // Press Escape inside reply textarea -> should cancel and restore focus to replyBtn
    await replyTextarea.press('Escape');
    await expect(replyTextarea).toBeHidden();
    await expect(replyBtn).toBeVisible();
    await expect(replyBtn).toBeFocused();

    // Click reply again, then click Cancelar
    await replyBtn.click();
    await expect(replyTextarea).toBeVisible();
    const cancelBtn = qCard.getByRole('button', { name: 'Cancelar' });
    await cancelBtn.click();
    await expect(replyTextarea).toBeHidden();
    await expect(replyBtn).toBeVisible();
    await expect(replyBtn).toBeFocused();

    // Click reply once more, fill answer and click Publicar resposta
    await replyBtn.click();
    await expect(replyTextarea).toBeVisible();
    await replyTextarea.fill('O cronograma prevê entrega até o fim do mês.');
    const publishBtn = qCard.getByRole('button', { name: 'Publicar resposta' });
    await publishBtn.click();

    // Verify reply textarea closed
    await expect(replyTextarea).toBeHidden();

    // Verify answer is published and visible on card
    const answerEl = qCard.locator('[data-testid="qa-question-answer"]');
    await expect(answerEl).toBeVisible();
    await expect(answerEl).toContainText('O cronograma prevê entrega até o fim do mês.');

    // Verify focus is restored to reply button (now labeled "Editar resposta")
    await expect(replyBtn).toBeVisible();
    await expect(replyBtn).toBeFocused();
  });

  test('Drawers de Participantes e Configurações possuem nomes acessíveis e referência de atalhos', async ({ page }) => {
    await page.goto('/room/e2e-f31-drawers?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Open Settings Drawer
    const settingsBtn = page.getByRole('button', { name: 'Abrir configurações e diagnósticos' });
    await settingsBtn.click();

    // Verify drawer has accessible name "Configurações"
    const settingsDrawer = page.getByRole('dialog', { name: 'Configurações' });
    await expect(settingsDrawer).toBeVisible();

    // Go to "Sobre" tab
    const aboutTab = settingsDrawer.getByRole('tab', { name: 'Sobre' });
    await aboutTab.click();

    // Verify keyboard shortcuts reference card
    await expect(settingsDrawer.getByText('Atalhos de teclado')).toBeVisible();
    await expect(settingsDrawer.getByText('Alt + Shift + N')).toBeVisible();
    await expect(settingsDrawer.getByText('Alt + Shift + P')).toBeVisible();
    await expect(settingsDrawer.getByText('Alt + Shift + F')).toBeVisible();
    await expect(settingsDrawer.getByText('Alt + Shift + I')).toBeVisible();

    // Close Settings Drawer with close button
    const closeSettingsBtn = settingsDrawer.getByRole('button', { name: /fechar configurações/i });
    await closeSettingsBtn.click();
    await expect(settingsDrawer).toBeHidden();

    // Open Participants Drawer
    const participantsBtn = page.getByRole('banner').getByRole('button', { name: /ver participantes/i });
    await participantsBtn.click();

    // Verify drawer has accessible name "Participantes"
    const participantsDrawer = page.getByRole('dialog', { name: 'Participantes' });
    await expect(participantsDrawer).toBeVisible();

    // Test nickname edit focus restoration
    const editNickBtn = participantsDrawer.getByRole('button', { name: 'Alterar seu nickname' });
    await editNickBtn.click();
    const nickInput = participantsDrawer.getByRole('textbox', { name: 'Seu nickname' });
    await expect(nickInput).toBeVisible();
    await nickInput.press('Escape');
    await expect(nickInput).toBeHidden();
    await expect(editNickBtn).toBeFocused();

    // Close Participants Drawer with close button
    const closeParticipantsBtn = participantsDrawer.getByRole('button', { name: /fechar lista de participantes/i });
    await closeParticipantsBtn.click();
    await expect(participantsDrawer).toBeHidden();
  });

  test('Alternância da transmissão com foco nos controles do player principal preserva o foco', async ({ page }) => {
    await page.goto('/room/e2e-f31-ctrl-focus?demo=multi');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // 1. Focus zoom-in control in player
    const zoomInBtn = page.locator('[data-control-id="zoom-in"]').first();
    await expect(zoomInBtn).toBeVisible();
    await zoomInBtn.focus();
    await expect(zoomInBtn).toBeFocused();

    // Switch primary stream via Alt+Shift+N
    await page.keyboard.press('Alt+Shift+KeyN');

    // Primary stream is now Ana
    await expect(page.locator('.stage-main-container').getByText(/Ana/).first()).toBeVisible();

    // Verify focus is preserved on zoom-in button on the new player instance
    await page.waitForTimeout(60);
    const activeIsBody = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBody).toBe(false);

    const activeControlId = await page.evaluate(() => document.activeElement?.getAttribute('data-control-id'));
    expect(activeControlId).toBe('zoom-in');

    // 2. Focus fullscreen toggle control in player
    const fsBtn = page.locator('[data-control-id="fullscreen-toggle"]').first();
    await expect(fsBtn).toBeVisible();
    await fsBtn.focus();
    await expect(fsBtn).toBeFocused();

    // Switch primary stream again via Alt+Shift+N (swaps back to Firminha)
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(page.locator('.stage-main-container').getByText(/Firminha/).first()).toBeVisible();

    // Verify focus is preserved on fullscreen toggle button on the new player instance
    await page.waitForTimeout(60);
    const activeAfterSecondSwitch = await page.evaluate(() => document.activeElement?.getAttribute('data-control-id'));
    expect(activeAfterSecondSwitch).toBe('fullscreen-toggle');
  });

  test('Entrada e saída de fullscreen pelo atalho Alt+Shift+F preserva Fullscreen API e continuidade de foco', async ({ page }) => {
    await page.goto('/room/e2e-f31-fullscreen?demo=single');
    await expect(page.locator('.stage-main-container')).toBeVisible();

    // Focus fullscreen button initially
    const fsBtn = page.locator('[data-control-id="fullscreen-toggle"]').first();
    await expect(fsBtn).toBeVisible();
    await fsBtn.focus();
    await expect(fsBtn).toBeFocused();

    // Trigger fullscreen via shortcut
    await page.keyboard.press('Alt+Shift+KeyF');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

    // Verify focus is not lost to document.body
    await page.waitForTimeout(50);
    const activeIsBodyInFs = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBodyInFs).toBe(false);

    // Exit fullscreen via shortcut
    await page.keyboard.press('Alt+Shift+KeyF');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

    // Verify focus remains within stage controls, not on body
    await page.waitForTimeout(50);
    const activeIsBodyAfterFs = await page.evaluate(() => document.activeElement === document.body);
    expect(activeIsBodyAfterFs).toBe(false);
  });
});

