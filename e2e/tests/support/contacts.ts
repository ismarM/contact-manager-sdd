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

// --- 008: iskanje, filtri, razvrščanje ------------------------------------------------------------------------------

const nullable = (value: string | null | undefined) => (value == null ? 'NULL' : literal(value));

export interface SearchContact {
  first: string | null;
  last: string | null;
  email?: string;
  phone?: string;
  address?: string;
  attributes?: [key: string, value: string][];
  tags?: string[];
}

/** Ustvari kontakt s polji, dodatnimi atributi in značkami neposredno v bazi in vrne njegov id. */
export function createSearchContact(groupId: string, contact: SearchContact): string {
  const id = sql(
    `insert into contact (group_id, first_name, last_name, email, phone, address, sort_first, sort_last)
     values (${literal(groupId)}::uuid, ${nullable(contact.first)}, ${nullable(contact.last)},
             ${nullable(contact.email)}, ${nullable(contact.phone)}, ${nullable(contact.address)},
             lower(${nullable(contact.first)}), lower(${nullable(contact.last)})) returning id`,
  )
    .split('\n')[0]
    ?.trim();
  if (!id) throw new Error('kontakt ni bil ustvarjen');
  (contact.attributes ?? []).forEach(([key, value], position) => {
    sql(
      `insert into contact_attribute (contact_id, position, key, key_norm, value)
       values (${literal(id)}::uuid, ${position}, ${literal(key)}, lower(${literal(key)}), ${literal(value)})`,
    );
  });
  (contact.tags ?? []).forEach((tag, position) => {
    sql(
      `insert into contact_tag (contact_id, position, tag, tag_norm)
       values (${literal(id)}::uuid, ${position}, ${literal(tag)}, lower(${literal(tag)}))`,
    );
  });
  return id;
}

/**
 * Skupina za scenarije iskanja (quickstart.md): Janez Novak (feri.si, kompetenca »web dev«, znački konferenca2025 in
 * vip), Mojca Kralj (vip), Bojan Čeh (kompetenca backend), Cene Zupančič (podjetje Beta), Eva Žagar (feri.si, podjetje
 * Alfa), Maja Šuligoj in Ana brez priimka. Privzeti vrstni red: Čeh, Kralj, Novak, Šuligoj, Zupančič, Žagar, Ana.
 */
export function createSearchSet(groupId: string): void {
  createSearchContact(groupId, {
    first: 'Janez',
    last: 'Novak',
    email: 'janez@feri.si',
    phone: '041 123 456',
    attributes: [['kompetenca', 'web dev']],
    tags: ['konferenca2025', 'vip'],
  });
  createSearchContact(groupId, {
    first: 'Mojca',
    last: 'Kralj',
    email: 'mojca@primer.si',
    tags: ['vip'],
  });
  createSearchContact(groupId, {
    first: 'Bojan',
    last: 'Čeh',
    email: 'bojan@primer.si',
    attributes: [['kompetenca', 'backend']],
  });
  createSearchContact(groupId, {
    first: 'Cene',
    last: 'Zupančič',
    email: 'cene@primer.si',
    phone: '031 555 666',
    attributes: [['podjetje', 'Beta']],
  });
  createSearchContact(groupId, {
    first: 'Eva',
    last: 'Žagar',
    email: 'eva@feri.si',
    attributes: [['podjetje', 'Alfa']],
  });
  createSearchContact(groupId, { first: 'Maja', last: 'Šuligoj', email: 'maja@primer.si' });
  createSearchContact(groupId, { first: 'Ana', last: null });
}

/** `count` kontaktov z e-naslovom »osebaNNN@primer.si« in telefonom »041 NNN« (SC-002, SC-005). */
export function createContactsWithEmails(groupId: string, count: number): void {
  sql(
    `insert into contact (group_id, first_name, last_name, email, phone, sort_last, sort_first)
     select ${literal(groupId)}::uuid, 'Ime' || lpad(n::text, 3, '0'), 'Priimek' || lpad(n::text, 3, '0'),
            'oseba' || lpad(n::text, 3, '0') || '@primer.si', '041 ' || lpad(n::text, 3, '0'),
            lower('Priimek' || lpad(n::text, 3, '0')), lower('Ime' || lpad(n::text, 3, '0'))
     from generate_series(1, ${count}) n`,
  );
}

