import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ArchiveGroupDialog } from './ArchiveGroupDialog';
import { DeleteGroupDialog } from './DeleteGroupDialog';
import { useGroup } from './groupContext';
import { UnarchiveButton } from './UnarchiveButton';

/**
 * *Nastavitve → Upravljanje skupine* (design.md 9.7 točka 4; FR-003-01, -04, -06, -09, -10): lastnik vidi arhiviranje
 * ali odarhiviranje, izbris pa samo, kadar je mogoč (`canDelete`), sicer razlago. Pri trajno arhivirani skupini (brez
 * lastnika) razdelek vidijo vsi člani. Akcija, ki ni mogoča, ni izrisana.
 */
export function GroupManagementSection() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  if (group.role !== 'OWNER' && !group.permanentlyArchived) return null;
  const canArchiveToggle = group.role === 'OWNER' && !group.permanentlyArchived;

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
