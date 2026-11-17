import { IconAlertTriangle, IconArrowLeft, IconGitMerge } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, focusRing, secondaryButton, textInput } from '../../shared/ui/styles';
import { useAuditTime } from '../audit/formatTime';
import { useDebouncedCallback } from '../contacts/useDebouncedCallback';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useHistoryApi } from './api';
import {
  DELETED_STATES,
  deletedSearch,
  hasDeletedFilters,
  readDeletedView,
  type DeletedView,
} from './historyRouting';
import { RestoreDialog } from './RestoreDialog';
import { LATEST, type DeletedItem, type DeletedPage as DeletedPageData } from './types';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: DeletedPageData };

const link = `text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`;

function DeletedRow({
  item,
  canRestore,
  onRestore,
}: {
  item: DeletedItem;
  canRestore: boolean;
  onRestore: (item: DeletedItem, trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const { group } = useGroup();
  const time = useAuditTime();
  const base = `/groups/${group.id}/contacts`;
  const merged = item.reason === 'MERGED';
  const kept = item.mergedInto;
  const actor = item.removedBy
    ? (item.removedBy.name ?? item.removedBy.email)
    : t('audit.list.deletedUser');
  const details = [item.email, item.company].filter((value) => value);
  return (
    <li className="flex flex-col gap-2 py-3">
      <p className="text-lg font-bold break-words">{item.displayName}</p>
      {details.length > 0 && <p className="break-all">{details.join(' · ')}</p>}
      <p className="text-muted-foreground">
        {t('history.deleted.removed', { actor, time: time(item.removedAt) })}
      </p>
      <p>
        <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-sm">
          {merged && <IconGitMerge aria-hidden="true" size={16} stroke={1.75} />}
          {merged
            ? kept
              ? t('history.deleted.badgeMerged', { name: kept.displayName })
              : t('history.deleted.badgeMergedUnknown')
            : t('history.deleted.badgeRestorable')}
        </span>
      </p>
      {merged && (
        <div className="flex flex-col gap-1">
          <p>
            {kept
              ? t('history.deleted.explain', { name: kept.displayName })
              : t('history.deleted.explainUnknown')}
          </p>
          {kept && !kept.exists && (
            <p className="text-muted-foreground">{t('history.deleted.keptGone')}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          to={`${base}/${item.contactId}/history`}
          aria-label={t('history.deleted.historyLabel', { name: item.displayName })}
          className={link}
        >
          {t('history.deleted.history')}
        </Link>
        {merged && kept?.exists && (
          <Link to={`${base}/${kept.contactId}`} className={link}>
            {t('history.deleted.openKept')}
          </Link>
        )}
        {canRestore && item.restorable && !merged && (
          <button
            type="button"
            className={secondaryButton}
            aria-label={t('history.deleted.restoreLabel', { name: item.displayName })}
            onClick={(event) => onRestore(item, event.currentTarget)}
          >
            {t('history.deleted.restore')}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Seznam izbrisanih kontaktov (FR-015-22 … FR-015-24, FR-015-14; design.md 8.9, 8.15): iskanje (zakasnjeno kot 008),
 * filter *Vsi / Obnovljivi / Združeni* kot izbirni gumbi, vrstice z imenom, e-naslovom, podjetjem, izvajalcem odstranitve
 * in oznako, *Zgodovina* in *Obnovi* (EDITOR+ v nearhivirani skupini). Z združevanjem odstranjen kontakt nima *Obnovi*,
 * temveč razlago. Stanje (q, state, page, size) je v poti.
 */
export function DeletedContactsPage() {
  const { t } = useTranslation();
  const api = useHistoryApi();
  const { group } = useGroup();
  const [params, setParams] = useSearchParams();
  const view = readDeletedView(params);
  const { page, size, q, state: stateFilter } = view;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [search, setSearch] = useState(q);
  const [restoring, setRestoring] = useState<DeletedItem | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusHeading = useRef(false);
  const headingId = useId();
  const searchId = useId();
  const showLoader = useDelayed(state.kind === 'loading');
  const canRestore = group.role !== 'VIEWER' && !group.archived;
  useDocumentTitle(t('title.groupScreen', { screen: t('title.deleted'), group: group.title }));

  // Iskalno polje sledi naslovu poti (npr. *Počisti iskanje*, nazaj v zgodovini brskalnika).
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setSearch(q);
  }

  const navigate = useCallback(
    (next: DeletedView, options: { replace?: boolean } = {}) =>
      setParams(deletedSearch(next), options),
    [setParams],
  );
  const debounced = useDebouncedCallback((value: string) => {
    navigate({ ...view, q: value.trim(), page: 1 }, { replace: true });
  }, 300);

  useEffect(() => {
    let active = true;
    api.listDeleted(group.id, page - 1, size, { q, state: stateFilter }).then(
      (data) => {
        if (!active) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (page > pages) {
          setParams(deletedSearch({ page: pages, size, q, state: stateFilter }), { replace: true });
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
  }, [api, group.id, page, size, q, stateFilter, reloads, setParams]);

  const goTo = (next: DeletedView) => {
    focusHeading.current = true;
    navigate(next);
  };

  const data = state.kind === 'ready' ? state.data : null;
  const filtered = hasDeletedFilters(view);
  const base = `/groups/${group.id}/contacts`;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6"
    >
      <Link to={base} className={`inline-flex items-center gap-1 self-start ${link}`}>
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {t('history.deleted.back')}
      </Link>
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('history.deleted.heading')}
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="font-bold">
          {t('history.deleted.searchLabel')}
        </label>
        <input
          id={searchId}
          type="search"
          autoComplete="off"
          maxLength={100}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            debounced.schedule(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              debounced.cancel();
              goTo({ ...view, q: search.trim(), page: 1 });
            }
          }}
          className={`${textInput} h-11`}
        />
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4">
        <legend className="mb-1 font-bold">{t('history.deleted.stateLegend')}</legend>
        {DELETED_STATES.map((option) => (
          <label key={option} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`${headingId}-state`}
              className="size-5 accent-primary"
              checked={stateFilter === option}
              onChange={() => goTo({ ...view, state: option, page: 1 })}
            />
            {t(`history.deleted.state.${option}`)}
          </label>
        ))}
      </fieldset>

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('history.deleted.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('history.deleted.retry')}
            </button>
          </span>
        </div>
      )}

      {state.kind === 'loading' && showLoader && (
        <p role="status">{t('history.deleted.loading')}</p>
      )}

      {data && data.total === 0 && (
        <div className="flex flex-col items-start gap-3 py-4">
          <h3 className="text-lg font-bold">
            {filtered ? t('history.deleted.emptyFiltered') : t('history.deleted.empty')}
          </h3>
          {!filtered && <p>{t('history.deleted.emptyText')}</p>}
          {filtered && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                debounced.cancel();
                goTo({ page: 1, size, q: '', state: 'all' });
              }}
            >
              {t('history.deleted.clearSearch')}
            </button>
          )}
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <ol
            aria-label={t('history.deleted.list')}
            className="flex flex-col divide-y divide-border"
          >
            {data.items.map((item) => (
              <DeletedRow
                key={item.contactId}
                item={item}
                canRestore={canRestore}
                onRestore={(next, trigger) => {
                  opener.current = trigger;
                  setRestoring(next);
                }}
              />
            ))}
          </ol>
          <SectionPagination
            label={t('groups.pagination.label', { list: t('history.deleted.paginationList') })}
            page={page - 1}
            size={size}
            total={data.total}
            disabled={false}
            onPage={(next) => goTo({ ...view, page: next + 1 })}
            onSize={(next) => goTo({ ...view, size: next, page: 1 })}
          />
        </>
      )}

      <RestoreDialog
        contactId={restoring?.contactId ?? ''}
        contactName={restoring?.displayName ?? null}
        from={restoring ? LATEST : null}
        returnFocus={opener}
        onClose={() => setRestoring(null)}
        onConflict={() => setReloads((n) => n + 1)}
        onRestored={() => {
          // Obnovljen kontakt izgine s seznama: fokus na naslov.
          opener.current = null;
          setRestoring(null);
          focusHeading.current = true;
          setReloads((n) => n + 1);
        }}
      />
    </section>
  );
}
