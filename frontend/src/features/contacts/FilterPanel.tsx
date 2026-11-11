import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  errorAlert,
  fieldError,
  primaryButton,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import {
  type Condition,
  type FieldRef,
  fieldLabel,
  isSameField,
  MAX_CONDITIONS,
  PREDEFINED_FIELDS,
} from './contactQuery';
import type { ContactFilterOptions } from './types';

/** Največ neizbranih značk, prikazanih hkrati (D-67): skupina ima lahko tisoče značk. */
export const MAX_VISIBLE_TAGS = 100;

export type FilterOptionsState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; options: ContactFilterOptions };

/** Vrstica osnutka: pogoj, ki ima lahko še prazno vrednost (ne pošlje se). */
type Row = Condition;

interface Draft {
  rows: Row[];
  tags: string[];
}

const EMPTY_ROW: Row = { field: 'firstName', value: '' };

/** Vrednost možnosti v izbirah polj: predefinirano ime ali `x.‹ključ›` (brez ubežanja – ni del naslova). */
export function fieldOptionValue(field: FieldRef): string {
  return typeof field === 'string' ? field : `x.${field.attribute}`;
}

export function fieldFromOptionValue(value: string): FieldRef {
  return value.startsWith('x.') ? { attribute: value.slice(2) } : (value as FieldRef);
}

/** Polje v obliki iz možnosti skupine, če ključ obstaja (ne glede na velikost črk), sicer nespremenjeno. */
function canonical(field: FieldRef, keys: string[]): FieldRef {
  if (typeof field === 'string') return field;
  const known = keys.find((key) => isSameField({ attribute: key }, field));
  return known === undefined ? field : { attribute: known };
}

/** Besedilo za iskanje značk: brez razlike velikosti črk in strešic (kot `search_fold` na strežniku). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o');
}

/**
 * Izbira polja za pogoje in razvrščanje: predefinirana polja in ključi skupine; ključ iz naslova, ki ga skupina nima
 * (več), je dodatna izbira (M1).
 */
export function FieldOptions({
  predefined = PREDEFINED_FIELDS,
  keys,
  current,
  labelOf,
}: {
  predefined?: readonly FieldRef[];
  keys: string[];
  current: FieldRef;
  labelOf: (field: FieldRef) => string;
}) {
  const extra =
    typeof current !== 'string' && !keys.some((key) => isSameField({ attribute: key }, current));
  const fields: FieldRef[] = [
    ...predefined,
    ...keys.map((key) => ({ attribute: key })),
    ...(extra ? [current] : []),
  ];
  return (
    <>
      {fields.map((field) => (
        <option key={fieldOptionValue(field)} value={fieldOptionValue(field)}>
          {labelOf(field)}
        </option>
      ))}
    </>
  );
}

/**
 * Razkrivni panel filtrov (FR-008-03 … FR-008-06; ne modalen): osnutek pogojev in značk, ki se uveljavi šele z
 * *Uporabi filtre*. Osnutek se ob odprtju prebere iz naslova in se ponovno prebere, ko se uporabljeni filtri spremenijo
 * od zunaj (oznake, *Nazaj*). Značke: izbrane so vedno na vrhu, neizbranih je prikazanih največ 100, iskalno polje
 * zoži seznam (D-67).
 */
