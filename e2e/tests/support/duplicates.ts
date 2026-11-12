import { sql } from './groups';

// Kontakti za E2E 011 (dvojniki): pripravi jih SQL neposredno v bazi Compose (D-27); kontaktov, ki jih test briše,
// ne ustvarjaj tukaj (brisanje prek vmesnika/API 004 zapiše sled). `created_at` je nadzorovan.

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const nullable = (value: string | null | undefined) => (value == null ? 'NULL' : literal(value));

export interface SeedContact {
  first: string | null;
  last: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  attributes?: { key: string; value: string }[];
  /** ISO čas ustvaritve; privzeto zdaj. */
  createdAt?: string;
}

/** Ustvari kontakt z dobesednimi vrednostmi (brez obrezovanja) in vrne njegov id. */
export function seedContact(groupId: string, contact: SeedContact): string {
  const created = contact.createdAt ? `${literal(contact.createdAt)}::timestamptz` : 'now()';
  const id = sql(
    `insert into contact (group_id, first_name, last_name, email, phone, sort_last, sort_first, created_at, updated_at)
     values (${literal(groupId)}::uuid, ${nullable(contact.first)}, ${nullable(contact.last)},
             ${nullable(contact.email)}, ${nullable(contact.phone)},
             lower(${nullable(contact.last)}), lower(${nullable(contact.first)}), ${created}, ${created})
     returning id`,
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
  (contact.attributes ?? []).forEach((attribute, position) => {
    sql(
      `insert into contact_attribute (contact_id, position, key, key_norm, value)
       values (${literal(id)}::uuid, ${position}, ${literal(attribute.key)}, lower(${literal(attribute.key)}),
               ${literal(attribute.value)})`,
    );
  });
  return id;
}

/**
 * `count` kontaktov z enakim e-naslovom, z naraščajočim `created_at` (po eno sekundo narazen od 2026-01-01);
 * vrne id-je po vrstnem redu ustvarjanja (prvi je najstarejši). Imena `Ime01 Priimek01` …
 */
export function seedDuplicates(
  groupId: string,
  count: number,
  email = 'skupina@primer.si',
): string[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const pad = n.toString().padStart(2, '0');
    return seedContact(groupId, {
      first: `Ime${pad}`,
      last: `Priimek${pad}`,
      email,
      createdAt: new Date(start + n * 1000).toISOString(),
    });
  });
}

/** Id kontakta skupine z danim e-naslovom (najstarejši, če jih je več; `null`, če ga ni). */
export function contactByEmail(groupId: string, email: string): string | null {
  const id = sql(
    `select id from contact where group_id = ${literal(groupId)}::uuid and email = ${literal(email)}
     order by created_at, id limit 1`,
  )
    .split('\n')[0]
    ?.trim();
  return id ? id : null;
}

/** Ali kontakt še obstaja. */
export function contactExists(contactId: string): boolean {
  return sql(`select count(*) from contact where id = ${literal(contactId)}::uuid`) === '1';
}

/** Značke kontakta po vrstnem redu vnosa. */
export function tagsOf(contactId: string): string[] {
  const out = sql(
    `select tag from contact_tag where contact_id = ${literal(contactId)}::uuid order by position`,
  );
  return out === '' ? [] : out.split('\n').map((line) => line.trim());
}

/** Dodatni atributi kontakta po vrstnem redu vnosa. */
export function attributesOf(contactId: string): { key: string; value: string }[] {
  const out = sql(
    `select key || E'\\t' || value from contact_attribute where contact_id = ${literal(contactId)}::uuid
     order by position`,
  );
  if (out === '') return [];
  return out.split('\n').map((line) => {
    const [key = '', value = ''] = line.split('\t');
    return { key, value };
  });
}

/** Število kontaktov v skupini. */
export function contactCountIn(groupId: string): number {
  return Number(sql(`select count(*) from contact where group_id = ${literal(groupId)}::uuid`));
}

/** Število kontaktov z danim e-naslovom v skupini. */
export function contactsWithEmail(groupId: string, email: string): number {
  return Number(
    sql(
      `select count(*) from contact where group_id = ${literal(groupId)}::uuid and email = ${literal(email)}`,
    ),
  );
}

/** Trenutna verzija kontakta. */
export function versionOf(contactId: string): number {
  return Number(sql(`select version from contact where id = ${literal(contactId)}::uuid`));
}

/** Spremeni telefon, kot da bi ga shranil drug urednik (verzija +1). */
export function editedByOther(contactId: string, phone: string): void {
  sql(
    `update contact set phone = ${literal(phone)}, version = version + 1, updated_at = now()
     where id = ${literal(contactId)}::uuid`,
  );
}
