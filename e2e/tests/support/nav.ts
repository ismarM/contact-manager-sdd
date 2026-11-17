import { expect, type Locator, type Page } from '@playwright/test';

import { t } from './apiKeys';

// Pomočniki za navigacijo v E2E (FR-020-27, R-10): glavna navigacija je stranska vrstica od 1024 px, ploskev z gumbom
// v zgornji vrstici od 640 do 1023 px in spodnja vrstica pod 640 px; skupino zamenja kartica *Trenutna skupina*
// (≥ 1024 px) ali naziv v glavi skupine (pod tem). Dostopna imena se berejo iz prevodov (konstitucija §3.3).

/** Širina od 1024 px: stalna stranska vrstica. */
export function isWideViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1024;
}

/** Širina pod 640 px: spodnja vrstica. */
export function isPhoneViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 640;
}

/** Glavna navigacija za širino okna; na srednji širini najprej odpre ploskev. */
export async function mainNavigation(page: Page): Promise<Locator> {
  if (!isWideViewport(page) && !isPhoneViewport(page)) {
    await page.getByRole('button', { name: t('shell.openNav') }).click();
    return page
      .getByRole('dialog', { name: t('shell.nav') })
      .getByRole('navigation', { name: t('shell.mainNav') });
  }
  return page.getByRole('navigation', { name: t('shell.mainNav') });
}

/**
 * Odpre preklopnik skupin in vrne meni; samo znotraj skupine. Od 1024 px kartica *Trenutna skupina* v stranski vrstici,
 * od 640 do 1023 px ista kartica v ploskvi navigacije, pod 640 px naziv v glavi skupine.
 */
export async function openGroupSwitcher(page: Page): Promise<Locator> {
  if (!isWideViewport(page) && !isPhoneViewport(page)) {
    await page.getByRole('button', { name: t('shell.openNav') }).click();
    await page
      .getByRole('dialog', { name: t('shell.nav') })
      .getByRole('button', { name: t('groups.switchGroup') })
      .click();
  } else {
    await page.getByRole('button', { name: t('groups.switchGroup') }).click();
  }
  const menu = page.getByRole('menu', { name: t('groups.switchGroup') });
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Odpre skupino po naslovu: znotraj skupine prek preklopnika (ohrani zavihek), sicer s zaslona *Skupine* (povezava
 * na kartici skupine).
 */
export async function openGroup(page: Page, title: string): Promise<void> {
  if (/\/groups\/(?!archived)[^/]+\//.test(page.url())) {
    const menu = await openGroupSwitcher(page);
    await menu.getByRole('menuitem', { name: title, exact: true }).click();
  } else {
    await goToGroups(page);
    await page.getByRole('main').getByRole('link', { name: title, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/groups\/[^/]+\//);
}

/** Zaslon *Skupine* (`/`). */
export async function goToGroups(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: t('groups.heading') })).toBeVisible();
}

/** Zaslon *Arhivirane skupine* prek postavke *Arhivirane* glavne navigacije. */
export async function goToArchived(page: Page): Promise<void> {
  const nav = await mainNavigation(page);
  await nav.getByRole('link', { name: t('shell.archived'), exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/archived$/);
}

/** Zaslon *Povabila* prek postavke glavne navigacije (ime z morebitnim številom novih: »Povabila, 1 novo«). */
export async function goToInvitations(page: Page): Promise<void> {
  const nav = await mainNavigation(page);
  await nav.getByRole('link', { name: new RegExp(`^${t('invitations.link.name')}`) }).click();
  await expect(page).toHaveURL(/\/invitations$/);
}

/** Zaslon *Moj račun* prek menija računa (stranska vrstica ali zgornja vrstica). */
export async function goToAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: t('shell.accountMenu') }).click();
  await page.getByRole('menuitem', { name: t('shell.myAccount') }).click();
  await expect(page.getByRole('heading', { level: 1, name: t('account.heading') })).toBeVisible();
}