export function FilterPanel({
  id,
  state,
  conditions,
  tags,
  onApply,
  onClear,
  onRetry,
}: {
  id: string;
  state: FilterOptionsState;
  conditions: Condition[];
  tags: string[];
  onApply: (conditions: Condition[], tags: string[]) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const addButton = useRef<HTMLButtonElement>(null);
  const focusRow = useRef<number | null>(null);
  const focusTag = useRef<string | null>(null);
  const tagList = useRef<HTMLUListElement>(null);
  const limitId = useId();
  const tagsStatusId = useId();

  const fromApplied = (): Draft => ({
    rows: conditions.length > 0 ? conditions : [EMPTY_ROW],
    tags,
  });
  const [draft, setDraft] = useState<Draft>(fromApplied);
  const [limitHit, setLimitHit] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  // Uporabljeni filtri so se spremenili od zunaj: osnutek se prebere ponovno (med izrisom, ne v učinku).
  const appliedKey = JSON.stringify([conditions, tags]);
  const [seenKey, setSeenKey] = useState(appliedKey);
  if (appliedKey !== seenKey) {
    setSeenKey(appliedKey);
    setDraft(fromApplied());
    setLimitHit(false);
  }

  const options = state.status === 'ready' ? state.options : null;
  const keys = useMemo(() => options?.keys ?? [], [options]);
  const folded = useMemo(
    () => (options?.tags ?? []).map((tag) => ({ tag, folded: fold(tag) })),
    [options],
  );

  const selectedKeys = new Set(draft.tags.map((tag) => tag.toLowerCase()));
  const needle = fold(tagSearch.trim());
  const matching = folded
    .filter((entry) => !selectedKeys.has(entry.tag.toLowerCase()) && entry.folded.includes(needle))
    .map((entry) => entry.tag);
  const visible = matching.slice(0, MAX_VISIBLE_TAGS);
  const shown = draft.tags.length + visible.length;
  const total = draft.tags.length + matching.length;

  const setRow = (index: number, change: Partial<Row>) =>
    setDraft({
      ...draft,
      rows: draft.rows.map((row, at) => (at === index ? { ...row, ...change } : row)),
    });

  const addRow = () => {
    if (draft.rows.length >= MAX_CONDITIONS) {
      setLimitHit(true);
      return;
    }
    focusRow.current = draft.rows.length;
    setDraft({ ...draft, rows: [...draft.rows, EMPTY_ROW] });
  };

  const removeRow = (index: number) => {
    setLimitHit(false);
    setDraft({ ...draft, rows: draft.rows.filter((_, at) => at !== index) });
    addButton.current?.focus();
  };

  const toggleTag = (tag: string, checked: boolean) => {
    focusTag.current = tag;
    setDraft({
      ...draft,
      tags: checked
        ? [...draft.tags, tag]
        : draft.tags.filter((selected) => selected.toLowerCase() !== tag.toLowerCase()),
    });
  };

  const apply = () =>
    onApply(
      draft.rows
        .filter((row) => row.value.trim() !== '')
        .map((row) => ({ field: row.field, value: row.value.trim() })),
      draft.tags,
    );

  const clear = () => {
    setDraft({ rows: [EMPTY_ROW], tags: [] });
    setLimitHit(false);
    onClear();
  };

  // Izbrana značka se premakne na vrh seznama: fokus ostane na njenem polju (tipkovnica, bralnik zaslona).
  useEffect(() => {
    const tag = focusTag.current;
    if (tag === null) return;
    focusTag.current = null;
    const boxes = tagList.current?.querySelectorAll<HTMLInputElement>('input[data-tag]') ?? [];
    Array.from(boxes)
      .find((box) => box.dataset.tag === tag.toLowerCase())
      ?.focus();
  });

  return (
    <div
      id={id}
      role="group"
      aria-label={t('contacts.filters.panel')}
      className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3">
        {draft.rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('contacts.filters.attribute', { n: index + 1 })}
              value={fieldOptionValue(canonical(row.field, keys))}
              onChange={(event) =>
                setRow(index, { field: fieldFromOptionValue(event.target.value) })
              }
              ref={(element) => {
                if (element && focusRow.current === index) {
                  focusRow.current = null;
                  element.focus();
                }
              }}
              className={`${textInput} h-11 w-auto max-w-full`}
            >
              <FieldOptions
                keys={keys}
                current={canonical(row.field, keys)}
                labelOf={(field) => fieldLabel(field, t)}
              />
            </select>
            <input
              type="text"
              aria-label={t('contacts.filters.value', { n: index + 1 })}
              value={row.value}
              onChange={(event) => setRow(index, { value: event.target.value })}
              className={`${textInput} h-11 min-w-0 flex-1`}
            />
            <button
              type="button"
              aria-label={t('contacts.filters.removeCondition', { n: index + 1 })}
              className={`${secondaryButton} px-2`}
              onClick={() => removeRow(index)}
            >
              <IconTrash aria-hidden="true" size={20} stroke={1.75} />
            </button>
          </div>
        ))}
        <div className="flex flex-col items-start gap-1">
          <button
            ref={addButton}
            type="button"
            aria-describedby={limitHit ? limitId : undefined}
            className={secondaryButton}
            onClick={addRow}
          >
            <IconPlus aria-hidden="true" size={20} stroke={1.75} />
            {t('contacts.filters.addCondition')}
          </button>
          {limitHit && (
            <p id={limitId} className={fieldError}>
              {t('contacts.filters.tooManyConditions')}
            </p>
          )}
        </div>
      </div>

      {state.status === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('contacts.filters.optionsFailed')}
            <button type="button" className={secondaryButton} onClick={onRetry}>
              {t('contacts.search.retry')}
            </button>
          </span>
        </div>
      )}

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 font-bold">{t('contacts.filters.tags')}</legend>
        {options && options.tags.length === 0 && <p>{t('contacts.filters.noTags')}</p>}
        {options && options.tags.length > 0 && (
          <input
            type="search"
            aria-label={t('contacts.filters.findTag')}
            aria-describedby={tagsStatusId}
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
            className={`${textInput} h-11`}
          />
        )}
        {options && options.tags.length > 0 && (
          <p id={tagsStatusId} role="status" className="text-muted-foreground">
            {t('contacts.filters.tagsShown', { shown, total })}
            {matching.length > MAX_VISIBLE_TAGS && ` ${t('contacts.filters.tagsNarrow')}`}
          </p>
        )}
        <ul ref={tagList} className="flex flex-col">
          {[...draft.tags, ...visible].map((tag) => (
            <li key={tag.toLowerCase()}>
              <label className="flex min-h-11 items-center gap-2 break-all">
                <input
                  type="checkbox"
                  checked={selectedKeys.has(tag.toLowerCase())}
                  onChange={(event) => toggleTag(tag, event.target.checked)}
                  data-tag={tag.toLowerCase()}
                  className="size-5 shrink-0 accent-primary"
                />
                {tag}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} onClick={apply}>
          {t('contacts.filters.apply')}
        </button>
        <button type="button" className={secondaryButton} onClick={clear}>
          {t('contacts.filters.clear')}
        </button>
      </div>
    </div>
  );
}
