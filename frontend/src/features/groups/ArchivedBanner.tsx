import { IconArchive } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { warningAlert } from '../../shared/ui/styles';
import { useGroup } from './groupContext';
import { UnarchiveButton } from './UnarchiveButton';

/**
 * Pasica arhivirane skupine pod glavo (design.md 9.11; FR-003-05, FR-003-08): besedilo stanja; *Odarhiviraj skupino*
 * samo za lastnika, pri trajno arhivirani skupini je ni.
 */
export function ArchivedBanner() {
  const { t } = useTranslation();
  const { group } = useGroup();
  if (!group.archived) return null;

  return (
    <section aria-label={t('groups.banner.region')} className={`${warningAlert} mx-4 mt-4`}>
      <p className="flex items-start gap-2">
        <IconArchive aria-hidden="true" size={20} stroke={1.75} className="mt-0.5 shrink-0" />
        <span>
          {group.permanentlyArchived ? t('groups.banner.permanent') : t('groups.banner.archived')}
        </span>
      </p>
      {group.role === 'OWNER' && !group.permanentlyArchived && <UnarchiveButton />}
    </section>
  );
}
