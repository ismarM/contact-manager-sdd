import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useParams } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert } from '../../shared/ui/styles';
import { useGroupsApi } from './api';
import { GroupContext, type GroupContextValue } from './groupContext';
import { GroupHeader } from './GroupHeader';
import { SettingsPage } from './SettingsPage';
import type { GroupDetail } from './types';
import { useDelayed } from './useDelayed';

/** Razdelki skupine (plan.md – Pages and routes): do 004 samo *Nastavitve*, ki so tudi prvi razdelek. */
const SECTIONS = ['settings'] as const;

/**
 * Okvir skupine `/groups/:groupId/*` (FR-002-07, -08): `/groups/:id` odpre prvi razdelek, neznan razdelek in skupina, za
 * katero zaledje vrne 404 (nečlan, neobstoječa), prikažeta »Te strani ni« brez podatkov skupine.
 */
export function GroupLayout() {
  const params = useParams();
  const location = useLocation();
  const groupId = params.groupId ?? '';
  const section = params['*'] ?? '';

  if (section === '') {
    return (
      <Navigate
        to={`/groups/${groupId}/${SECTIONS[0]}`}
        replace
        state={location.state as unknown}
      />
    );
  }
  if (!(SECTIONS as readonly string[]).includes(section)) return <NotFoundPage />;
  return <GroupScreen key={groupId} groupId={groupId} />;
}

type State =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'failed' }
  | { kind: 'ready'; group: GroupDetail };

function GroupScreen({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true;
  const showLoader = useDelayed(state.kind === 'loading');

  useEffect(() => {
    let active = true;
    api.getGroup(groupId).then(
      (group) => {
        if (active) setState({ kind: 'ready', group });
      },
      (error: unknown) => {
        if (!active) return;
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: 'notFound' }
            : { kind: 'failed' },
        );
      },
    );
    return () => {
      active = false;
    };
  }, [api, groupId]);

  const context = useMemo<GroupContextValue | null>(
    () =>
      state.kind === 'ready'
        ? {
            group: state.group,
            setGroup: (group) => setState({ kind: 'ready', group }),
            markNotFound: () => setState({ kind: 'notFound' }),
          }
        : null,
    [state],
  );

  if (state.kind === 'notFound') return <NotFoundPage />;
  if (state.kind === 'failed') {
    return (
      <div className="px-4 py-8">
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('groups.loadFailed')}</span>
        </div>
      </div>
    );
  }
  if (!context) {
    return showLoader ? (
      <p role="status" className="px-4 py-8">
        {t('groups.loading')}
      </p>
    ) : null;
  }

  return (
    <GroupContext.Provider value={context}>
      <GroupHeader group={context.group} focusTitle={focusTitle} />
      <SettingsPage />
    </GroupContext.Provider>
  );
}
