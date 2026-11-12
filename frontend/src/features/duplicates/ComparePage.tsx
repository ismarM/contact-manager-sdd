import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import {
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  warningAlert,
} from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { classifyMergeError, useDuplicatesApi, type MergeFailure } from './api';
import { CompareColumns, contactName } from './CompareColumns';
import { CompareField } from './CompareField';
import { CompareTags } from './CompareTags';
import { Disclosure } from './Disclosure';
import { compareSearch, duplicatesSearch, readCompareView } from './duplicateRouting';
import { DuplicatesUnavailable } from './DuplicatesUnavailable';
import { MergeDialog } from './MergeDialog';
import { MergePreview } from './MergePreview';
import {
  buildResult,
  buildRows,
  canExclude,
  defaultChoices,
  excludeContact,
  MAX_ATTRIBUTES,
  MAX_TAGS,
  toggleTag,
  validateResult,
  type MergeSelection,
  type ResultError,
} from './mergeModel';
import type { Comparison, CompareContact } from './types';

type Status = 'loading' | 'ready' | 'failed' | 'notFound';
type Message = Exclude<MergeFailure, { kind: 'validation' }>['kind'];

const MESSAGE_KEY = {
  conflict: 'duplicates.compare.conflict',
  forbidden: 'duplicates.compare.forbidden',
  archived: 'duplicates.compare.archived',
  failed: 'duplicates.compare.mergeFailed',
  offline: 'duplicates.compare.offline',
} as const satisfies Record<Message, string>;

/** Napake strežnika `result.*` preslikane na vrstice tabele; neznano polje ni napaka vrstice. */
function rowErrors(fields: { field: string; code: string }[]): ResultError[] | null {
  const errors: ResultError[] = [];
  for (const { field, code } of fields) {
    if ((field === 'result.firstName' || field === 'result.lastName') && code === 'REQUIRED') {
      errors.push({ field: 'firstName', code: 'REQUIRED' });
    } else if (field === 'result.tags' && code === 'TOO_MANY') {
      errors.push({ field: 'tags', code: 'TOO_MANY' });
    } else if (field === 'result.attributes' && code === 'TOO_MANY') {
      errors.push({ field: 'attributes', code: 'TOO_MANY' });
    } else {
      return null;
    }
  }
  return errors;
}

/**
 * Stran primerjave in združitve (plan.md 011 – Pages and routes; FR-011-08 … FR-011-18): stolpci kontaktov, vrstice z
 * izbiro vrednosti, značke, predogled, izločitev, potrditev in izidi. Bralec in arhivirana skupina dobita razlago.
 */
