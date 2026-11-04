import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Prijava prek pojavnega okna Firebase Auth Emulatorja (research R-09). Okno je del emulatorja, ne aplikacije,
// zato njegova imena niso v plan.md; iščejo se po vlogah in oznakah okna emulatorja.

export interface TestUser {
  email: string;
  name: string;
}

/** Nov uporabnik z edinstvenim e-naslovom (emulator in baza sta skupna vsem testom). */
export function uniqueUser(name = 'Ana Novak'): TestUser {
  return { email: `e2e-${randomUUID()}@primer.si`, name };
}

/** Klikne »Prijava z Googlom« (sl ali en) in v oknu emulatorja izbere obstoječ račun ali ga ustvari. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  const popupOpened = page.waitForEvent('popup');
  await page.getByRole('button', { name: /^(Prijava z Googlom|Sign in with Google)$/ }).click();
  const popup = await popupOpened;
  await popup.waitForLoadState();
  const popupClosed = popup.waitForEvent('close');

  const existing = popup.getByRole('listitem').filter({ hasText: user.email });
  if ((await existing.count()) > 0) {
    await existing.first().click();
  } else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await popup.getByLabel('Email', { exact: true }).fill(user.email);
    await popup.getByLabel('Display name', { exact: true }).fill(user.name);
    const submit = popup.getByRole('button', { name: /Sign in with Google/ });
    await expect(submit).toBeEnabled();
    await submit.click();
  }
  await popupClosed;
}
