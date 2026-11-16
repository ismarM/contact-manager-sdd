import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError, textInput } from '../../../shared/ui/styles';
import type { AddressSuggestion } from '../../attributes/types';
import { useGroup } from '../../groups/groupContext';
import { useContactsApi } from '../api';
import { ComboListbox, comboOptionId } from '../ComboListbox';
import { CountryField } from '../CountryField';
import { useUiLanguage } from '../useUiLanguage';
import {
  type AddressDraft,
  type AddressErrorKey,
  type AddressPart,
  cityBeforePostalCode,
  draftOf,
  isBlankDraft,
  usesRegion,
} from './addressDraft';

/** Zamik pred zahtevkom predlogov med tipkanjem (research R-08). */
export const ADDRESS_SUGGESTION_DELAY_MS = 300;
/** Najmanj znakov za predloge (FR-016-13). */
export const ADDRESS_SUGGESTION_MIN = 3;

/**
 * Predlogi naslova prek posrednika v zaledju (FR-016-13): po vsaj 3 znakih in 300 ms, prejšnji zahtevek preklican
 * (`AbortController`), zastareli odgovor ne prepiše novejšega; napaka je tiha (prazen seznam).
 */
function useAddressSuggestions(
  q: string,
  country: string,
  enabled: boolean,
): { items: AddressSuggestion[]; loaded: boolean } {
  const api = useContactsApi();
  const { group } = useGroup();
  const language = useUiLanguage();
  const text = q.trim();
  const id = `${group.id}|${country}|${language}|${text}`;
  const active = enabled && [...text].length >= ADDRESS_SUGGESTION_MIN;
  const [state, setState] = useState<{ id: string; items: AddressSuggestion[] } | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .addressSuggestions(
          group.id,
          { q: text, language, ...(country ? { country } : {}) },
          controller.signal,
        )
        .then(
          (result) => {
            if (!controller.signal.aborted) setState({ id, items: result.items.slice(0, 5) });
          },
          () => {
            if (!controller.signal.aborted) setState({ id, items: [] });
          },
        );
    }, ADDRESS_SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, api, group.id, text, country, language, id]);

  if (!active || state === null || state.id !== id) return { items: [], loaded: false };
  return { items: state.items, loaded: true };
}

