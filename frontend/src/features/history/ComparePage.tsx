import { LoadingState } from '../../shared/ui/Skeleton';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { backLink, card, errorAlert, secondaryButton, softButton } from '../../shared/ui/styles';
import { typeNameKey } from '../attributes/typeNames';
import { typeChange, useChangeText } from '../audit/changeText';
import type { ChangeFieldName } from '../audit/types';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { useHistoryApi } from './api';
import { ChangeKindLabel } from './ChangeKindLabel';
import { buildRows, type CompareRow } from './compareRows';
import { stateName } from './historyRouting';
import { RestoreDialog } from './RestoreDialog';
import { CURRENT, type Comparison, type Version } from './types';
import { useVersionLabel } from './versionLabel';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'invalid' }
  | { kind: 'notFound' }
  | { kind: 'ready'; data: Comparison };

function Cell({ row, side }: { row: CompareRow; side: 'before' | 'after' }) {
  const { t } = useTranslation();
  const text = useChangeText();
  const value = row[side];
  const label = t(side === 'before' ? 'history.compare.from' : 'history.compare.to');
  const field: ChangeFieldName =
    row.label.kind === 'field'
      ? row.label.field
      : row.label.kind === 'attribute'
        ? 'ATTRIBUTE'
        : 'TAGS';
  const content: string | null = row.presence
    ? t(value ? 'history.compare.present' : 'history.compare.absent')
    : text(field, value);
  return (
    <td className="p-2 break-words max-sm:block max-sm:px-0 max-sm:py-1">
      <span className="font-bold sm:hidden">{label}: </span>
      {content === null || content === '' ? (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">{t('audit.details.empty')}</span>
        </>
      ) : (
        content
      )}
    </td>
  );
}

function RowLabel({ row }: { row: CompareRow }) {
  const { t } = useTranslation();
  if (row.label.kind === 'attribute') {
    const types = typeChange(row.before, row.after);
    return (
      <>
        <span className="font-mono">{row.label.key}</span>
        {types && (
          <span className="block text-sm font-normal text-muted-foreground">
            {t('audit.details.typeChange', {
              before: t(typeNameKey(types[0])),
              after: t(typeNameKey(types[1])),
            })}
          </span>
        )}
      </>
    );
  }
  if (row.label.kind === 'tag') return <>{t('history.compare.tag', { tag: row.label.tag })}</>;
  return <>{t(`audit.details.fields.${row.label.field}`)}</>;
}

