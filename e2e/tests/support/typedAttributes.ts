import { createContactWithTags } from './contacts';
import { sql } from './groups';

// Tipizirani atributi za E2E (016): podatke druge skupine ali stare podatke pripravi SQL neposredno v bazi Compose,
// preverjanje stanja pa je branje brez vmesnika (konstitucija §3).

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export type AttributeType = 'OTHER' | 'NOTES' | 'EMAIL' | 'PHONE' | 'ADDRESS' | 'URL' | 'DATE';

/** Kontakt z atributom danega ključa in vrednostjo; vrstica ključa dobi tip (privzeto `OTHER`). */
export function createContactWithTypedAttribute(
  groupId: string,
  name: string,
  key: string,
  value: string,
  type: AttributeType = 'OTHER',
): string {
  const id = createContactWithTags(groupId, name, []);
  sql(
    `insert into contact_attribute (contact_id, position, key, key_norm, value)
     values (${literal(id)}::uuid, 0, ${literal(key)}, lower(${literal(key)}), ${literal(value)})`,
  );
  sql(
    `insert into attribute_key (group_id, key_norm, type)
     values (${literal(groupId)}::uuid, lower(${literal(key)}), ${literal(type)})
     on conflict (group_id, key_norm) do nothing`,
  );
  return id;
}

/** Tip ključa v skupini (prazen niz: ključ nima vrstice). */
export function keyTypeOf(groupId: string, key: string): string {
  return sql(
    `select coalesce(max(type), '') from attribute_key
     where group_id = ${literal(groupId)}::uuid and key_norm = lower(${literal(key)})`,
  );
}

/** Shranjene vrednosti ključa v skupini po abecedi vrednosti. */
export function valuesOfKey(groupId: string, key: string): string[] {
  const rows = sql(
    `select a.value from contact_attribute a join contact c on c.id = a.contact_id
     where c.group_id = ${literal(groupId)}::uuid and a.key_norm = lower(${literal(key)})
     order by a.value`,
  );
  return rows === '' ? [] : rows.split('\n');
}

/** Dejanja v sledi skupine po vrstnem redu vnosa. */
export function auditActions(groupId: string): string[] {
  const rows = sql(
    `select action from audit_entry where group_id = ${literal(groupId)}::uuid order by seq`,
  );
  return rows === '' ? [] : rows.split('\n');
}

/** Deli razčlenjenega naslova kontakta (`address_parts`) ali `null` (naslov je besedilo ali ga ni). */
export function addressPartsOf(contactId: string): Record<string, string> | null {
  const json = sql(
    `select coalesce(address_parts::text, '') from contact where id = ${literal(contactId)}::uuid`,
  );
  return json === '' ? null : (JSON.parse(json) as Record<string, string>);
}

/** Nerazčlenjen naslov kontakta (`address`) ali prazen niz. */
export function addressTextOf(contactId: string): string {
  return sql(`select coalesce(address, '') from contact where id = ${literal(contactId)}::uuid`);
}

/** Razčlenjen predefiniran naslov kontakta (`address_parts`; besedilo `address` se izprazni). */
export function setAddressParts(contactId: string, parts: Record<string, string>): void {
  sql(
    `update contact set address = null, address_parts = ${literal(JSON.stringify(parts))}::jsonb
     where id = ${literal(contactId)}::uuid`,
  );
}
