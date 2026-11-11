import { IconFilter, IconSearch, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { memo, type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, textInput } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useContactsApi } from './api';
import { type AppliedFilter, type ContactQuery, countFilters, fieldLabel } from './contactQuery';
import {
  FieldOptions,
  fieldFromOptionValue,
  fieldOptionValue,
  FilterPanel,
  type FilterOptionsState,
} from './FilterPanel';
import { FilterChips } from './FilterChips';
import type { ContactFilterOptions } from './types';
import type { UpdateOptions } from './useContactQuery';

/** Predefinirana polja v izbiri *Razvrsti*: privzeto razvrščanje (priimek) je prvo. */
const SORT_FIELDS = ['lastName', 'firstName', 'address', 'email', 'phone'] as const;

/**
 * Možnosti filtrov skupine (`GET …/contact-filters`): naložijo se enkrat ob prikazu seznama in jih uporabljata panel
 * filtrov in izbira *Razvrsti* (FR-008-06); napaka se pokaže v panelu s ponovnim poskusom (FR-008-17).
 */
export function useFilterOptions(): { state: FilterOptionsState; retry: () => void } {
  const api = useContactsApi();
  const { group } = useGroup();
  const [reloads, setReloads] = useState(0);
  const key = `${group.id}:${reloads}`;
  const [result, setResult] = useState<{
    key: string;
    options: ContactFilterOptions | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.contactFilters(group.id, controller.signal).then(
      (options) => setResult({ key, options }),
      () => {
        if (!controller.signal.aborted) setResult({ key, options: null });
      },
    );
    return () => controller.abort();
  }, [api, group.id, key]);

  const retry = useCallback(() => setReloads((n) => n + 1), []);
  const state: FilterOptionsState =
    result?.key !== key
      ? { status: 'loading' }
      : result.options
        ? { status: 'ready', options: result.options }
        : { status: 'failed' };
  return { state, retry };
}

/**
 * Orodna vrstica seznama kontaktov (FR-008-01, -07, -10 … -12; design.md 8.7, 9.3): iskalno polje, gumb *Filtri (N)*,
 * *Razvrsti* in smer, razkrivni panel, uporabljeni filtri in število zadetkov v območju »Iskanje in filtri«.
 */
export function ContactToolbar({
  query,
  update,
  searchText,
  onSearchText,
  total,
  searchRef,
  onClear,
}: {
  query: ContactQuery;
  update: (change: Partial<ContactQuery>, options?: UpdateOptions) => void;
  /** Vrednost iskalnega polja (zapis v naslov je zakasnjen, `useSearchText`). */
  searchText: string;
  onSearchText: (value: string) => void;
  /** Število zadetkov zadnjega uspešnega branja (`null`: še ni podatkov). */
  total: number | null;
  /** Iskalno polje: sem preide fokus, ko se izgine gumb, s katerim je bil sprožen *Počisti filtre*. */
  searchRef: RefObject<HTMLInputElement | null>;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const { state, retry } = useFilterOptions();
  const [open, setOpen] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const sortId = useId();
  const panelId = useId();

  // Esc zapre panel in vrne fokus na gumb *Filtri* (design.md 8.12).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !area.current?.contains(event.target as Node)) return;
      setOpen(false);
      filtersButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const keys = state.status === 'ready' ? state.options.keys : [];
  const applied: AppliedFilter[] = [
    ...query.conditions.map((condition) => ({ kind: 'condition', condition }) as const),
    ...query.tags.map((tag) => ({ kind: 'tag', tag }) as const),
  ];
  const filterCount = countFilters(query);
  const descending = query.dir === 'desc';

  const remove = (filter: AppliedFilter) =>
    filter.kind === 'tag'
      ? update({ tags: query.tags.filter((tag) => tag !== filter.tag) })
      : update({
          conditions: query.conditions.filter((condition) => condition !== filter.condition),
        });

  return (
    <div
      ref={area}
      role="search"
      aria-label={t('contacts.search.region')}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          id={searchId}
          value={searchText}
          onChange={onSearchText}
          inputRef={searchRef}
        />
        <button
          ref={filtersButton}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className={secondaryButton}
          onClick={() => setOpen(!open)}
        >
          <IconFilter aria-hidden="true" size={20} stroke={1.75} />
          {filterCount > 0
            ? t('contacts.filters.buttonCount', { count: filterCount })
            : t('contacts.filters.button')}
        </button>
        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="font-bold">
            {t('contacts.sort.label')}
          </label>
          <select
            id={sortId}
            value={fieldOptionValue(query.sort)}
            onChange={(event) => update({ sort: fieldFromOptionValue(event.target.value) })}
            className={`${textInput} h-11 w-auto max-w-48 pointer-coarse:h-12`}
          >
            <FieldOptions
              predefined={SORT_FIELDS}
              keys={keys}
              current={query.sort}
              labelOf={(field) => fieldLabel(field, t)}
            />
          </select>
          <button
            type="button"
            aria-label={t(
              descending ? 'contacts.sort.directionDesc' : 'contacts.sort.directionAsc',
            )}
            className={`${secondaryButton} px-2`}
            onClick={() => update({ dir: descending ? 'asc' : 'desc' })}
          >
            {descending ? (
              <IconSortDescending aria-hidden="true" size={20} stroke={1.75} />
            ) : (
              <IconSortAscending aria-hidden="true" size={20} stroke={1.75} />
            )}
          </button>
        </div>
      </div>

      {open && (
        <FilterPanel
          id={panelId}
          state={state}
          conditions={query.conditions}
          tags={query.tags}
          onApply={(conditions, tags) => update({ conditions, tags })}
          onClear={onClear}
          onRetry={retry}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 empty:hidden">
        <FilterChips filters={applied} onRemove={remove} fallbackFocus={filtersButton} />
        {(applied.length > 0 || query.q !== '') && (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              onClear();
              searchRef.current?.focus();
            }}
          >
            {t('contacts.search.clear')}
          </button>
        )}
      </div>

      {total !== null && <p role="status">{t('contacts.search.count', { count: total })}</p>}
    </div>
  );
}

/** Iskalno polje; izrisano ločeno, da se ob spremembah naslova in nalaganju seznama ne izrisuje znova. */
const SearchField = memo(function SearchField({
  id,
  value,
  onChange,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative min-w-48 flex-1">
      <label htmlFor={id} className="sr-only">
        {t('contacts.search.label')}
      </label>
      <IconSearch
        aria-hidden="true"
        size={20}
        stroke={1.75}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        placeholder={t('contacts.search.label')}
        onChange={(event) => onChange(event.target.value)}
        className={`${textInput} h-11 pl-10 pointer-coarse:h-12`}
      />
    </div>
  );
});
