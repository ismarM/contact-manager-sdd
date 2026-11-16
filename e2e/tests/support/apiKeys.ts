import { type APIRequestContext, type APIResponse, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Pomočniki za E2E funkcionalnosti 019 (API ključi): ustvarjanje in preklic ključa v razdelku »API ključi« na strani
// Moj račun ter klici programskega vmesnika /v1 z `request`. Dostopna imena se berejo iz prevodov (konstitucija §3.3).

type Messages = Record<string, unknown>;

const messages = (language: 'sl' | 'en'): Messages =>
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, `../../../frontend/src/i18n/${language}.json`),
      'utf8',
    ),
  ) as Messages;

const SL = messages('sl');

/** Besedilo prevoda (sl) po ključu s pikami, z vstavljenimi `{{spremenljivkami}}`. */
export function t(key: string, values: Record<string, string> = {}, source: Messages = SL): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Messages | undefined)?.[part], source);
  if (typeof text !== 'string') throw new Error(`ni prevoda ${key}`);
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? '');
}

/** Dostopna imena razdelka »API ključi« (sl). */
export const apiKeyNames = {
  section: () => t('apiKeys.heading'),
  create: () => t('apiKeys.create'),
  dialog: () => t('apiKeys.form.title'),
  name: () => t('apiKeys.form.nameLabel'),
  scopeSelected: () => t('apiKeys.form.scopeSelected'),
  scopeAll: () => t('apiKeys.form.scopeAll'),
  permissionFor: (title: string) => t('apiKeys.form.permissionFor', { title }),
  permission: (permission: 'READ' | 'WRITE') => t(`apiKeys.permission.${permission}`),
  expiry: () => t('apiKeys.form.expiryLabel'),
  submit: () => t('apiKeys.form.submit'),
  created: (name: string) => t('apiKeys.createdDialog.title', { name }),
  key: () => t('apiKeys.createdDialog.keyLabel'),
  copy: () => t('apiKeys.createdDialog.copy'),
  close: () => t('apiKeys.createdDialog.close'),
  revoke: (name: string) => t('apiKeys.revoke.button', { name }),
  revokeDialog: (name: string) => t('apiKeys.revoke.title', { name }),
  revokeConfirm: () => t('apiKeys.revoke.confirm'),
  docsLink: () => t('apiKeys.docsLink'),
};

export interface NewApiKey {
  name: string;
  /** Naslovi izbranih skupin; brez njih ključ velja za vse moje skupine. */
  groups?: string[];
  permission?: 'READ' | 'WRITE';
  /** Pred zaprtjem klikni *Kopiraj ključ* in preveri odložišče (kontekst mora imeti dovoljenje za odložišče). */
  copy?: boolean;
}

/**
 * Ustvari ključ v razdelku »API ključi« (stran mora biti `/account`), prebere ga iz enkratnega prikaza in zapre okno.
 * Vrne celoten ključ `cmk_…`.
 */
export async function createApiKey(page: Page, key: NewApiKey): Promise<string> {
  const permission = key.permission ?? 'READ';
  await page.getByRole('button', { name: apiKeyNames.create() }).click();
  const dialog = page.getByRole('dialog', { name: apiKeyNames.dialog() });
  await dialog.getByLabel(apiKeyNames.name()).fill(key.name);
  if (key.groups && key.groups.length > 0) {
    await dialog.getByRole('radio', { name: apiKeyNames.scopeSelected() }).check();
    for (const title of key.groups) {
      await dialog.getByRole('checkbox', { name: title }).check();
      await dialog
        .getByRole('combobox', { name: apiKeyNames.permissionFor(title) })
        .selectOption({ label: apiKeyNames.permission(permission) });
    }
  } else {
    await dialog.getByRole('radio', { name: apiKeyNames.scopeAll() }).check();
    await dialog
      .getByRole('combobox', { name: t('apiKeys.form.permissionLabel') })
      .selectOption({ label: apiKeyNames.permission(permission) });
  }
  await dialog.getByRole('button', { name: apiKeyNames.submit() }).click();

  const created = page.getByRole('dialog', { name: apiKeyNames.created(key.name) });
  const value = await created.getByLabel(apiKeyNames.key()).inputValue();
  expect(value).toMatch(/^cmk_[\w-]+\.[\w-]+\.[\w-]+$/);
  if (key.copy) {
    await created.getByRole('button', { name: apiKeyNames.copy() }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  }
  await created.getByRole('button', { name: apiKeyNames.close() }).click();
  await expect(created).toBeHidden();
  return value;
}

/** Prekliče ključ s potrditvijo v dialogu (8.11). */
export async function revokeApiKey(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: apiKeyNames.revoke(name) }).click();
  const dialog = page.getByRole('alertdialog', { name: apiKeyNames.revokeDialog(name) });
  await dialog.getByRole('button', { name: apiKeyNames.revokeConfirm() }).click();
  await expect(dialog).toBeHidden();
}

/** Klic programskega vmesnika `/v1…` s ključem v glavi `Authorization: Bearer`. */
export function callV1(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  pathAndQuery: string,
  apiKey: string | null,
  body?: unknown,
): Promise<APIResponse> {
  return request.fetch(`/v1${pathAndQuery}`, {
    method,
    headers: apiKey === null ? {} : { Authorization: `Bearer ${apiKey}` },
    ...(body === undefined ? {} : { data: body }),
  });
}
