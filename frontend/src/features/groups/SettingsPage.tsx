import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { InviteMemberSection } from '../invitations/InviteMemberSection';
import { PendingInvitationsSection } from '../invitations/PendingInvitationsSection';
import { MembersSection } from '../members/MembersSection';
import { GroupDetailsSection } from './GroupDetailsSection';
import { GroupManagementSection } from './GroupManagementSection';
import { useGroup } from './groupContext';

/**
 * Razdelek *Nastavitve* skupine (design.md 9.7; FR-002-09, FR-002-10): *Podatki skupine*, (*Člani*, 007), *Povabi člana*
 * (ADMIN+, nearhivirana skupina; 006), *Čakajoča povabila* (ADMIN+, tudi arhivirana skupina; 006) in
 * *Upravljanje skupine* (003).
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { group } = useGroup();
  const [sent, setSent] = useState(0);
  useDocumentTitle(
    t('title.groupScreen', { screen: t('groups.header.settings'), group: group.title }),
  );
  const manages = group.role === 'ADMIN' || group.role === 'OWNER';

  return (
    <div className="mx-auto flex max-w-[70ch] flex-col gap-8 px-4 py-8">
      <GroupDetailsSection />
      <MembersSection />
      {manages && !group.archived && <InviteMemberSection onSent={() => setSent((v) => v + 1)} />}
      {manages && <PendingInvitationsSection reloadToken={sent} />}
      <GroupManagementSection />
    </div>
  );
}