/** Skupina z `count` različnimi značkami »znacka0001« … (največ 30 na kontakt, zato več kontaktov). */
export function createManyDistinctTags(groupId: string, count: number): void {
  sql(
    `insert into contact (group_id, first_name, last_name, sort_last, sort_first)
     select ${literal(groupId)}::uuid, 'Ime', 'Priimek' || lpad(n::text, 4, '0'),
            lower('Priimek' || lpad(n::text, 4, '0')), 'ime'
     from generate_series(0, ${Math.ceil(count / 30) - 1}) n`,
  );
  sql(
    `insert into contact_tag (contact_id, position, tag, tag_norm)
     select c.id, (t.n % 30)::int, 'znacka' || lpad(t.n::text, 4, '0'), 'znacka' || lpad(t.n::text, 4, '0')
     from generate_series(1, ${count}) t(n)
     join (select id, row_number() over (order by sort_last) - 1 as r from contact
           where group_id = ${literal(groupId)}::uuid) c on c.r = (t.n - 1) / 30`,
  );
}

// --- 009: množični izbor in urejanje ---------------------------------------------------------------------------------

/**
 * Skupini doda `count` kontaktov »Ime001 Priimek001« … z značko `tag` (paketno, SQL) in vrne njihove id po vrstnem
 * redu številk. Za skupino jo kličeš samo enkrat (imena bi se ponovila).
 */
export function createTaggedContacts(groupId: string, count: number, tag: string): string[] {
  const ids = sql(
    `with c as (
       insert into contact (group_id, first_name, last_name, sort_last, sort_first)
       select ${literal(groupId)}::uuid, 'Ime' || lpad(n::text, 3, '0'), 'Priimek' || lpad(n::text, 3, '0'),
              lower('Priimek' || lpad(n::text, 3, '0')), lower('Ime' || lpad(n::text, 3, '0'))
       from generate_series(1, ${count}) n
       returning id, sort_last),
     t as (
       insert into contact_tag (contact_id, position, tag, tag_norm)
       select id, 0, ${literal(tag)}, lower(${literal(tag)}) from c)
     select id from c order by sort_last`,
  );
  return ids
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f-]{36}$/.test(line));
}

/** Kontakt z imenom in značkami (npr. »Mojca Kralj« s 30 značkami) – vrne id. */
export function createContactWithTags(groupId: string, name: string, tags: string[]): string {
  const [first = '', ...rest] = name.split(' ');
  return createContact(groupId, { first, last: rest.join(' '), tags });
}

/** Značke kontakta po vrstnem redu. */
export function tagsOf(contactId: string): string[] {
  const out = sql(
    `select tag from contact_tag where contact_id = ${literal(contactId)}::uuid order by position`,
  );
  return out === '' ? [] : out.split('\n').map((line) => line.trim());
}

/** Dodatni atributi kontakta (ključ, vrednost) po vrstnem redu. */
export function attributesOf(contactId: string): [key: string, value: string][] {
  const out = sql(
    `select key || '|' || value from contact_attribute where contact_id = ${literal(contactId)}::uuid order by position`,
  );
  return out === ''
    ? []
    : out.split('\n').map((line) => {
        const [key = '', ...value] = line.trim().split('|');
        return [key, value.join('|')];
      });
}

/** Doda značko kontaktu, kot da bi jo dodal drug urednik (verzija +1). */
export function addTagInDb(contactId: string, tag: string): void {
  sql(
    `insert into contact_tag (contact_id, position, tag, tag_norm)
     select ${literal(contactId)}::uuid, coalesce(max(position) + 1, 0), ${literal(tag)}, lower(${literal(tag)})
     from contact_tag where contact_id = ${literal(contactId)}::uuid`,
  );
  sql(
    `update contact set version = version + 1, updated_at = now() where id = ${literal(contactId)}::uuid`,
  );
}

/** Odstrani značko kontaktu, kot da bi jo odstranil drug urednik (verzija +1). */
export function removeTagInDb(contactId: string, tag: string): void {
  sql(
    `delete from contact_tag where contact_id = ${literal(contactId)}::uuid and tag_norm = lower(${literal(tag)})`,
  );
  sql(
    `update contact set version = version + 1, updated_at = now() where id = ${literal(contactId)}::uuid`,
  );
}
