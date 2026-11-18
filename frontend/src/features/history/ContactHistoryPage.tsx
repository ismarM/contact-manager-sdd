import { LoadingState } from '../../shared/ui/Skeleton';
import { EmptyState } from '../../shared/ui/EmptyState';
import { IconAlertTriangle, IconArrowLeft, IconGitCompare, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { Avatar } from '../../shared/images/Avatar';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { backLink, card, errorAlert, secondaryButton, softButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { isNotFound, useHistoryApi } from './api';
import { HistoryTimeline, type ComparePick } from './HistoryTimeline';
import { pagingSearch, readPaging } from './historyRouting';
import { RestoreDialog } from './RestoreDialog';
import { type History } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; data: History };

/**
 * Zgodovina kontakta (plan.md 015 – Pages and routes; FR-015-05 … FR-015-09, FR-015-19): paginirana časovnica z
 * oznako izbrisan/združen, primerjavo dveh izbranih različic in obnovo (EDITOR+ v nearhivirani skupini). Strani so
 * v poti (`?page`, `?size`), napaka je trajno sporočilo s *Poskusi znova*.
 */
export function ContactHistoryPage({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const api = useHistoryApi();
  const { group } = useGroup();
  const [params, setParams] = useSearchParams();
  const { page, size } = readPaging(params);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [picks, setPicks] = useState<ComparePick[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusHeading = useRef(false);
  const headingId = useId();
  const showLoader = useDelayed(state.kind === 'loading');
  const canRestore = group.role !== 'VIEWER' && !group.archived;
  const name = state.kind === 'ready' ? state.data.contact.displayName : '';
  useDocumentTitle(
    t('title.groupScreen', {
      screen: name ? `${t('title.history')}: ${name}` : t('title.history'),
      group: group.title,
    }),
  );

  useEffect(() => {
    let active = true;
    api.getHistory(group.id, contactId, page - 1, size).then(
      (data) => {
        if (!active) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (page > pages) {
          setParams(pagingSearch(pages, size), { replace: true });
          return;
        }
        setState({ kind: 'ready', data });
        if (focusHeading.current) {
          focusHeading.current = false;
          heading.current?.focus();
        }
      },
      (error: unknown) => {
        if (active) setState({ kind: isNotFound(error) ? 'notFound' : 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, page, size, reloads, setParams]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const goTo = (nextPage: number, nextSize: number) => {
    focusHeading.current = true;
    setParams(pagingSearch(nextPage, nextSize));
  };

  const pick = (next: ComparePick) =>
    setPicks((current) =>
      current.some((p) => p.ref === next.ref)
        ? current.filter((p) => p.ref !== next.ref)
        : current.length < 2
          ? [...current, next]
          : current,
    );

  const openRestore = (ref: string) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRestoring(ref);
  };

  if (state.kind === 'notFound') return <NotFoundPage />;

  const data = state.kind === 'ready' ? state.data : null;
  const base = `/groups/${group.id}`;
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  const status = data?.contact.status;
  const compare = [...picks].sort((a, b) =>
    a.createdAt === null ? -1 : b.createdAt === null ? 1 : a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[56rem] flex-col gap-5 px-4 py-6"
    >
      <Link
        to={
          status === undefined || status === 'ACTIVE'
            ? `${base}/contacts/${contactId}`
            : `${base}/deleted-contacts`
        }
        className={`inline-flex items-center gap-1 self-start ${backLink}`}
      >
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {status === undefined || status === 'ACTIVE'
          ? t('history.page.back')
          : t('history.page.backDeleted')}
      </Link>
      <div className="flex min-w-0 items-center gap-4">
        {data && (
          <Avatar
            kind="contact"
            name={data.contact.displayName}
            colorSeed={contactId}
            size={40}
            alt=""
          />
        )}
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold break-words outline-none"
        >
          {data ? t('history.page.heading', { name }) : t('history.page.list')}
        </h2>
      </div>

      {status && status !== 'ACTIVE' && (
        <p
          role="note"
          className="flex items-center gap-2 rounded-md border border-border bg-muted p-3"
        >
          <IconTrash aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          {status === 'DELETED' ? t('history.page.statusDeleted') : t('history.page.statusMerged')}
        </p>
      )}

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('history.page.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                reload();
              }}
            >
              {t('history.page.retry')}
            </button>
          </span>
        </div>
      )}

      {state.kind === 'loading' && showLoader && <LoadingState label={t('history.page.loading')} />}

      {data && data.total === 0 && !data.contact.hasInitial && (
        <EmptyState
          headingLevel={3}
          title={t('history.page.empty')}
          text={t('history.page.emptyText')}
        />
      )}

      {data && (data.total > 0 || data.contact.hasInitial) && (
        <>
          <div
            role="group"
            aria-label={t('history.selection.summary')}
            className={`${card} flex flex-wrap items-center gap-3 py-2.5 pr-2.5 pl-4`}
          >
            <IconGitCompare
              aria-hidden="true"
              size={20}
              stroke={1.75}
              className="text-muted-foreground"
            />
            {compare.length === 2 && compare[0] && compare[1] ? (
              <Link
                to={`${base}/contacts/${contactId}/compare?from=${compare[0].ref}&to=${compare[1].ref}`}
                className={`${softButton} ml-auto h-9`}
              >
                {t('history.selection.compare')}
              </Link>
            ) : (
              <p aria-live="polite" className="flex-1 text-sm text-muted-foreground">
                {picks.length === 1 ? t('history.selection.one') : t('history.selection.hint')}
              </p>
            )}
          </div>
          <HistoryTimeline
            history={data}
            showInitial={data.contact.hasInitial && page === pages}
            canRestore={canRestore}
            picks={picks}
            onPick={pick}
            onRestore={openRestore}
          />
          {data.total > 0 && (
            <SectionPagination
              label={t('groups.pagination.label', { list: t('history.page.list') })}
              page={page - 1}
              size={size}
              total={data.total}
              disabled={false}
              onPage={(next) => goTo(next + 1, size)}
              onSize={(next) => goTo(1, next)}
            />
          )}
        </>
      )}

      <RestoreDialog
        contactId={contactId}
        contactName={data?.contact.displayName ?? null}
        from={restoring}
        returnFocus={opener}
        onClose={() => setRestoring(null)}
        onConflict={reload}
        onRestored={() => {
          // Po uspehu fokus prevzame naslov; zaprtje dialoga ga ne sme vrniti na sprožilec (gumb je medtem lahko izginil).
          opener.current = null;
          setRestoring(null);
          setPicks([]);
          focusHeading.current = true;
          if (page !== 1) setParams(pagingSearch(1, size));
          else reload();
        }}
      />
    </section>
  );
}
