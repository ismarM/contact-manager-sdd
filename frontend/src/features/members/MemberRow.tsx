import { useTranslation } from 'react-i18next';

import { Avatar } from '../../shared/images/Avatar';
import { useGroup } from '../groups/groupContext';
import { MemberCell } from './MemberCell';
import { MemberActionsMenu, type MemberDialogKind } from './MemberActionsMenu';
import { roleChip } from './roleChip';
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
  const manageable = member.canManage && !group.archived;
  return (
    <tr className="border-t border-border max-sm:block max-sm:py-2">
      <MemberCell label={t('members.table.member')} className={cellClass}>
        <span className="inline-flex items-center gap-3">
          <Avatar
            kind="user"
            name={name}
            colorSeed={member.email}
            size={32}
            alt=""
            photo={{
              path: `/groups/${group.id}/members/${member.id}/photo`,
              revision: member.photoRevision,
            }}
          />
          <span className="font-medium">
            {member.self ? (
              <>
                {name}{' '}
                <span className="font-normal text-muted-foreground">{t('members.table.you')}</span>
              </>
            ) : (
              name
            )}
          </span>
        </span>
      </MemberCell>
      <MemberCell
        label={t('members.table.email')}
        className={`${cellClass} break-all text-muted-foreground`}
      >
        {member.email}
      </MemberCell>
      <MemberCell label={t('members.table.role')} className={cellClass}>
        <span className={roleChip}>{t(`roles.${member.role}`)}</span>
      </MemberCell>
      {/* Brez dejanj pod 640 px ni prazne vrstice »Dejanja«. */}
      <MemberCell
        label={t('members.table.actions')}
        className={manageable ? cellClass : `${cellClass} max-sm:hidden`}
      >
        {manageable && <MemberActionsMenu member={member} onAction={onAction} />}
      </MemberCell>
    </tr>
  );
}