export function ComparePage() {
  const { t } = useTranslation();
  const { group, reload } = useGroup();
  const api = useDuplicatesApi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = readCompareView(params);
  const [initial] = useState(() => readCompareView(params));
  const [status, setStatus] = useState<Status>('loading');
  const [contacts, setContacts] = useState<CompareContact[]>([]);
  const [selection, setSelection] = useState<MergeSelection>({ values: {}, tags: [] });
  const [message, setMessage] = useState<Message | null>(null);
  const [errors, setErrors] = useState<ResultError[]>([]);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);
  const prefix = useId();
  const headingId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const latest = useRef<(comparison: Comparison) => void>(() => undefined);
  const showLoader = useDelayed(status === 'loading');
  const canUse = !group.archived && group.role !== 'VIEWER';
  useDocumentTitle(
    t('title.groupScreen', { screen: t('duplicates.compare.heading'), group: group.title }),
  );

  const base = `/groups/${group.id}/duplicates`;
  const resultsSearch = view.category ? duplicatesSearch(view.category, view.page, view.size) : '';

  const rows = useMemo(() => buildRows(contacts), [contacts]);
  const result = useMemo(() => buildResult(contacts, selection), [contacts, selection]);

  const gone = () =>
    void navigate(
      { pathname: base, search: resultsSearch },
      { replace: true, state: { gone: true } },
    );

  const apply = (comparison: Comparison) => {
    const list = comparison.contacts;
    if (list.length < 2) {
      gone();
      return;
    }
    setContacts(list);
    setSelection(defaultChoices(list));
    setErrors([]);
    setStatus('ready');
    const ids = list.map((contact) => contact.id);
    if (ids.join(',') !== view.ids.join(',')) {
      setParams(compareSearch(view, ids, view.total), { replace: true });
    }
  };
  useEffect(() => {
    latest.current = apply;
  });

  const initialIds = initial.ids.join(',');
  useEffect(() => {
    if (!canUse) return undefined;
    if (initialIds.split(',').filter((id) => id !== '').length < 2) {
      latest.current({ contacts: [] });
      return undefined;
    }
    let active = true;
    api.compareContacts(group.id, initialIds.split(',')).then(
      (comparison) => {
        if (active) latest.current(comparison);
      },
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) setStatus('notFound');
        else {
          setStatus('failed');
          if (error instanceof ApiError && error.status === 403) {
            setMessage('forbidden');
            void reload();
          }
        }
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, canUse, initialIds, reloads, reload]);

  useEffect(() => {
    // Ob novih napakah ob vrsticah fokus na prvo (fieldset ali opozorilo; design.md 8.12).
    const first = errors[0];
    if (!first) return;
    const target =
      first.field === 'tags'
        ? `${prefix}-tags`
        : first.field === 'attributes'
          ? `${prefix}-attributes`
          : `${prefix}-row-firstName`;
    document.getElementById(target)?.focus();
  }, [errors, prefix]);

  const alert = message && (
    <div role="alert" className={message === 'conflict' ? warningAlert : errorAlert}>
      <p className="flex gap-2">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span className="flex flex-wrap items-center gap-3">
          {t(MESSAGE_KEY[message])}
          {(message === 'failed' || message === 'offline') && (
            <button type="button" className={secondaryButton} onClick={() => void submit()}>
              {t('duplicates.retry')}
            </button>
          )}
        </span>
      </p>
    </div>
  );

  if (!canUse) {
    return (
      <>
        <DuplicatesUnavailable group={group} />
        {alert && <div className="mx-auto w-full max-w-[70ch] px-4">{alert}</div>}
      </>
    );
  }
  if (status === 'notFound') return <NotFoundPage />;

  function fail(failure: MergeFailure) {
    if (failure.kind === 'validation') {
      const mapped = rowErrors(failure.fields);
      if (mapped) {
        setErrors(mapped);
        return;
      }
      setMessage('failed');
      return;
    }
    setMessage(failure.kind);
    if (failure.kind === 'forbidden' || failure.kind === 'archived') void reload();
    if (failure.kind === 'conflict') {
      api
        .compareContacts(
          group.id,
          contacts.map((contact) => contact.id),
        )
        .then(
          (comparison) => apply(comparison),
          () => setMessage('failed'),
        );
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setErrors([]);
    try {
      const response = await api.mergeContacts(group.id, {
        contacts: contacts.map((contact) => ({ id: contact.id, version: contact.version })),
        result,
      });
      toast(
        t('duplicates.toast.merged', {
          count: response.mergedCount,
          name: response.keptDisplayName,
        }),
        {
          description: (
            <Link to={`/groups/${group.id}/audit`} className={`font-bold underline ${focusRing}`}>
              {t('duplicates.toast.openAudit')}
            </Link>
          ),
        },
      );
      setDialog(false);
      void navigate({ pathname: base, search: resultsSearch }, { replace: true });
    } catch (error) {
      setDialog(false);
      fail(classifyMergeError(error));
    } finally {
      setBusy(false);
    }
  }

  const merge = () => {
    setMessage(null);
    const found = validateResult(result).map((error) => ({
      ...error,
      excess:
        error.field === 'tags'
          ? result.tags.length - MAX_TAGS
          : error.field === 'attributes'
            ? result.attributes.length - MAX_ATTRIBUTES
            : undefined,
    }));
    setErrors(found);
    if (found.length === 0) setDialog(true);
  };

  const exclude = (id: string) => {
    const next = excludeContact(contacts, selection, id);
    setContacts(next.contacts);
    setSelection(next.selection);
    setParams(
      compareSearch(
        view,
        next.contacts.map((contact) => contact.id),
        view.total,
      ),
      { replace: true },
    );
  };

  const errorText = (field: ResultError['field']) => {
    const error = errors.find((candidate) => candidate.field === field);
    if (!error) return undefined;
    const count = Math.max(1, error.excess ?? 1);
    if (field === 'tags') return t('duplicates.compare.errors.tooManyTags', { count });
    if (field === 'attributes') return t('duplicates.compare.errors.tooManyAttributes', { count });
    return t('duplicates.compare.errors.nameRequired');
  };
  const nameError = errorText('firstName') ?? errorText('lastName');
  const attributesError = errorText('attributes');
  const rowId = (key: string) => `${prefix}-row-${key}`;
  const renderRow = (row: (typeof rows.rows)[number], readOnly: boolean) => (
    <CompareField
      key={row.key}
      id={rowId(row.key)}
      row={row}
      contacts={contacts}
      value={selection.values[row.key] ?? null}
      readOnly={readOnly}
      error={row.key === 'firstName' ? nameError : undefined}
      onChange={(value) =>
        setSelection({ ...selection, values: { ...selection.values, [row.key]: value } })
      }
    />
  );
  const identicalHasError = rows.identical.some((row) => row.key === 'firstName') && !!nameError;

  return (
    <section
      aria-labelledby={status === 'loading' ? undefined : headingId}
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6"
    >
      {status !== 'loading' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={headingId} className="text-xl font-bold">
            {t('duplicates.compare.heading')}
          </h2>
          <Link
            to={{ pathname: base, search: resultsSearch }}
            className={`font-bold underline ${focusRing}`}
          >
            {t('duplicates.compare.back')}
          </Link>
        </div>
      )}

      {status === 'loading' && showLoader && <p role="status">{t('duplicates.loading')}</p>}
      {status === 'failed' && !message && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('duplicates.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setStatus('loading');
                setReloads((n) => n + 1);
              }}
            >
              {t('duplicates.retry')}
            </button>
          </span>
        </div>
      )}
      {alert}

      {status === 'ready' && (
        <>
          {view.total > 10 && (
            <p role="status">{t('duplicates.compare.showing', { total: view.total })}</p>
          )}
          <div className="flex min-w-0 flex-col gap-3 overflow-x-auto">
            <CompareColumns
              contacts={contacts}
              canExclude={canExclude(contacts)}
              onExclude={exclude}
            />
            {rows.rows.map((row) => renderRow(row, false))}
            {rows.identical.length > 0 && (
              <Disclosure
                label={t('duplicates.compare.identical', { count: rows.identical.length })}
                forceOpen={identicalHasError}
              >
                <div className="flex flex-col gap-3">
                  {rows.identical.map((row) => renderRow(row, true))}
                </div>
              </Disclosure>
            )}
            {rows.tags.length > 0 && (
              <CompareTags
                id={`${prefix}-tags`}
                tags={rows.tags}
                checked={selection.tags}
                error={errorText('tags')}
                onToggle={(tag) => setSelection(toggleTag(selection, tag))}
              />
            )}
          </div>
          {attributesError && (
            <div
              id={`${prefix}-attributes`}
              role="alert"
              tabIndex={-1}
              className={`${errorAlert} outline-none`}
            >
              <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
              <span>{attributesError}</span>
            </div>
          )}
          <MergePreview result={result} />
          <div>
            <button ref={trigger} type="button" className={primaryButton} onClick={merge}>
              {t('duplicates.compare.merge')}
            </button>
          </div>
          {dialog && (
            <MergeDialog
              count={contacts.length}
              name={contactName(result)}
              busy={busy}
              returnFocus={trigger}
              onCancel={() => setDialog(false)}
              onConfirm={() => void submit()}
            />
          )}
        </>
      )}
    </section>
  );
}
