import { useTranslation } from 'react-i18next';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { GroupDetailsSection } from './GroupDetailsSection';
import { useGroup } from './groupContext';

/** Razdelek *Nastavitve* skupine (design.md 9.7; FR-002-09, FR-002-10): do 003/006/007 samo *Podatki skupine*. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { group } = useGroup();
  useDocumentTitle(
    t('title.groupScreen', { screen: t('groups.header.settings'), group: group.title }),
  );

  return (
    <div className="mx-auto flex max-w-[70ch] flex-col gap-8 px-4 py-8">
      <GroupDetailsSection />
    </div>
  );
}
