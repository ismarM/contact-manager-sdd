import { useTranslation } from 'react-i18next';

import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import type { ChangeField, ChangeValue, ContactChange } from './types';

/** Vrednost celice: besedilo, značke ločene z vejico ali »—« z vizualno skritim »prazno« (design.md 8.6). */
function Value({
  value,
  country = false,
  phone = false,
}: {
  value: ChangeValue;
  country?: boolean;
  phone?: boolean;
}) {
  const { t } = useTranslation();
  const language = useUiLanguage();
  const format = useFormatters();
  const joined = Array.isArray(value) ? value.join(', ') : value;
  // 013: pri državi sta `before`/`after` kodi ISO; ime v jeziku vmesnika, neznana koda ostane surova.
  let text = joined;
  if (country && joined) text = countryName(joined, language);
  else if (phone && joined) text = format.phone(joined);
  if (text === null || text === '') {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('audit.details.empty')}</span>
      </>
    );
  }
  return <>{text}</>;
}

function FieldLabel({ field }: { field: ChangeField }) {
  const { t } = useTranslation();
  if (field.field === 'ATTRIBUTE') return <span className="font-mono">{field.key}</span>;
  return <>{t(`audit.details.fields.${field.field}`)}</>;
}

/** Preglednica *Polje · Prej · Potem* enega kontakta (FR-005-08): samo spremenjena polja v vrstnem redu odgovora. */
export function ChangeTable({ change }: { change: ContactChange }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {t('audit.details.caption', { name: change.displayName })}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-border p-2">
              {t('audit.details.field')}
            </th>
            <th scope="col" className="border-b border-border p-2">
              {t('audit.details.before')}
            </th>
            <th scope="col" className="border-b border-border p-2">
              {t('audit.details.after')}
            </th>
          </tr>
        </thead>
        <tbody>
          {change.fields.map((field, index) => (
            <tr
              key={`${field.field}-${field.key ?? ''}-${index}`}
              className="border-b border-border"
            >
              <th scope="row" className="p-2 font-bold break-words">
                <FieldLabel field={field} />
              </th>
              <td className="p-2 break-words">
                <Value
                  value={field.before}
                  country={field.field === 'COUNTRY'}
                  phone={field.field === 'PHONE'}
                />
              </td>
              <td className="p-2 break-words">
                <Value
                  value={field.after}
                  country={field.field === 'COUNTRY'}
                  phone={field.field === 'PHONE'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