function DiffTable({ rows, caption }: { rows: CompareRow[]; caption: string }) {
  const { t } = useTranslation();
  return (
    <table className="w-full border-collapse text-left max-sm:block">
      <caption className="sr-only">{caption}</caption>
      <thead className="max-sm:sr-only">
        <tr>
          <th scope="col" className="border-b border-border p-2">
            {t('history.compare.field')}
          </th>
          <th scope="col" className="border-b border-border p-2">
            {t('history.compare.kind')}
          </th>
          <th scope="col" className="border-b border-border p-2">
            {t('history.compare.from')}
          </th>
          <th scope="col" className="border-b border-border p-2">
            {t('history.compare.to')}
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-3">
        {rows.map((row) => (
          <tr
            key={row.id}
            className="border-b border-border last:border-b-0 max-sm:block max-sm:rounded-md max-sm:border max-sm:bg-card max-sm:p-3"
          >
            <th
              scope="row"
              className="p-2 font-bold break-words max-sm:block max-sm:px-0 max-sm:py-1"
            >
              <RowLabel row={row} />
            </th>
            <td className="p-2 max-sm:block max-sm:px-0 max-sm:py-1">
              <ChangeKindLabel kind={row.kind} />
            </td>
            <Cell row={row} side="before" />
            <Cell row={row} side="after" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Primerjava dveh različic kontakta (FR-015-09; plan.md 015 – Pages and routes; design.md 9.5): razlike po poljih, vsaka
 * z besedilno oznako (dodano, odstranjeno, spremenjeno) in ikono; nespremenjena polja so skrita z gumbom. Pod 640 px
 * je vsaka vrstica kartica. Obnova obeh zabeleženih različic za EDITOR+ v nearhivirani skupini.
 */
export function ComparePage({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const api = useHistoryApi();
  const navigate = useNavigate();
  const { group } = useGroup();
  const [params] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const versionLabel = useVersionLabel();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const unchangedId = useId();
  const missing = !from || !to || from === to;
  const invalid = missing || state.kind === 'invalid';
  const showLoader = useDelayed(state.kind === 'loading' && !missing);
  const canRestore = group.role !== 'VIEWER' && !group.archived;
  useDocumentTitle(
    t('title.groupScreen', { screen: t('title.compareVersions'), group: group.title }),
  );

  useEffect(() => {
    let active = true;
    if (missing) return undefined;
    api.compare(group.id, contactId, from, to).then(
      (data) => {
        if (active) setState({ kind: 'ready', data });
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) setState({ kind: 'notFound' });
        else if (error instanceof ApiError && error.status === 400) setState({ kind: 'invalid' });
        else setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, from, to, missing, reloads]);

  const data = state.kind === 'ready' && !missing ? state.data : null;
  const rows = useMemo(() => (data ? buildRows(data) : null), [data]);

  if (state.kind === 'notFound') return <NotFoundPage />;

  const name = data ? stateName(data.to.state) || stateName(data.from.state) : '';
  const base = `/groups/${group.id}/contacts/${contactId}`;
  const sides: { version: Version; title: string }[] = data
    ? [
        { version: data.from, title: t('history.compare.from') },
        { version: data.to, title: t('history.compare.to') },
      ]
    : [];

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[56rem] flex-col gap-5 px-4 py-6"
    >
      <Link
        to={`${base}/history`}
        className={`inline-flex items-center gap-1 self-start ${backLink}`}
      >
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {t('history.compare.back')}
      </Link>
      <h2 id={headingId} className="text-xl font-bold break-words">
        {t('history.compare.heading')}
        {name && <span className="block text-base font-normal text-muted-foreground">{name}</span>}
      </h2>

      {invalid && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('history.compare.invalid')}</span>
        </div>
      )}
      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('history.compare.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('history.compare.retry')}
            </button>
          </span>
        </div>
      )}
      {state.kind === 'loading' && !missing && showLoader && (
        <LoadingState label={t('history.compare.loading')} />
      )}

      {data && rows && (
        <>
          <ul aria-label={t('history.compare.versions')} className="grid gap-3 sm:grid-cols-2">
            {sides.map(({ version, title }) => (
              <li
                key={title}
                className={`${card} flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5`}
              >
                <span>
                  <span className="font-bold text-muted-foreground">{title}: </span>
                  {versionLabel(version.ref, version.createdAt)}
                </span>
                {canRestore && version.ref !== CURRENT && (
                  <button
                    type="button"
                    className={secondaryButton}
                    aria-label={`${t('history.restore.button')}: ${versionLabel(version.ref, version.createdAt)}`}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setRestoring(version.ref);
                    }}
                  >
                    {t('history.restore.button')}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {rows.changed.length === 0 && <p role="status">{t('history.compare.noDifferences')}</p>}
          {rows.changed.length > 0 && (
            <div className={`${card} overflow-hidden`}>
              <DiffTable rows={rows.changed} caption={t('history.compare.caption', { name })} />
            </div>
          )}
          {rows.unchanged.length > 0 && (
            <>
              <button
                type="button"
                className={`${softButton} self-start`}
                aria-expanded={showUnchanged}
                aria-controls={unchangedId}
                onClick={() => setShowUnchanged((value) => !value)}
              >
                {showUnchanged
                  ? t('history.compare.hideUnchanged')
                  : t('history.compare.showUnchanged')}
              </button>
              {showUnchanged && (
                <div id={unchangedId}>
                  <DiffTable
                    rows={rows.unchanged}
                    caption={t('history.compare.captionUnchanged', { name })}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      <RestoreDialog
        contactId={contactId}
        contactName={name || null}
        from={restoring}
        returnFocus={opener}
        onClose={() => setRestoring(null)}
        onRestored={() => {
          opener.current = null;
          setRestoring(null);
          void navigate(`${base}/history`);
        }}
      />
    </section>
  );
}
