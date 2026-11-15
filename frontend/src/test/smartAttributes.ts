import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';

import { i18n } from '../i18n';
import { countryName } from '../features/contacts/countries';
import type { Suggestion } from '../features/contacts/types';

// Skupni pomočniki za teste 013 (pametni atributi): dostopna imena iz prevodov, izbira države in zaznamki zahtevkov
// predlogov (constitution §3.3: imena se ne podvajajo kot nizi po datotekah).

/** Prevod v trenutnem jeziku vmesnika (dostopno ime elementa). */
export const tr = (key: string, options?: Record<string, unknown>): string =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(key, options);

export const name = {
  company: () => tr('contacts.form.company'),
  country: () => tr('contacts.form.country'),
  key: () => tr('contacts.form.key'),
  value: () => tr('contacts.form.value'),
  addTag: () => tr('contacts.form.addTag'),
  addAttribute: () => tr('contacts.form.addAttribute'),
  save: () => tr('contacts.form.save'),
  summary: (total: number) => tr('suggest.count', { total }),
  none: () => tr('suggest.none'),
};

/** Ime države v slovenščini ali angleščini (kot ga pokaže vmesnik). */
export const country = (code: string, language: 'sl' | 'en' = 'sl') => countryName(code, language);

/** `count` predlogov z imeni `prefix1`, `prefix2` … (padajoče število). */
export function manySuggestions(prefix: string, count: number): Suggestion[] {
  return Array.from({ length: count }, (_, i) => ({ text: `${prefix}${i + 1}`, count: count - i }));
}

/** Besedila možnosti odprtega seznama (brez števila uporab: samo prvi element možnosti). */
export function optionTexts(listbox: HTMLElement): string[] {
  return within(listbox)
    .getAllByRole('option')
    .map((option) => option.firstElementChild?.textContent ?? '');
}

/** Izbere državo v polju: vpiše iskalni niz, počaka na možnost in jo izbere z miško. */
export async function chooseCountry(
  user: UserEvent,
  field: HTMLElement,
  query: string,
  optionName: string,
) {
  await user.click(field);
  if (query) await user.type(field, query);
  await user.click(await screen.findByRole('option', { name: optionName }));
  await waitFor(() => expect(field).toHaveValue(optionName));
}
