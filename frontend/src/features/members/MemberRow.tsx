import { useTranslation } from 'react-i18next';

import { useGroup } from '../groups/groupContext';
import { MemberCell } from './MemberCell';
import { MemberActionsMenu, type MemberDialogKind } from './MemberActionsMenu';
import type { Member } from './types';

/**
 * Vrstica člana (design.md 8.6): ime z oznako »(ti)« ob lastni vrstici, e-naslov, vloga v jeziku vmesnika in meni
 * dejanj samo, kadar strežnik dovoli upravljanje (`canManage`; v arhivirani skupini je vedno `false`).
 */
export function MemberRow({
  member,
  cellClass,
  onAction,
}: {
  member: Member;
  cellClass: string;
  onAction: (kind: MemberDialogKind, member: Member, trigger: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const name = member.name ?? member.email;
  return (
    <tr className="border-b border-border max-sm:block max-sm:py-2">
      <MemberCell label={t('members.table.member')} className={cellClass}>
        {member.self ? `${name} ${t('members.table.you')}` : name}
      </MemberCell>
      <MemberCell label={t('members.table.email')} className={`${cellClass} break-all`}>
        {member.email}
      </MemberCell>
      <MemberCell label={t('members.table.role')} className={cellClass}>
        {t(`roles.${member.role}`)}
      </MemberCell>
      <MemberCell label={t('members.table.actions')} className={cellClass}>
        {member.canManage && !group.archived && (
          <MemberActionsMenu member={member} onAction={onAction} />
        )}
      </MemberCell>
    </tr>
  );
}
