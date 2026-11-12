import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { focusRing } from '../../shared/ui/styles';
import type { GroupDetail } from '../groups/types';

/** Razlaga za bralca in arhivirano skupino (FR-011-01, FR-011-19): brez obrazca in brez klica API. */
export function DuplicatesUnavailable({ group }: { group: GroupDetail }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="duplicates-unavailable"
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <h2 id="duplicates-unavailable" className="text-xl font-bold">
        {t('duplicates.heading')}
      </h2>
      <p role="note">
        {group.archived ? t('duplicates.archivedNote') : t('duplicates.viewerNote')}
      </p>
      <p>
        <Link to={`/groups/${group.id}/contacts`} className={`font-bold underline ${focusRing}`}>
          {t('duplicates.backToContacts')}
        </Link>
      </p>
    </section>
  );
}
