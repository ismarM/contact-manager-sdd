import { useTranslation } from 'react-i18next';

import { typeNameKey } from '../attributes/typeNames';
import { typeChange, useChangeText } from './changeText';
import type { ChangeField, ChangeFieldName, ChangeValue, ContactChange } from './types';

/** Vrednost celice: besedilo po shemah uporabnika ali »—« z vizualno skritim »prazno« (design.md 8.6). */
function Value({ field, value }: { field: ChangeFieldName; value: ChangeValue }) {
  const { t } = useTranslation();
  const text = useChangeText()(field, value);
  if (text === null || text === '') {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('audit.details.empty')}</span>
      </>
    );
  }
  return <span className="whitespace-pre-line">{text}</span>;
}

function FieldLabel({ field }: { field: ChangeField }) {
  const { t } = useTranslation();
  if (field.field === 'ATTRIBUTE') {
    const types = typeChange(field.before, field.after);
    return (
      <>
        <span className="font-mono">{field.key}</span>
        {types && (
          <span className="block text-sm font-normal text-muted-foreground">
            {t('audit.details.typeChange', {
              before: t(typeNameKey(types[0])),
              after: t(typeNameKey(types[1])),
            })}
          </span>
        )}
      </>
    );
  }
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
                <Value field={field.field} value={field.before} />
              </td>
              <td className="p-2 break-words">
                <Value field={field.field} value={field.after} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
