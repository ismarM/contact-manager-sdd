import { IconArchive, IconArrowsExchange, IconDoorExit, IconTrash } from '@tabler/icons-react';
import { type ReactNode, type RefObject, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMemberCount } from '../members/api';
import { LeaveGroupDialog } from '../members/LeaveGroupDialog';
import { TransferOwnershipDialog } from '../members/TransferOwnershipDialog';
import { card } from '../../shared/ui/styles';
import { ArchiveGroupDialog } from './ArchiveGroupDialog';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { useGroup } from './groupContext';
import { UnarchiveButton } from './UnarchiveButton';

/**
 * *Nastavitve → Upravljanje skupine* (design.md 9.7 točka 4; FR-003-01, -04, -06, -09, -10): lastnik vidi arhiviranje
 * ali odarhiviranje, izbris pa samo, kadar je mogoč (`canDelete`), sicer razlago. Pri trajno arhivirani skupini (brez
 * lastnika) razdelek vidijo vsi člani. Od 007 vsak član vidi *Zapusti skupino* (lastnik od 017 z dialogom s pojasnilom, FR-017-19, -20), lastnik pa tudi
 * *Prenesi lastništvo* ali razlago; zadnji član trajno arhivirane skupine dobi razlago namesto gumba. Akcija, ki ni mogoča, ni
 * izrisana; *Prenesi lastništvo* in razlagi o številu članov se izrišejo šele, ko je `total` znan.
 */
export function GroupManagementSection() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const transferBox = useRef<HTMLDivElement>(null);
  const deleteBox = useRef<HTMLDivElement>(null);

  const count = useMemberCount(group.id);
  // Dialog prenosa ostane izrisan, dokler je odprt, tudi če se vloga klicatelja medtem spremeni (403 pri prenosu).
  const [transferOpen, setTransferOpen] = useState(false);
  const isOwner = group.role === 'OWNER';
  const canArchiveToggle = isOwner && !group.permanentlyArchived;
  const lastMember = group.permanentlyArchived && count === 1;
  // Pri trajno arhivirani skupini je zadnji član znan šele po branju števila članov (R-08).
  const canLeave = !isOwner && !lastMember && !(group.permanentlyArchived && count === undefined);
  const canTransfer = isOwner && !group.archived && count !== undefined && count > 1;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
        {t('groups.manage.heading')}
      </h2>
      <ul className={`${card} flex flex-col divide-y divide-border`}>
        {canArchiveToggle && !group.archived && (
          <ManageRow
            icon={<IconArchive aria-hidden="true" size={20} stroke={1.75} />}
            title={t('groups.manage.archive')}
            text={t('groups.manage.archiveInfo')}
          >
            <ArchiveGroupDialog onDone={() => heading.current?.focus()} />
          </ManageRow>
        )}
        {canArchiveToggle && group.archived && (
          <ManageRow
            icon={<IconArchive aria-hidden="true" size={20} stroke={1.75} />}
            title={t('groups.manage.unarchive')}
            text={t('groups.manage.unarchiveInfo')}
          >
            <UnarchiveButton />
          </ManageRow>
        )}
        {(canTransfer || transferOpen) && (
          <ManageRow
            icon={<IconArrowsExchange aria-hidden="true" size={20} stroke={1.75} />}
            title={t('members.transfer.button')}
            text={t('members.transfer.description')}
            boxRef={transferBox}
          >
            <TransferOwnershipDialog onOpenChange={setTransferOpen} />
          </ManageRow>
        )}
        {isOwner && !group.archived && count !== undefined && count <= 1 && (
          <ManageRow
            icon={<IconArrowsExchange aria-hidden="true" size={20} stroke={1.75} />}
            title={t('members.transfer.button')}
            text={t('members.transfer.info')}
          />
        )}
        {(canLeave || isOwner) && (
          <ManageRow
            icon={<IconDoorExit aria-hidden="true" size={20} stroke={1.75} />}
            title={t('members.leave.button')}
            text={
              isOwner
                ? t('members.leave.ownerInfo')
                : lastMember
                  ? t('members.leave.lastMemberInfo')
                  : t('members.leave.body')
            }
          >
            <LeaveGroupDialog
              onTransfer={() => transferBox.current?.querySelector('button')?.click()}
              onDelete={() => deleteBox.current?.querySelector('button')?.click()}
            />
          </ManageRow>
        )}
        {!isOwner && lastMember && !canLeave && (
          <ManageRow
            icon={<IconDoorExit aria-hidden="true" size={20} stroke={1.75} />}
            title={t('members.leave.button')}
            text={t('members.leave.lastMemberInfo')}
          />
        )}
        {group.canDelete ? (
          <ManageRow
            icon={<IconTrash aria-hidden="true" size={20} stroke={1.75} />}
            title={t('groups.manage.delete')}
            text={t('groups.manage.deleteInfo')}
            danger
            boxRef={deleteBox}
          >
            <DeleteGroupDialog />
          </ManageRow>
        ) : (
          <ManageRow
            icon={<IconTrash aria-hidden="true" size={20} stroke={1.75} />}
            title={t('groups.manage.delete')}
            text={t('groups.manage.deleteUnavailable')}
            danger
          />
        )}
      </ul>
    </section>
  );
}

/** Vrstica upravljanja (design.md 8.5): ikona, naslov z razlago in akcija na desni; nevarna ima ikono `danger`. */
function ManageRow({
  icon,
  title,
  text,
  danger = false,
  boxRef,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  danger?: boolean;
  boxRef?: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}) {
  return (
    <li className="flex min-h-[76px] flex-wrap items-center gap-4 px-5 py-4">
      <span className={danger ? 'text-destructive' : 'text-muted-foreground'}>{icon}</span>
      <span className="flex min-w-0 flex-1 basis-64 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
      {children && (
        <div
          ref={boxRef}
          className="flex flex-col items-start gap-2 max-sm:w-full max-sm:items-stretch"
        >
          {children}
        </div>
      )}
    </li>
  );
}
