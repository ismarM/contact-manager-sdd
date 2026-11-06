import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Skupine za E2E (002, D-27, research R-13): skupino ustvari uporabnik prek vmesnika; vloge, ki nastanejo šele s
// povabili (006/007), in arhiviranje (003) pripravi SQL neposredno v bazi Compose. Produkcijskih endpointov za teste ni.
// verify.sh poda projekt in datoteke Compose v E2E_COMPOSE_ARGS; lokalno privzeto ../compose.yaml.

const composeArgs = (process.env.E2E_COMPOSE_ARGS ?? '-f ../compose.yaml')
  .split(/\s+/)
  .filter(Boolean);

/** Niz kot literal SQL (podvojeni enojni narekovaji). */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Izvede SQL v bazi Compose in vrne izpis brez glave (`psql -At`). */
export function sql(statement: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      ...composeArgs,
      'exec',
      '-T',
      'db',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'contacts',
      '-d',
      'contacts',
      '-At',
      '-c',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

export type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

/** Vloga uporabnika (po e-naslovu; uporabnik se je že prijavil) v skupini – vstavi ali posodobi članstvo. */
export function setRole(groupId: string, email: string, role: Role): void {
  sql(
    `insert into group_member (group_id, user_id, role)
     select ${literal(groupId)}::uuid, id, ${literal(role)} from app_user where lower(email) = lower(${literal(email)})
     on conflict (group_id, user_id) do update set role = excluded.role`,
  );
}

/** Arhivirana skupina (do 003 samo za teste). */
export function archive(groupId: string): void {
  sql(`update contact_group set archived_at = now() where id = ${literal(groupId)}::uuid`);
}

/** Uporabniku ustvari `count` skupin »Skupina 001« … z vlogo `role` (SC-002). */
export function createGroupsBulk(email: string, count: number, role: Role): void {
  sql(
    `with u as (select id from app_user where lower(email) = lower(${literal(email)})),
     g as (insert into contact_group (title, updated_by)
           select 'Skupina ' || lpad(n::text, 3, '0'), (select id from u) from generate_series(1, ${count}) n
           returning id)
     insert into group_member (group_id, user_id, role) select g.id, (select id from u), ${literal(role)} from g`,
  );
}

/**
 * Ustvari skupino prek dialoga *Nova skupina* na zaslonu *Skupine* (imena iz plan.md, slovenščina) in vrne id iz
 * naslova strani `/groups/<id>/settings`.
 */
export async function createGroup(
  page: Page,
  group: { title: string; description?: string; color?: string },
): Promise<string> {
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'Nova skupina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova skupina' });
  await dialog.getByRole('textbox', { name: 'Naslov' }).fill(group.title);
  if (group.description) {
    await dialog.getByRole('textbox', { name: 'Opis' }).fill(group.description);
  }
  if (group.color) {
    await dialog.getByRole('radio', { name: group.color }).check();
  }
  await dialog.getByRole('button', { name: 'Ustvari skupino' }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}\/settings$/);
  const match = /\/groups\/([0-9a-f-]{36})\/settings$/.exec(new URL(page.url()).pathname);
  if (!match?.[1]) throw new Error(`ni id skupine v ${page.url()}`);
  return match[1];
}
