import { sql } from './groups';

// Kontakti za E2E (004): kontakte ustvarja uporabnik prek vmesnika; večje količine pripravi SQL neposredno v bazi
// Compose (D-27, research R-13). Produkcijskih endpointov za teste ni.

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Skupini doda `count` kontaktov »Ime001 Priimek001« … (SC-002, paginacija). */
export function createContactsBulk(groupId: string, count: number): void {
  sql(
    `insert into contact (group_id, first_name, last_name, sort_last, sort_first)
     select ${literal(groupId)}::uuid, 'Ime' || lpad(n::text, 3, '0'), 'Priimek' || lpad(n::text, 3, '0'),
            lower('Priimek' || lpad(n::text, 3, '0')), lower('Ime' || lpad(n::text, 3, '0'))
     from generate_series(1, ${count}) n`,
  );
}

/** Število kontaktov v skupini (preverjanje brez vmesnika). */
export function contactCount(groupId: string): number {
  return Number(sql(`select count(*) from contact where group_id = ${literal(groupId)}::uuid`));
}

/** Ustvari kontakt v bazi (z značkami) in vrne njegov id. */
export function createContact(
  groupId: string,
  contact: { first: string; last: string; tags?: string[] },
): string {
  const id = sql(
    `insert into contact (group_id, first_name, last_name, sort_last, sort_first)
     values (${literal(groupId)}::uuid, ${literal(contact.first)}, ${literal(contact.last)},
             lower(${literal(contact.last)}), lower(${literal(contact.first)})) returning id`,
  )
    .split('\n')[0]
    ?.trim();
  if (!id) throw new Error('kontakt ni bil ustvarjen');
  (contact.tags ?? []).forEach((tag, position) => {
    sql(
      `insert into contact_tag (contact_id, position, tag, tag_norm)
       values (${literal(id)}::uuid, ${position}, ${literal(tag)}, lower(${literal(tag)}))`,
    );
  });
  return id;
}

/** Ali kontakt še obstaja. */
export function contactExists(contactId: string): boolean {
  return sql(`select count(*) from contact where id = ${literal(contactId)}::uuid`) === '1';
}

/** Izbriše kontakt, kot da bi ga medtem izbrisal drug član (FR-004-13). */
export function deleteContactInDb(contactId: string): void {
  sql(`delete from contact where id = ${literal(contactId)}::uuid`);
}

/** Čas zadnje spremembe kontakta (ISO, UTC) – za pričakovano besedilo opozorila o konfliktu. */
export function contactUpdatedAt(contactId: string): string {
  return sql(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     from contact where id = ${literal(contactId)}::uuid`,
  );
}

/** Trenutna verzija kontakta. */
export function contactVersion(contactId: string): number {
  return Number(sql(`select version from contact where id = ${literal(contactId)}::uuid`));
}

/** Spremeni telefon kontakta, kot da bi ga shranil drug urednik (verzija +1). */
export function setContactField(contactId: string, field: 'phone', value: string): void {
  sql(
    `update contact set ${field} = ${literal(value)}, version = version + 1, updated_at = now()
     where id = ${literal(contactId)}::uuid`,
  );
}
