import { type InputHTMLAttributes, type KeyboardEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { textInput } from '../../shared/ui/styles';
import { useSuggestions } from './api';
import { ComboListbox, comboOptionId } from './ComboListbox';
import { type CountryOption, countryName, searchCountries } from './countries';
import { useUiLanguage } from './useUiLanguage';

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'role' | 'type' | 'onBlur'
>;

/**
 * Izbirno kombinirano polje za državo po ARIA 1.2 BREZ prostega besedila (FR-013-13, FR-013-12, FR-013-17): shrani se
 * koda ISO 3166-1 alpha-2, v polju je ime države v jeziku vmesnika. Seznam ima najprej države, ki jih skupina
 * najpogosteje uporablja (`type=country`), nato ostale po abecedi; iskanje po imenu in kodi. Če klic predlogov
 * odpove, seznam še vedno deluje (statični seznam). Prazno polje izbere »brez države« (`''`).
 */
export function CountryField({
  value,
  onChange,
  listLabel,
  onBlur,
  className,
  ...rest
}: InputProps & {
  /** Koda države ali prazen niz. */
  value: string;
  onChange: (code: string) => void;
  /** Dostopno ime seznama držav. */
  listLabel: string;
  onBlur?: () => void;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const { items } = useSuggestions({ type: 'country' }, focused);

  const shown = text ?? (value ? countryName(value, language) : '');
  const query = text ?? '';
  const popular = new Map(items.map((item, index) => [item.text, index]));
  const found = searchCountries(query, language);
  // Prazen vpis: najpogostejše države skupine na vrhu, nato abecedno; pri vpisu velja razvrstitev zadetkov.
  const ordered: CountryOption[] =
    query.trim() === ''
      ? [
          ...found
            .filter((option) => popular.has(option.code))
            .sort((a, b) => (popular.get(a.code) ?? 0) - (popular.get(b.code) ?? 0)),
          ...found.filter((option) => !popular.has(option.code)),
        ]
      : found;
  const options = ordered.map((option) => ({ value: option.code, label: option.name }));
  const open = focused && !dismissed && options.length > 0;
  // Pri vpisu je prvi zadetek privzeto aktiven.
  const activeIndex = open
    ? active >= 0 && active < options.length
      ? active
      : query.trim()
        ? 0
        : -1
    : -1;

  const choose = (code: string) => {
    onChange(code);
    setText(null);
    setActive(-1);
    setDismissed(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault();
      if (!open) {
        setDismissed(false);
        setActive(0);
      } else setActive((activeIndex + 1) % options.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive(activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setDismissed(true);
      setActive(-1);
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]!.value);
    }
  };

  const announcement = focused
    ? options.length > 0
      ? t('suggest.count', { total: options.length })
      : t('suggest.none')
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
        value={shown}
        onChange={(event) => {
          setText(event.target.value);
          setDismissed(false);
          setActive(-1);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setFocused(false);
          setActive(-1);
          // Brez prostega besedila: prazen vpis počisti državo, sicer ostane prejšnja izbira.
          if (text !== null && text.trim() === '') onChange('');
          setText(null);
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
          onPick={(option) => choose(option.value)}
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
