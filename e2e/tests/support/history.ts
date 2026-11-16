import type { Page } from '@playwright/test';

import { idToken } from './audit';
import { sql } from './groups';

// Pomočniki E2E za 015 (napredna revizijska sled): spremembe kontaktov prek API-ja z žetonom prijavljenega uporabnika,
// da nastanejo pravi vnosi sledi (SQL jih ne ustvari), in branje stanja v bazi Compose.

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

interface ContactJson {
  id: string;
  version: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  attributes: { key: string; value: string }[];
  tags: string[];
}

async function headers(page: Page) {
  return { Authorization: `Bearer ${await idToken(page)}` };
}

/** Trenutno stanje kontakta prek API-ja. */
export async function getContact(
  page: Page,
  groupId: string,
  contactId: string,
): Promise<ContactJson> {
  const response = await page.request.get(`/api/groups/${groupId}/contacts/${contactId}`, {
    headers: await headers(page),
  });
  if (response.status() !== 200) throw new Error(`branje kontakta: ${response.status()}`);
  return (await response.json()) as ContactJson;
}

/** Spremeni telefon, atribut in značke kontakta (uredi z veljavno verzijo); vrne novo stanje. */
export async function editContactViaApi(
  page: Page,
  groupId: string,
  contactId: string,
  changes: Partial<Pick<ContactJson, 'phone' | 'attributes' | 'tags'>>,
): Promise<ContactJson> {
  const current = await getContact(page, groupId, contactId);
  const response = await page.request.put(`/api/groups/${groupId}/contacts/${contactId}`, {
    headers: await headers(page),
    data: {
      firstName: current.firstName,
      lastName: current.lastName,
      address: current.address,
      email: current.email,
      phone: current.phone,
      attributes: current.attributes,
      tags: current.tags,
      ...changes,
      version: current.version,
    },
  });
  if (response.status() !== 200) throw new Error(`urejanje kontakta: ${response.status()}`);
  return (await response.json()) as ContactJson;
}

/** Izbriše kontakt prek API-ja (nastane vnos `DELETE`). */
export async function deleteContactViaApi(
  page: Page,
  groupId: string,
  contactId: string,
): Promise<void> {
  const current = await getContact(page, groupId, contactId);
  const response = await page.request.delete(
    `/api/groups/${groupId}/contacts/${contactId}?version=${current.version}`,
    { headers: await headers(page) },
  );
  if (response.status() !== 204) throw new Error(`izbris kontakta: ${response.status()}`);
}

/** Število vnosov sledi dane vrste v skupini. */
export function auditCountByAction(groupId: string, action: string): number {
  return Number(
    sql(
      `select count(*) from audit_entry where group_id = ${literal(groupId)}::uuid and action = ${literal(action)}`,
    ),
  );
}

/** Telefon, verzija in izvajalec zadnje spremembe kontakta (`null`, če kontakta ni). */
export function contactPhone(contactId: string): string | null {
  const row = sql(
    `select coalesce(phone, '') from contact where id = ${literal(contactId)}::uuid`,
  ).trim();
  return row === '' ? null : row;
}

/** Ali kontakt obstaja v bazi. */
export function contactExists(contactId: string): boolean {
  return sql(`select count(*) from contact where id = ${literal(contactId)}::uuid`).trim() === '1';
}

/** Izbriše račun uporabnika (vnosi ostanejo, izvajalec postane »izbrisan uporabnik«) in odstrani članstvo. */
export function removeMember(groupId: string, email: string): void {
  sql(
    `delete from group_member where group_id = ${literal(groupId)}::uuid
     and user_id = (select id from app_user where lower(email) = lower(${literal(email)}))`,
  );
}
