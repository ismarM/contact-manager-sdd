import { IconX } from '@tabler/icons-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError, focusRing } from '../../shared/ui/styles';
import { useCanonical } from './api';
import { SuggestInput } from './SuggestInput';
import { type ErrorKey, normalizeKey, tagError } from './validation';

/**
 * Kombinirano polje za značke po ARIA 1.2 (design.md 8.4; FR-004-02, FR-004-04, FR-013-14): predlogi skupine
 * (`type=tag`, tudi ob praznem fokusu, s številom kontaktov, brez že dodanih značk) prek skupnega `SuggestInput`;
 * *Enter* ali vejica doda vpisano značko v kanoničnem zapisu skupine (FR-013-10), *Enter* z izbranim predlogom doda
 * predlog, *Backspace* v praznem polju značk ne briše. Napaka se pokaže ob polju.
 */
export function TagInput({
  tags,
  onChange,
  serverError,
  label,
  listLabel,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  serverError?: ErrorKey;
  /** Ime polja (privzeto »Dodaj značko«; množično urejanje 009: »Dodaj značke«, »Odstrani značke«). */
  label?: string;
  /** Ime seznama vnesenih značk (privzeto »Dodane značke«). */
  listLabel?: string;
}) {
  const { t } = useTranslation();
  const canonicalOf = useCanonical('tag');
  const inputId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<ErrorKey | null>(null);
  const shownError = error ?? serverError ?? null;
  const latest = useRef({ tags, text, onChange });
  useEffect(() => {
    latest.current = { tags, text, onChange };
  });

  /** Doda značko, če je veljavna (po zadnjem stanju); `submitted` je vpis, ki ga dodajanje počisti (`null` = vedno). */
  const add = (tag: string, submitted: string | null) => {
    const current = latest.current;
    const problem = tagError(tag, current.tags);
    if (problem) {
      setError(problem);
      return;
    }
    current.onChange([...current.tags, tag]);
    latest.current = { ...current, tags: [...current.tags, tag] };
    if (submitted === null || current.text === submitted) setText('');
    setError(null);
  };

  /** Vpisana značka: najprej preverjanje, nato kanonični zapis skupine (strežnik ga vseeno uveljavi). */
  const addTyped = (value: string) => {
    const tag = value.trim();
    if (!tag) return;
    const problem = tagError(tag, latest.current.tags);
    if (problem) {
      setError(problem);
      return;
    }
    void canonicalOf(tag).then((found) => add(found ?? tag, value));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ',') {
      event.preventDefault();
      addTyped(text);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-bold">
        {label ?? t('contacts.form.addTag')}
      </label>
      <SuggestInput
        id={inputId}
        type="tag"
        value={text}
        onChange={(next) => {
          setText(next);
          setError(null);
        }}
        exclude={(tag) => tags.some((existing) => normalizeKey(existing) === normalizeKey(tag))}
        showCount
        listLabel={label ?? t('contacts.form.addTag')}
        onSelect={(tag) => add(tag, null)}
        onEnter={addTyped}
        onKeyDown={onKeyDown}
        aria-invalid={shownError !== null}
        aria-describedby={shownError ? errorId : undefined}
      />
      {shownError && (
        <p id={errorId} className={fieldError}>
          {t(shownError)}
        </p>
      )}
      {tags.length > 0 && (
        <ul aria-label={listLabel ?? t('contacts.form.addedTags')} className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-sm bg-muted py-0.5 pr-1 pl-2"
            >
              {tag}
              <button
                type="button"
                aria-label={t('contacts.form.removeTag', { tag })}
                onClick={() => onChange(tags.filter((existing) => existing !== tag))}
                className={`inline-flex size-8 items-center justify-center rounded-sm hover:bg-card ${focusRing}`}
              >
                <IconX aria-hidden="true" size={16} stroke={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
