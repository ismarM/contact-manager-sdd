import { expect, type Locator, type Page } from '@playwright/test';

import { t } from './apiKeys';

// Pomočniki za navigacijo v E2E (FR-020-27, R-10): odpiranje skupine in glavna navigacija delujejo pri 360 in 1280 px.
// Dostopna imena se berejo iz prevodov (konstitucija §3.3). Pri ≥ 1024 px je stranski pas, pod tem preklopnik skupin.

/** Širina od 1024 px: stranski pas namesto preklopnika. */
export function isWideViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

/** Povezava ali meni postavke glavne navigacije: stranski pas (širok zaslon) ali ustrezna povezava na strani. */
function mainLink(page: Page, name: string): Locator {
  return page.getByRole('link', { name, exact: true }).first();
}

/** Odpre skupino po naslovu: povezava v stranskem pasu (≥ 1024 px) ali v meniju preklopnika (pod tem). */
export async function openGroup(page: Page, title: string): Promise<void> {
  if (isWideViewport(page)) {
    await page
      .getByRole('navigation', { name: t('groups.myGroups') })
      .getByRole('link', { name: title, exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: t('groups.switchGroup') }).click();
    await page
      .getByRole('menu', { name: t('groups.switchGroup') })
      .getByRole('menuitem', { name: title, exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/groups\/[^/]+\//);
}

/** Zaslon *Skupine* (`/`). */
export async function goToGroups(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: t('groups.heading') })).toBeVisible();
}

/** Zaslon *Arhivirane skupine* prek povezave na zaslonu *Skupine* ali v navigaciji. */
export async function goToArchived(page: Page): Promise<void> {
  await mainLink(page, t('groups.archivedList.link')).click();
  await expect(page).toHaveURL(/\/groups\/archived$/);
}

/** Zaslon *Povabila*: povezava v glavi z morebitnim številom novih (»Povabila, 1 novo«). */
export async function goToInvitations(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: new RegExp(`^${t('invitations.link.name')}`) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/invitations$/);
}

/** Zaslon *Moj račun* prek menija računa. */
export async function goToAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Meni računa|Account menu)$/ }).click();
  await page.getByRole('menuitem', { name: t('shell.myAccount') }).click();
  await expect(page.getByRole('heading', { level: 1, name: t('account.heading') })).toBeVisible();
}
