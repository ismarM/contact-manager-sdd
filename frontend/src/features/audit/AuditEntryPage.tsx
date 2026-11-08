import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { useAuditApi } from './api';
import { AuditEntryItem } from './AuditEntryItem';
import type { AuditEntry } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; entry: AuditEntry };

/**
 * Stran enega vnosa sledi (FR-005-12, FR-005-19): cilj povezav iz vnosa rollback in oznake *Povrnjeno*. Brez gumba za
 * rollback – ta potrebuje najnovejši vnos celotne sledi, ki ga ima samo seznam (plan.md, Complexity Tracking).
 */
export function AuditEntryPage({ entryId }: { entryId: string }) {
  const { t } = useTranslation();
  const api = useAuditApi();
  const { group } = useGroup();
  const headingId = useId();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const showLoader = useDelayed(state.kind === 'loading');
  useDocumentTitle(t('title.groupScreen', { screen: t('title.auditEntry'), group: group.title }));

  useEffect(() => {
    let active = true;
    api.getAuditEntry(group.id, entryId).then(
      (entry) => {
        if (active) setState({ kind: 'ready', entry });
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
  }, [api, group.id, entryId, reloads]);

  if (state.kind === 'notFound') return <NotFoundPage />;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <h2 id={headingId} className="text-xl font-bold">
        {t('audit.entry.heading')}
      </h2>
      <Link
        to={`/groups/${group.id}/audit`}
        className={`inline-flex items-center gap-1 self-start text-primary underline underline-offset-4 ${focusRing}`}
      >
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {t('audit.entry.back')}
      </Link>
      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('audit.entry.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('audit.list.retry')}
            </button>
          </span>
        </div>
      )}
      {state.kind === 'loading' && showLoader && <p role="status">{t('audit.list.loading')}</p>}
      {state.kind === 'ready' && (
        <ul>
          <AuditEntryItem key={state.entry.id} entry={state.entry} />
        </ul>
      )}
    </section>
  );
}
