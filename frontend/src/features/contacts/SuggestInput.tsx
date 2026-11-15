import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { textInput } from '../../shared/ui/styles';
import { useCanonical, useSuggestions } from './api';
import { ComboListbox, comboOptionId } from './ComboListbox';
import type { SuggestionType } from './types';

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onSelect' | 'role' | 'type'
>;

/**
 * Splošno kombinirano polje s predlogi skupine po ARIA 1.2 (design.md 8.3, 8.4, research R-08; FR-013-09 … FR-013-18):
 * predlogi ob fokusu (prazen vpis) in ob vpisu, zamik 150 ms, prejšnji zahtevek preklican, napaka predlogov tiha (polje
 * deluje kot navadno), puščici + *Enter* + *Esc*, število predlogov sporočeno bralniku zaslona. Vpis ni omejen na
 * predloge. Oznako in napako polja izriše klicatelj (`id`, `aria-*`).
 */
export function SuggestInput({
  value,
  onChange,
  type,
  keyParam,
  exclude,
  showCount = false,
  listLabel,
  canonical,
  onSelect,
  onEnter,
  onBlur,
  onKeyDown,
  className,
  ...rest
}: InputProps & {
  value: string;
  onChange: (text: string) => void;
  type: SuggestionType;
  /** `type=value`: ključ atributa; brez njega (prazen) predlogov ni. */
  keyParam?: string;
  /** Predlog, ki se ne ponudi (že uporabljen ključ, že dodana značka …). */
  exclude?: (text: string) => boolean;
  /** Ob predlogu prikaži število kontaktov. */
  showCount?: boolean;
  /** Dostopno ime seznama predlogov. */
  listLabel: string;
  /** Ob zapustitvi polja zamenjaj vpis z zapisom iste normalizirane oblike, ki ga skupina že uporablja. */
  canonical?: 'key' | 'tag';
  /** Uporabnik je izbral predlog (miška ali *Enter*); vpis je že posodobljen. */
  onSelect?: (text: string) => void;
  /** *Enter* brez izbranega predloga; če je podan, *Enter* ne odda obrazca. */
  onEnter?: (text: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const canonicalOf = useCanonical(canonical ?? 'key');
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  const query = value.trim();
  const { items, loaded } = useSuggestions({ type, q: query, key: keyParam?.trim() }, focused);
  const options = items
    .filter((item) => !exclude?.(item.text))
    .map((item) => ({
      value: item.text,
      label: item.text,
      count: showCount ? item.count : undefined,
    }));
  const open = focused && !dismissed && options.length > 0;
  const activeIndex = open && active < options.length ? active : -1;

  const pick = (text: string) => {
    onChange(text);
    setActive(-1);
    setDismissed(true);
    onSelect?.(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      if (!open) {
        setDismissed(false);
        setActive(0);
      } else setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setDismissed(true);
      setActive(-1);
    } else if (event.key === 'Enter') {
      const chosen = activeIndex >= 0 ? options[activeIndex] : undefined;
      if (chosen) {
        event.preventDefault();
        pick(chosen.value);
      } else if (onEnter) {
        event.preventDefault();
        onEnter(value);
      }
    }
  };

  const announcement = !focused
    ? ''
    : options.length > 0
      ? t('suggest.count', { total: options.length })
      : loaded && query !== ''
        ? t('suggest.none')
        : '';

  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        {...rest}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? comboOptionId(listId, activeIndex) : undefined}
        value={value}
        onChange={(event) => {
          setDismissed(false);
          setActive(-1);
          onChange(event.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setFocused(false);
          setActive(-1);
          const text = value;
          if (canonical && text.trim() !== '') {
            void canonicalOf(text).then((found) => {
              if (found !== null && found !== text.trim() && latest.current === text)
                onChange(found);
            });
          }
          onBlur?.();
        }}
        className={className ?? textInput}
      />
      {open && (
        <ComboListbox
          id={listId}
          label={listLabel}
          options={options}
          active={activeIndex}
          onPick={(option) => pick(option.value)}
        />
      )}
      {focused && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}
    </div>
  );
}