/** Kombinirano polje dela naslova s predlogi naslova (design.md 8.4; tipkovnica kot 013 FR-013-18). */
function AddressCombo({
  id,
  value,
  country,
  onChange,
  onPick,
  onBlur,
  describedBy,
  invalid,
}: {
  id: string;
  value: string;
  country: string;
  onChange: (text: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  onBlur: () => void;
  describedBy?: string;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const { items, loaded } = useAddressSuggestions(value, country, focused);
  const options = items.map((item, index) => ({ value: String(index), label: item.label }));
  const open = focused && !dismissed && options.length > 0;
  const activeIndex = open && active < options.length ? active : -1;

  const pick = (index: number) => {
    const chosen = items[index];
    if (!chosen) return;
    setActive(-1);
    setDismissed(true);
    onPick(chosen);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      pick(activeIndex);
    }
  };

  const announcement = !focused
    ? ''
    : options.length > 0
      ? t('address.suggestions.count', { total: options.length })
      : loaded
        ? t('address.suggestions.none')
        : '';

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? comboOptionId(listId, activeIndex) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
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
          onBlur();
        }}
        className={textInput}
      />
      {open && (
        <ComboListbox
          id={listId}
          label={t('address.suggestions.label')}
          options={options}
          active={activeIndex}
          onPick={(option) => pick(Number(option.value))}
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

/**
 * Naslov po delih (016, FR-016-12 … FR-016-15; design.md 8.2, 8.4): ulica in kraj s predlogi naslova, dodatna vrstica,
 * poštna številka, regija (kjer jo država uporablja) in država; vrstni red kraja in poštne številke po državi. Izbira
 * predloga izpolni vse dele, ki ostanejo urejljivi. Nov naslov dobi ob prvem vpisu državo kontakta. Napaka predlogov ne
 * ovira vnosa. Oznake delov so iz prevodov; napake po delih izriše komponenta.
 */
export function AddressFields({
  legend,
  value,
  defaultCountry,
  errors,
  fieldId,
  errorId,
  onChange,
  onBlur,
}: {
  legend: string;
  value: AddressDraft;
  /** Država kontakta: predizpolni državo novega naslova (FR-016-15). */
  defaultCountry: string;
  /** Ključi sporočil napak po delih (prevodi). */
  errors: Partial<Record<AddressPart, string>>;
  fieldId: (part: AddressPart) => string;
  errorId: (part: AddressPart) => string;
  onChange: (next: AddressDraft, changed: AddressPart[]) => void;
  onBlur?: (part: AddressPart) => void;
}) {
  const { t } = useTranslation();

  const set = (part: AddressPart, text: string) => {
    const next = { ...value, [part]: text };
    // Nov naslov: ob prvem vpisu država kontakta (uporabnik jo lahko spremeni).
    if (part !== 'country' && isBlankDraft(value) && value.country === '' && defaultCountry) {
      next.country = defaultCountry;
    }
    onChange(next, [part]);
  };

  const pick = (suggestion: AddressSuggestion) => {
    const parts = draftOf(suggestion);
    onChange({ ...parts, extra: value.extra || parts.extra }, [
      'street',
      'postalCode',
      'city',
      'region',
      'country',
    ]);
  };

  const describe = (part: AddressPart) => (errors[part] ? errorId(part) : undefined);
  const message = (part: AddressPart) =>
    errors[part] ? (
      <p id={errorId(part)} className={fieldError}>
        {t(errors[part] as AddressErrorKey)}
      </p>
    ) : null;
  const label = (part: AddressPart) => (
    <label htmlFor={fieldId(part)} className="font-bold">
      {t(`address.parts.${part}`)}
    </label>
  );
  const plain = (part: AddressPart, props: Record<string, string> = {}) => (
    <div className="flex flex-col gap-1">
      {label(part)}
      <input
        id={fieldId(part)}
        type="text"
        value={value[part]}
        onChange={(event) => set(part, event.target.value)}
        onBlur={() => onBlur?.(part)}
        aria-invalid={errors[part] ? true : undefined}
        aria-describedby={describe(part)}
        className={textInput}
        {...props}
      />
      {message(part)}
    </div>
  );
  const combo = (part: 'street' | 'city') => (
    <div className="flex flex-col gap-1">
      {label(part)}
      <AddressCombo
        id={fieldId(part)}
        value={value[part]}
        country={value.country || defaultCountry}
        onChange={(text) => set(part, text)}
        onPick={pick}
        onBlur={() => onBlur?.(part)}
        describedBy={describe(part)}
        invalid={Boolean(errors[part])}
      />
      {message(part)}
    </div>
  );

  const country = value.country || defaultCountry;
  const postal = plain('postalCode', { autoComplete: 'off' });
  const city = combo('city');
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 font-bold">{legend}</legend>
      {combo('street')}
      {plain('extra')}
      <div className="grid gap-3 sm:grid-cols-2">
        {cityBeforePostalCode(country) ? (
          <>
            {city}
            {postal}
          </>
        ) : (
          <>
            {postal}
            {city}
          </>
        )}
      </div>
      {(usesRegion(country) || value.region !== '') && plain('region')}
      <div className="flex flex-col gap-1">
        {label('country')}
        <CountryField
          id={fieldId('country')}
          value={value.country}
          onChange={(code) => onChange({ ...value, country: code }, ['country'])}
          listLabel={t('contacts.form.countryList')}
          aria-invalid={errors.country ? true : undefined}
          aria-describedby={describe('country')}
        />
        {message('country')}
      </div>
    </fieldset>
  );
}
