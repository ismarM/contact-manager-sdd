import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing } from '../../shared/ui/styles';
import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import { contactName, gridFor, startAt } from './CompareColumns';
import { decodeParts, type CompareRow } from './mergeModel';
import type { CompareContact } from './types';

/**
 * Vrstica polja ali dodatnega atributa (FR-011-09): `fieldset` z `legend` = ime polja in izbirnimi gumbi različnih
 * vrednosti. Pri ≥ 640 px je vrednost v stolpcu prvega kontakta, ki jo ima, pod tem so vrednosti ena pod drugo.
 */
export function CompareField({
  id,
  row,
  contacts,
  value,
  error,
  readOnly = false,
  onChange,
}: {
  id: string;
  row: CompareRow;
  contacts: CompareContact[];
  value: string | null;
  /** Besedilo napake ob vrstici (`role="alert"`, povezano z `aria-describedby`). */
  error?: string;
  /** Vrstica z enako vrednostjo pri vseh kontaktih: samo prikaz. */
  readOnly?: boolean;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const format = useFormatters();
  const prefix = useId();
  const errorId = `${id}-error`;
  const legend =
    row.kind === 'field' ? t(`duplicates.compare.fields.${row.key as 'firstName'}`) : row.label;
  // Država je v podatkih koda ISO; prikaz je ime v jeziku vmesnika (FR-013-06).
  const display = (option: string | null) => {
    if (option === null) return t('duplicates.compare.emptyValue');
    const parts = decodeParts(option);
    if (parts) return format.address(parts, true);
    if (row.key === 'country') return countryName(option, language);
    if (row.key === 'phone') return format.phone(option);
    return row.kind === 'attribute' ? format.byType(row.type, option) : option;
  };

  return (
    <fieldset
      id={id}
      tabIndex={error ? -1 : undefined}
      aria-describedby={error ? errorId : undefined}
      className={`${gridFor(contacts.length)} min-w-0 rounded-md border border-border bg-card p-4 outline-none`}
    >
      <legend className="px-1 font-bold break-words">{legend}</legend>
      {readOnly ? (
        <p className="break-words sm:col-span-full">{display(row.options[0]?.value ?? null)}</p>
      ) : (
        row.options.map((option, index) => {
          const first = contacts.findIndex((contact) => option.contactIds.includes(contact.id));
          const owners = contacts
            .filter((contact) => option.contactIds.includes(contact.id))
            .map(contactName)
            .join(', ');
          const descId = `${prefix}-${index}`;
          return (
            <div
              key={option.value ?? '(empty)'}
              className={`flex min-w-0 flex-col ${startAt(first + 1)}`}
            >
              <label className="flex min-h-11 items-center gap-3 pointer-coarse:min-h-12">
                <input
                  type="radio"
                  name={`${prefix}-${row.key}`}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  aria-describedby={descId}
                  className={`size-5 shrink-0 accent-primary ${focusRing}`}
                />
                <span className="break-words">{display(option.value)}</span>
              </label>
              <span id={descId} className="pl-8 text-sm break-words text-muted-foreground">
                {owners}
              </span>
            </div>
          );
        })
      )}
      {error && (
        <p id={errorId} role="alert" className="text-destructive sm:col-span-full">
          {error}
        </p>
      )}
    </fieldset>
  );
}
