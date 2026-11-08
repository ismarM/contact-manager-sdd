import { sql } from './groups';

// Pomožni SQL za E2E povabil (006): stanja, ki jih vmesnik ne ustvari (izbrisan povabitelj, 012), in preverjanje baze.
// Ponovno uporablja `sql`, `setRole`, `archive` in `makePermanentlyArchived` iz support/groups.ts.

/** Niz kot literal SQL (podvojeni enojni narekovaji). */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Število čakajočih povabil skupine. */
export function pendingInvitations(groupId: string): number {
  return Number(sql(`select count(*) from invitation where group_id = ${literal(groupId)}::uuid`));
}

/** Ali v skupini čaka povabilo za dani e-naslov. */
export function invitationExists(groupId: string, email: string): boolean {
  return (
    sql(
      `select count(*) from invitation i join app_user u on u.id = i.invitee_id
       where i.group_id = ${literal(groupId)}::uuid and lower(u.email) = lower(${literal(email)})`,
    ) === '1'
  );
}

/** Učinek izbrisa računa povabitelja (012): povabilo ostane, povabitelj postane neznan. */
export function anonymizeInviter(groupId: string, email: string): void {
  sql(
    `update invitation set inviter_id = null
     where group_id = ${literal(groupId)}::uuid
       and invitee_id = (select id from app_user where lower(email) = lower(${literal(email)}))`,
  );
}

/** Vloga uporabnika (po e-naslovu) v skupini ali `null`, če ni član. */
export function memberRole(groupId: string, email: string): string | null {
  const role = sql(
    `select m.role from group_member m join app_user u on u.id = m.user_id
     where m.group_id = ${literal(groupId)}::uuid and lower(u.email) = lower(${literal(email)})`,
  );
  return role === '' ? null : role;
}
