import type { Page } from '@playwright/test';

import { sql } from './groups';

// Revizijska sled za E2E (005): branje stanja neposredno v bazi Compose. Kontakte za sled testi ustvarjajo prek
// vmesnika ali API (`createContactViaApi`), ne s SQL – SQL ne ustvari vnosov (plan.md 005, tasks T004).

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Število vnosov sledi skupine. */
export function auditCount(groupId: string): number {
  return Number(sql(`select count(*) from audit_entry where group_id = ${literal(groupId)}::uuid`));
}

/** Najnovejši vnos celotne sledi skupine (`null` v prazni sledi). */
export function latestEntryId(groupId: string): string | null {
  const id = sql(
    `select last_entry_id from audit_head where group_id = ${literal(groupId)}::uuid`,
  ).trim();
  return id === '' ? null : id;
}

/** `n`-ti (od 1) vnos z dano vrsto dejanja po vrstnem redu sledi (od najstarejšega). */
export function entryIdByAction(groupId: string, action: string, n = 1): string {
  const id = sql(
    `select id from audit_entry where group_id = ${literal(groupId)}::uuid and action = ${literal(action)}
     order by seq offset ${n - 1} limit 1`,
  ).trim();
  if (id === '') throw new Error(`vnos ${action} št. ${n} ne obstaja`);
  return id;
}

/** Vrstica kontakta: vrednosti, verzija, izvajalec in oznaka *Povrnjeno*. */
export function contactRow(contactId: string): {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  version: number;
  updatedBy: string | null;
  revertedEntryId: string | null;
} | null {
  const row = sql(
    `select coalesce(first_name, ''), coalesce(last_name, ''), coalesce(phone, ''), version,
            coalesce(updated_by::text, ''), coalesce(reverted_entry_id::text, '')
     from contact where id = ${literal(contactId)}::uuid`,
  ).trim();
  if (row === '') return null;
  const [first = '', last = '', phone = '', version = '0', updatedBy = '', reverted = ''] =
    row.split('|');
  return {
    firstName: first || null,
    lastName: last || null,
    phone: phone || null,
    version: Number(version),
    updatedBy: updatedBy || null,
    revertedEntryId: reverted || null,
  };
}

/** ID žeton prijavljenega uporabnika iz shrambe Firebase SDK (IndexedDB `firebaseLocalStorageDb`). */
async function idToken(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => reject(new Error('IndexedDB ni dostopen'));
        open.onsuccess = () => {
          const all = open.result
            .transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage')
            .getAll();
          all.onerror = () => reject(new Error('shramba Firebase je prazna'));
          all.onsuccess = () => {
            const entry = (
              all.result as { value?: { stsTokenManager?: { accessToken?: string } } }[]
            )
              .map((row) => row.value?.stsTokenManager?.accessToken)
              .find((token) => typeof token === 'string');
            if (entry) resolve(entry);
            else reject(new Error('uporabnik ni prijavljen'));
          };
        };
      }),
  );
}

/** Ustvari kontakt prek `POST /api/groups/{id}/contacts` z žetonom prijavljenega uporabnika; vrne njegov id. */
export async function createContactViaApi(
  page: Page,
  groupId: string,
  input: { firstName: string; lastName: string; phone?: string },
): Promise<string> {
  const token = await idToken(page);
  const response = await page.request.post(`/api/groups/${groupId}/contacts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      address: null,
      email: null,
      phone: input.phone ?? null,
      attributes: [],
      tags: [],
    },
  });
  if (response.status() !== 201) throw new Error(`ustvarjanje kontakta: ${response.status()}`);
  return ((await response.json()) as { id: string }).id;
}
