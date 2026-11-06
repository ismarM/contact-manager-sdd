import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { errorAlert, secondaryButton } from '../../shared/ui/styles';
import { manageFailureKey, useGroupsApi } from './api';
import { useGroup } from './groupContext';
import { useGroups } from './groupsContext';

/**
 * Akcija *Odarhiviraj skupino* (FR-003-06): brez potrditvenega dialoga (feature-map §2.8); po uspehu obvestilo in
 * osvežitev skupine in povzetka, ob neuspehu opozorilo ob akciji.
 */
export function UnarchiveButton({ className = secondaryButton }: { className?: string }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const { group, setGroup, markNotFound, reload } = useGroup();
  const { refresh } = useGroups();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const unarchive = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      setGroup(await api.unarchiveGroup(group.id));
      toast(t('groups.toast.unarchived'));
      refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        markNotFound();
      } else if (error instanceof ApiError && error.status === 409) {
        // Stanje se je medtem spremenilo (GROUP_NOT_ARCHIVED): ponovno branje.
        await reload();
        refresh();
      } else {
        setFailure(t(manageFailureKey(error, 'groups.manage.unarchiveFailed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          className={className}
          aria-disabled={busy}
          onClick={() => void unarchive()}
        >
          {t('groups.manage.unarchive')}
        </button>
      </div>
      {failure && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{failure}</span>
        </div>
      )}
    </div>
  );
}
