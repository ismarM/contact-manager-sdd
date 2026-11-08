import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useAuditApi } from './api';
import { auditSearch, hasFilters, readAuditView } from './auditRouting';
import { AuditEntryItem } from './AuditEntryItem';
import { AuditFilters } from './AuditFilters';
import { useAuditTime } from './formatTime';
import { InitialStateItem } from './InitialStateItem';
import { RollbackDialog, type RollbackTarget } from './RollbackDialog';
import type { AuditEntry, AuditFilters as Filters, AuditPage as AuditPageData } from './types';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: AuditPageData };

type Banner = {
  key:
    | 'audit.errors.stale'
    | 'audit.errors.noChanges'
    | 'audit.errors.archived'
    | 'audit.errors.forbidden'
    | 'audit.errors.failed'
    | 'groups.offline';
  warning: boolean;
  retry: boolean;
};

/** Sporočilo za neuspel rollback (design.md 8.13): brez tehničnih kod; omrežna napaka = brez povezave. */
function bannerFor(error: unknown): Banner {
  if (!(error instanceof ApiError)) return { key: 'groups.offline', warning: false, retry: true };
  if (error.status === 409 && error.code === 'VERSION_CONFLICT') {
    return { key: 'audit.errors.stale', warning: true, retry: false };
  }
  if (error.status === 409 && error.code === 'ROLLBACK_NO_CHANGES') {
    return { key: 'audit.errors.noChanges', warning: true, retry: false };
  }
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') {
    return { key: 'audit.errors.archived', warning: false, retry: false };
  }
  if (error.status === 403) return { key: 'audit.errors.forbidden', warning: false, retry: false };
  return { key: 'audit.errors.failed', warning: false, retry: true };
}

/**
 * Razdelek *Revizijska sled* (plan.md 005; design.md 9.6; FR-005-07 … FR-005-20): seznam vnosov s paginacijo in filtri v
 * poti, točka *Začetno stanje* na koncu nefiltrirane sledi in rollback za ADMIN, OWNER v nearhivirani skupini.
 */
export function AuditPage() {
  const { t } = useTranslation();
  const api = useAuditApi();
  const { group, reload: reloadGroup } = useGroup();
  const time = useAuditTime();
  const [params, setParams] = useSearchParams();
  const { page, size, filters, contactInvalid } = readAuditView(params);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [pending, setPending] = useState<AuditEntry | 'initial' | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [attempt, setAttempt] = useState<AuditEntry | 'initial' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusHeading = useRef(false);
  const headingId = useId();
  const showLoader = useDelayed(state.kind === 'loading');
  const actionsKey = filters.actions.join(',');
  const contact = filters.contact;
  const canRestore = (group.role === 'ADMIN' || group.role === 'OWNER') && !group.archived;
  useDocumentTitle(t('title.groupScreen', { screen: t('title.audit'), group: group.title }));

  useEffect(() => {
    let active = true;
    if (contactInvalid) return undefined;
    const current: Filters = {
      actions: actionsKey ? (actionsKey.split(',') as Filters['actions']) : [],
      contact,
    };
    api.listAudit(group.id, page - 1, size, current).then(
      (data) => {
        if (!active) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (page > pages) {
          setParams(auditSearch(pages, size, current), { replace: true });
          return;
        }
        setState({ kind: 'ready', data });
        if (focusHeading.current) {
          focusHeading.current = false;
          heading.current?.focus();
        }
      },
      () => {
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, page, size, actionsKey, contact, contactInvalid, reloads, setParams]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const goTo = (nextPage: number, nextSize: number, nextFilters: Filters = filters) => {
    focusHeading.current = true;
    setParams(auditSearch(nextPage, nextSize, nextFilters));
  };

  const open = (next: AuditEntry | 'initial') => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending(next);
  };

  const run = async (target: AuditEntry | 'initial') => {
    const latest = state.kind === 'ready' ? state.data.latestEntryId : null;
    if (!latest || busy) return;
    setAttempt(target);
    setBanner(null);
    setBusy(true);
    try {
      if (target === 'initial') await api.rollbackInitial(group.id, latest);
      else await api.rollback(group.id, target.id, latest);
      // Po uspehu fokus prevzame naslov; zaprtje dialoga ga ne sme vrniti na sprožilec.
      opener.current = null;
      setPending(null);
      toast(
        target === 'initial'
          ? t('audit.toast.restoredInitial')
          : t('audit.toast.restored', { time: time(target.createdAt) }),
      );
      focusHeading.current = true;
      if (page !== 1) setParams(auditSearch(1, size, filters));
      else reload();
    } catch (error) {
      setPending(null);
      const next = bannerFor(error);
      setBanner(next);
      if (!next.retry) {
        reload();
        if (next.key === 'audit.errors.archived' || next.key === 'audit.errors.forbidden') {
          void reloadGroup();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const data: AuditPageData | null = contactInvalid
    ? { total: 0, page: 0, size, items: [], latestEntryId: null, contactFilter: null }
    : state.kind === 'ready'
      ? state.data
      : null;
  const filtered = hasFilters(filters, contactInvalid);
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const showInitial = data !== null && !filtered && data.total > 0 && page === pages;
  const target: RollbackTarget =
    pending === null
      ? null
      : pending === 'initial'
        ? null
        : { id: pending.id, createdAt: pending.createdAt };

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('audit.list.heading')}
      </h2>

      <AuditFilters
        filters={filters}
        contactName={data?.contactFilter?.displayName ?? null}
        onChange={(next) => goTo(1, size, next)}
      />

      {banner && (
        <div role="alert" className={banner.warning ? warningAlert : errorAlert}>
          <p className="flex gap-2">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span className="flex flex-wrap items-center gap-3">
              {t(banner.key)}
              {banner.retry && attempt && (
                <button type="button" className={secondaryButton} onClick={() => void run(attempt)}>
                  {t('audit.errors.retry')}
                </button>
              )}
            </span>
          </p>
        </div>
      )}

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('audit.list.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                reload();
              }}
            >
              {t('audit.list.retry')}
            </button>
          </span>
        </div>
      )}

      {state.kind === 'loading' && showLoader && <p role="status">{t('audit.list.loading')}</p>}

      {data && data.total === 0 && (
        <div className="flex flex-col items-start gap-3 py-4">
          <h3 className="text-lg font-bold">
            {filtered ? t('audit.list.emptyFiltered') : t('audit.list.empty')}
          </h3>
          {filtered && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => goTo(1, size, { actions: [], contact: null })}
            >
              {t('audit.list.clearFilters')}
            </button>
          )}
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <ol aria-label={t('audit.list.entries')} className="flex flex-col divide-y divide-border">
            {data.items.map((entry) => (
              <AuditEntryItem
                key={entry.id}
                entry={entry}
                onRestore={
                  canRestore && entry.id !== data.latestEntryId ? () => open(entry) : undefined
                }
              />
            ))}
            {showInitial && (
              <InitialStateItem onRestore={canRestore ? () => open('initial') : undefined} />
            )}
          </ol>
          <SectionPagination
            label={t('contacts.pagination.label')}
            page={page - 1}
            size={size}
            total={data.total}
            disabled={false}
            onPage={(next) => goTo(next + 1, size)}
            onSize={(next) => goTo(1, next)}
          />
        </>
      )}

      <RollbackDialog
        open={pending !== null}
        target={target}
        busy={busy}
        onCancel={() => setPending(null)}
        returnFocus={opener}
        onConfirm={() => pending && void run(pending)}
      />
    </section>
  );
}
