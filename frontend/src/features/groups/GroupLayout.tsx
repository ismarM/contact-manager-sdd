import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useParams } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert } from '../../shared/ui/styles';
import { AuditEntryPage } from '../audit/AuditEntryPage';
import { AuditPage } from '../audit/AuditPage';
import { ContactsPage } from '../contacts/ContactsPage';
import { SelectionProvider } from '../contacts/selection/SelectionProvider';
import { ComparePage } from '../duplicates/ComparePage';
import { DuplicatesPage } from '../duplicates/DuplicatesPage';
import { ComparePage as VersionComparePage } from '../history/ComparePage';
import { ContactHistoryPage } from '../history/ContactHistoryPage';
import { DeletedContactsPage } from '../history/DeletedContactsPage';
import { VersionPage } from '../history/VersionPage';
import { useGroupsApi } from './api';
import { ArchivedBanner } from './ArchivedBanner';
import { GroupContext, type GroupContextValue } from './groupContext';
import { GroupHeader } from './GroupHeader';
import { SettingsPage } from './SettingsPage';
import type { GroupDetail } from './types';
import { useDelayed } from './useDelayed';

/**
 * Razdelki skupine (plan.md 004, 005, 011, 015 – Pages and routes): *Kontakti* (privzeti, s podpotmi), *Dvojniki*
 * (`duplicates`, `duplicates/compare`), *Revizijska sled* in *Nastavitve*; iz kontaktov še `deleted-contacts`.
 */
const SECTIONS = ['contacts', 'duplicates', 'audit', 'settings'] as const;

/** Zgodovina kontakta (015): `contacts/:id/history`, `…/history/:ref`, `…/compare`; ostale podpoti razreši ContactsPage. */
type HistoryRoute =
  | { screen: 'history'; contactId: string }
  | { screen: 'version'; contactId: string; ref: string }
  | { screen: 'versionCompare'; contactId: string };

function historyRoute(section: string): HistoryRoute | null {
  const [first, contactId, action, ref, ...rest] = section.split('/');
  if (first !== 'contacts' || !contactId || contactId === 'new' || rest.length > 0) return null;
  if (action === 'history' && ref === undefined) return { screen: 'history', contactId };
  if (action === 'history' && ref) return { screen: 'version', contactId, ref };
  if (action === 'compare' && ref === undefined) return { screen: 'versionCompare', contactId };
  return null;
}

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
  // Podpoti kontaktov (`contacts/new`, `contacts/:id`, `contacts/:id/edit`) razreši ContactsPage.
  const history = historyRoute(section);
  const first = section.split('/')[0] ?? '';
  const rest = section.split('/').slice(1);
  const unknown =
    first === 'audit'
      ? rest.length > 1 || rest[0] === ''
      : first === 'duplicates'
        ? section !== 'duplicates' && section !== 'duplicates/compare'
        : section !== 'settings' && section !== 'deleted-contacts' && first !== 'contacts';
  if (unknown) return <NotFoundPage />;
  return (
    <GroupScreen
      key={groupId}
      groupId={groupId}
      history={history}
      screen={
        section === 'deleted-contacts'
          ? 'deleted'
          : first === 'contacts'
            ? 'contacts'
            : first === 'duplicates'
              ? section === 'duplicates'
                ? 'duplicates'
                : 'compare'
              : first === 'audit'
                ? 'audit'
                : 'settings'
      }
      entryId={first === 'audit' ? rest[0] : undefined}
    />
  );
}

type State =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'failed' }
  | { kind: 'ready'; group: GroupDetail };

function GroupScreen({
  groupId,
  screen,
  entryId,
  history,
}: {
  groupId: string;
  screen: 'contacts' | 'duplicates' | 'compare' | 'audit' | 'settings' | 'deleted';
  entryId: string | undefined;
  history: HistoryRoute | null;
}) {
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

  const reload = useCallback(
    () =>
      api.getGroup(groupId).then(
        (group) => setState({ kind: 'ready', group }),
        (error: unknown) => {
          if (error instanceof ApiError && error.status === 404) setState({ kind: 'notFound' });
        },
      ),
    [api, groupId],
  );

  const context = useMemo<GroupContextValue | null>(
    () =>
      state.kind === 'ready'
        ? {
            group: state.group,
            setGroup: (group) => setState({ kind: 'ready', group }),
            markNotFound: () => setState({ kind: 'notFound' }),
            reload,
          }
        : null,
    [state, reload],
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
      <SelectionProvider groupId={groupId}>
        <GroupHeader group={context.group} focusTitle={focusTitle} />
        <ArchivedBanner />
        {history ? (
          history.screen === 'history' ? (
            <ContactHistoryPage key={history.contactId} contactId={history.contactId} />
          ) : history.screen === 'version' ? (
            <VersionPage
              key={`${history.contactId}/${history.ref}`}
              contactId={history.contactId}
              versionRef={history.ref}
            />
          ) : (
            <VersionComparePage key={history.contactId} contactId={history.contactId} />
          )
        ) : screen === 'deleted' ? (
          <DeletedContactsPage />
        ) : screen === 'contacts' ? (
          <ContactsPage />
        ) : screen === 'duplicates' ? (
          <DuplicatesPage />
        ) : screen === 'compare' ? (
          <ComparePage />
        ) : screen === 'audit' ? (
          entryId === undefined ? (
            <AuditPage />
          ) : (
            <AuditEntryPage entryId={entryId} />
          )
        ) : (
          <SettingsPage />
        )}
      </SelectionProvider>
    </GroupContext.Provider>
  );
}
