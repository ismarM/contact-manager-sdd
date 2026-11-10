import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMemberCount } from '../members/api';
import { LeaveGroupDialog } from '../members/LeaveGroupDialog';
import { TransferOwnershipDialog } from '../members/TransferOwnershipDialog';
import { ArchiveGroupDialog } from './ArchiveGroupDialog';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { useGroup } from './groupContext';
import { UnarchiveButton } from './UnarchiveButton';

/**
 * *Nastavitve → Upravljanje skupine* (design.md 9.7 točka 4; FR-003-01, -04, -06, -09, -10): lastnik vidi arhiviranje
 * ali odarhiviranje, izbris pa samo, kadar je mogoč (`canDelete`), sicer razlago. Pri trajno arhivirani skupini (brez
 * lastnika) razdelek vidijo vsi člani. Od 007 vsak član (razen lastnika) vidi *Zapusti skupino*, lastnik pa *Prenesi
 * lastništvo* ali razlago; zadnji član trajno arhivirane skupine dobi razlago namesto gumba. Akcija, ki ni mogoča, ni
 * izrisana; dokler število članov ni znano, razdelek ne-lastnika ni izrisan (ne utripa).
 */
export function GroupManagementSection() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  const count = useMemberCount(group.id);
  // Dialog prenosa ostane izrisan, dokler je odprt, tudi če se vloga klicatelja medtem spremeni (403 pri prenosu).
  const [transferOpen, setTransferOpen] = useState(false);
  const isOwner = group.role === 'OWNER';
  if (!isOwner && count === undefined) return null;
  const canArchiveToggle = isOwner && !group.permanentlyArchived;
  const lastMember = group.permanentlyArchived && count === 1;
  const canLeave = !isOwner && !lastMember;
  const canTransfer = isOwner && !group.archived && (count === undefined || count > 1);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-t border-border pt-6"
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('groups.manage.heading')}
      </h2>
      {canArchiveToggle && !group.archived && (
        <div className="flex flex-col items-start gap-2">
          <ArchiveGroupDialog onDone={() => heading.current?.focus()} />
          <p className="text-muted-foreground">{t('groups.manage.archiveInfo')}</p>
        </div>
      )}
      {canArchiveToggle && group.archived && (
        <div className="flex flex-col items-start gap-2">
          <UnarchiveButton />
          <p className="text-muted-foreground">{t('groups.manage.unarchiveInfo')}</p>
        </div>
      )}
      {(canTransfer || transferOpen) && (
        <div className="flex flex-col items-start gap-2">
          <TransferOwnershipDialog onOpenChange={setTransferOpen} />
        </div>
      )}
      {isOwner && !group.archived && count !== undefined && count <= 1 && (
        <p className="text-muted-foreground">{t('members.transfer.info')}</p>
      )}
      {canLeave && <LeaveGroupDialog />}
      {isOwner && <p className="text-muted-foreground">{t('members.leave.ownerInfo')}</p>}
      {!isOwner && lastMember && (
        <p className="text-muted-foreground">{t('members.leave.lastMemberInfo')}</p>
      )}
      {group.canDelete ? (
        <div className="flex flex-col items-start gap-2">
          <DeleteGroupDialog />
          <p className="text-muted-foreground">{t('groups.manage.deleteInfo')}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">{t('groups.manage.deleteUnavailable')}</p>
      )}
    </section>
  );
}
