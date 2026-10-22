import { test, expect } from '@playwright/test';
import path from 'node:path';

for (const width of [1280, 768, 390, 320]) {
  test(`documents and landing navigation at ${width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 390 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    for (const [route, title, other] of [
      ['/termos', 'Termos de Uso', 'Política de Privacidade'],
      ['/privacidade', 'Política de Privacidade', 'Termos de Uso'],
    ]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await page.reload();
      await expect(page).toHaveTitle(`${title} — Janjalive`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Minuta/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expect(page.getByText('Minuta para revisão — sem vigência definida')).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Ir para o documento' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('main')).toBeFocused();
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).length);
      expect(overflow).toBe(0);
      const target = page.getByRole('navigation', { name: 'Seções do documento' }).getByRole('link').first();
      if (width <= 390) await target.tap(); else await target.click();
      await expect(page).toHaveURL(/#/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.resolve(`../../screenshots/legal/${route.slice(1)}-${width}-top.png`) });
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
      await page.screenshot({ path: path.resolve(`../../screenshots/legal/${route.slice(1)}-${width}.png`), fullPage: true });
      await page.getByRole('contentinfo').getByRole('link', { name: other, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other);
      await page.getByRole('link', { name: 'Voltar ao início' }).click();
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Compartilhamento');
    }
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'Privacidade', exact: true })).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    await footer.screenshot({ path: path.resolve(`../../screenshots/legal/landing-${width}.png`) });
    await footer.getByRole('link', { name: 'Termos de Uso' }).click();
    await expect(page).toHaveURL('/termos');
    await page.getByRole('link', { name: 'Voltar ao início' }).click();
    await footer.getByRole('link', { name: 'Privacidade', exact: true }).click();
    await expect(page).toHaveURL('/privacidade');
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('landing still creates a room and a guest joins by code', async ({ browser }) => {
  const host = await browser.newPage();
  await host.goto('/');
  await host.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.includes('Criar sala') && Object.keys(button).some(key => key.startsWith('__reactProps'))));
  await host.getByRole('button', { name: 'Criar sala', exact: true }).click();
  await expect(host).toHaveURL(/\/room\/[a-zA-Z0-9_-]+/);
  const roomId = new URL(host.url()).pathname.split('/').pop()!;
  const guest = await browser.newPage();
  await guest.goto('/');
  await guest.getByRole('button', { name: 'Entrar com código', exact: true }).click();
  await guest.getByLabel('Código ou link da sala').fill(roomId);
  await guest.getByRole('button', { name: 'Entrar na sala', exact: true }).click();
  await expect(guest).toHaveURL(new RegExp(`/room/${roomId}$`));
  await expect(guest.getByRole('banner').getByRole('button', { name: 'Ver participantes (2)' })).toBeVisible();
  await expect(host.getByRole('banner').getByRole('button', { name: 'Ver participantes (2)' })).toBeVisible();
  await guest.close(); await host.close();
});
