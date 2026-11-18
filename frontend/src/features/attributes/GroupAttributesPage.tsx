import { LoadingState } from '../../shared/ui/Skeleton';
import { EmptyState } from '../../shared/ui/EmptyState';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, secondaryButton, softButton, textInput } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useAttributesApi } from './api';
import { ChangeTypeDialog } from './ChangeTypeDialog';
import { typeNameKey } from './typeNames';
import type { AttributeKey, AttributeKeyPage, AttributeKeyPageSize } from './types';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: AttributeKeyPage };

const SEARCH_DELAY_MS = 300;

/**
 * Razdelek *Atributi skupine* (plan.md 016; FR-016-05, FR-016-27): ključi dodatnih atributov s tipom in številom
 * kontaktov, iskanje in paginacija; *Spremeni tip* samo za urejevalca v nearhivirani skupini (bralec seznam vidi).
 */
export function GroupAttributesPage() {
  const { t } = useTranslation();
  const api = useAttributesApi();
  const { group } = useGroup();
  const headingId = useId();
  const searchId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<AttributeKeyPageSize>(25);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [changing, setChanging] = useState<AttributeKey | null>(null);
  const showLoader = useDelayed(state.kind === 'loading');
  const canChange = group.role !== 'VIEWER' && !group.archived;
  useDocumentTitle(t('title.groupScreen', { screen: t('attributes.heading'), group: group.title }));

  // Iskanje se sproži po kratkem premoru vpisa; nov iskalni niz vrne na prvo stran.
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === q) return undefined;
    const timer = setTimeout(() => {
      setQ(trimmed);
      setPage(0);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input, q]);

  useEffect(() => {
    const controller = new AbortController();
    api.listKeys(group.id, { q, page, size }, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (page >= pages) setPage(pages - 1);
        else setState({ kind: 'ready', data });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: 'failed' });
      },
    );
    return () => controller.abort();
  }, [api, group.id, q, page, size, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const data = state.kind === 'ready' ? state.data : null;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 py-6"
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('attributes.heading')}
      </h2>
      <p className="text-muted-foreground">{t('attributes.description')}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor={searchId} className="text-sm font-bold">
          {t('attributes.list.search')}
        </label>
        <input
          id={searchId}
          type="search"
          autoComplete="off"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={50}
          className={textInput}
        />
      </div>

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('attributes.list.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                reload();
              }}
            >
              {t('attributes.list.retry')}
            </button>
          </span>
        </div>
      )}

      {state.kind === 'loading' && showLoader && (
        <LoadingState label={t('attributes.list.loading')} />
      )}

      {data && data.total === 0 && (
        <div role="status">
          <EmptyState
            headingLevel={3}
            title={q === '' ? t('attributes.list.empty') : t('attributes.list.noResults')}
          />
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <p role="status">{t('attributes.list.total', { total: data.total })}</p>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted text-sm text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('attributes.list.key')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('attributes.list.type')}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t('attributes.list.count')}
                  </th>
                  {canChange && (
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">{t('attributes.list.changeType')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.key} className="border-b border-border">
                    <th scope="row" className="px-4 py-3 font-mono font-normal break-words">
                      {item.key}
                    </th>
                    <td className="px-4 py-3">{t(typeNameKey(item.type))}</td>
                    <td className="px-4 py-3">{item.contactCount}</td>
                    {canChange && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className={softButton}
                          aria-label={t('attributes.list.changeTypeFor', { key: item.key })}
                          onClick={() => setChanging(item)}
                        >
                          {t('attributes.list.changeType')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionPagination
            label={t('attributes.heading')}
            page={data.page}
            size={data.size}
            total={data.total}
            disabled={state.kind !== 'ready'}
            onPage={setPage}
            onSize={(next) => {
              setSize(next as AttributeKeyPageSize);
              setPage(0);
            }}
          />
        </>
      )}

      <ChangeTypeDialog
        groupId={group.id}
        item={changing}
        onClose={() => {
          setChanging(null);
          heading.current?.focus();
        }}
        onChanged={reload}
      />
    </section>
  );
}
