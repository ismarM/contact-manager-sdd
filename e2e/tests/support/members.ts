import { type Role, sql } from './groups';

// Člani za E2E (007, D-27): vloge, ki nastanejo šele s povabili, pripravi SQL neposredno v bazi Compose.

/** Niz kot literal SQL (podvojeni enojni narekovaji). */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Doda uporabnika (po e-naslovu; se je že prijavil) v skupino z vlogo; obstoječemu članu spremeni vlogo. */
export function addMember(groupId: string, email: string, role: Role): void {
  sql(
    `insert into group_member (group_id, user_id, role)
     select ${literal(groupId)}::uuid, id, ${literal(role)} from app_user where lower(email) = lower(${literal(email)})
     on conflict (group_id, user_id) do update set role = excluded.role`,
  );
}

/** Vloga uporabnika v skupini (`null` = ni član). */
export function roleOf(groupId: string, email: string): string | null {
  const role = sql(
    `select m.role from group_member m join app_user u on u.id = m.user_id
     where m.group_id = ${literal(groupId)}::uuid and lower(u.email) = lower(${literal(email)})`,
  );
  return role === '' ? null : role;
}

/** Ali je uporabnik (po e-naslovu) član skupine. */
export function memberExists(groupId: string, email: string): boolean {
  return roleOf(groupId, email) !== null;
}
