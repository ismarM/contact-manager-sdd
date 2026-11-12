import { IconX } from '@tabler/icons-react';
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError, focusRing, textInput } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useContactsApi } from './api';
import { type ErrorKey, normalizeKey, tagError } from './validation';

const DEBOUNCE_MS = 150;

/**
 * Kombinirano polje za značke po ARIA 1.2 (design.md 8.4, research R-10; FR-004-02, FR-004-04): predlogi samo iz te
 * skupine (`GET …/tags?q=`, zamik 150 ms, prejšnji zahtevek preklican), *Enter* ali vejica doda vpisano značko, *Enter*
 * z izbranim predlogom doda predlog, *Backspace* v praznem polju značk ne briše. Napaka se pokaže ob polju.
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
  const api = useContactsApi();
  const { group } = useGroup();
  const inputId = useId();
  const listId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<ErrorKey | null>(null);
  const query = text.trim();
  const shownError = error ?? serverError ?? null;

  useEffect(() => {
    if (!query) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.suggestTags(group.id, query, controller.signal).then(
        (result) => {
          setSuggestions(result.tags);
          setActive(-1);
        },
        () => undefined,
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, group.id, query]);

  const options = query
    ? suggestions.filter(
        (tag) => !tags.some((existing) => normalizeKey(existing) === normalizeKey(tag)),
      )
    : [];
  const open = options.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  const add = (value: string) => {
    const tag = value.trim();
    if (!tag) return;
    const problem = tagError(tag, tags);
    if (problem) {
      setError(problem);
      return;
    }
    onChange([...tags, tag]);
    setText('');
    setSuggestions([]);
    setActive(-1);
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setSuggestions([]);
      setActive(-1);
    } else if (event.key === 'Enter') {
      // Enter v polju za značke nikoli ne odda obrazca.
      event.preventDefault();
      const chosen = open && active >= 0 ? options[active] : undefined;
      add(chosen ?? text);
    } else if (event.key === ',') {
      event.preventDefault();
      add(text);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="font-bold">
        {label ?? t('contacts.form.addTag')}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={shownError !== null}
          aria-describedby={shownError ? errorId : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
            if (!event.target.value.trim()) setSuggestions([]);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setSuggestions([]);
            setActive(-1);
          }}
          className={textInput}
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label ?? t('contacts.form.addTag')}
            className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-float"
          >
            {options.map((tag, index) => (
              <li
                key={tag}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(tag)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') add(tag);
                }}
                className="cursor-pointer rounded-sm px-2 py-2 hover:bg-muted aria-selected:bg-selected"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
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
