import type { Download, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { sql } from './groups';

// Pomožni pomočniki za E2E funkcionalnosti 012 (Moji podatki): SQL za stanja, ki jih vmesnik ne ustvari (povabila,
// prenos lastništva), branje stanja po izbrisu in `page.route` za napake, ki jih ni treba sprožiti z ustavitvijo
// skupnih storitev (brez `docker compose stop|pause`, research R-13).

export { archive as archiveGroup, makePermanentlyArchived } from './groups';

/** Niz kot literal SQL (podvojeni enojni narekovaji). */
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

type InvitedRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

function addInvitation(
  groupId: string,
  inviterEmail: string,
  inviteeEmail: string,
  role: InvitedRole,
): void {
  sql(
    `insert into invitation (group_id, invitee_id, inviter_id, role)
     select ${literal(groupId)}::uuid,
            (select id from app_user where lower(email) = lower(${literal(inviteeEmail)})),
            (select id from app_user where lower(email) = lower(${literal(inviterEmail)})),
            ${literal(role)}`,
  );
}

/** Povabilo, ki ga je `inviterEmail` poslal v skupino (čaka na `inviteeEmail`); oba se morata že biti prijavila. */
export function addSentInvitation(
  groupId: string,
  inviterEmail: string,
  inviteeEmail: string,
  role: InvitedRole = 'VIEWER',
): void {
  addInvitation(groupId, inviterEmail, inviteeEmail, role);
}

/** Povabilo, ki ga je `inviteeEmail` prejel od `inviterEmail` (ista vrstica, pogled prejemnika). */
export function addReceivedInvitation(
  groupId: string,
  inviteeEmail: string,
  inviterEmail: string,
  role: InvitedRole = 'EDITOR',
): void {
  addInvitation(groupId, inviterEmail, inviteeEmail, role);
}

/** Lastništvo skupine preide z `fromEmail` (postane ADMIN) na `toEmail` (mora biti član), kot po prenosu iz 007. */
export function transferOwnership(groupId: string, fromEmail: string, toEmail: string): void {
  sql(
    `update group_member set role = 'ADMIN'
     where group_id = ${literal(groupId)}::uuid
       and user_id = (select id from app_user where lower(email) = lower(${literal(fromEmail)}))`,
  );
  sql(
    `update group_member set role = 'OWNER'
     where group_id = ${literal(groupId)}::uuid
       and user_id = (select id from app_user where lower(email) = lower(${literal(toEmail)}))`,
  );
}

/** Ali uporabnik (po e-naslovu) obstaja v aplikaciji. */
export function userExists(email: string): boolean {
  return sql(`select count(*) from app_user where lower(email) = lower(${literal(email)})`) === '1';
}

/** Število članstev uporabnika (po e-naslovu) v skupinah. */
export function membershipCount(email: string): number {
  return Number(
    sql(
      `select count(*) from group_member
       where user_id = (select id from app_user where lower(email) = lower(${literal(email)}))`,
    ),
  );
}

/** Firebase UID-ji v nadgrobnikih izbrisanih identitet (`deleted_identity`, D-72); samo za diagnostiko. */
export function tombstones(): string[] {
  return sql('select firebase_uid from deleted_identity')
    .split('\n')
    .filter((uid) => uid !== '');
}

// Pot izvoza (GET /api/me/export) odgovori z omrežno napako; vrne funkcijo, ki pot odstrani.
export async function failExport(page: Page): Promise<() => Promise<void>> {
  const pattern = '**/api/me/export';
  await page.route(pattern, (route) => route.abort());
  return () => page.unroute(pattern);
}

/**
 * `POST /api/me/deletion` vrne `202 {"code":"IDENTITY_DELETION_PENDING"}`; zaledje se ne pokliče (stanje čakanja v
 * vmesniku, FR-012-17). `calls()` je število prestreženih zahtevkov.
 */
export async function fakeDeletion202(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.route('**/api/me/deletion', (route) => {
    calls += 1;
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'IDENTITY_DELETION_PENDING' }),
    });
  });
  return { calls: () => calls };
}

/** Prebere preneseno datoteko nazaj (besedilo). */
export async function readDownload(download: Download): Promise<string> {
  const path = await download.path();
  return readFile(path, 'utf8');
}

/** Datum `YYYY-MM-DD` po lokalnem času (ura procesa Playwright = ura brskalnika). */
export function localDate(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
