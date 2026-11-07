import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useConflictMessage } from './conflictMessage';
import type { ContactDetail, ContactInput } from './types';

/**
 * Opozorilo o konfliktu verzij kontakta (design.md 8.14; FR-004-11): kdo in kdaj je kontakt medtem spremenil, razlike
 * samo za polja, ki se razlikujejo (v vrstnem redu obrazca), ter *Uporabi trenutno različico* in *Shrani moje
 * spremembe*. Nič se ne prepiše tiho.
 */
export function ContactConflictAlert({
  mine,
  current,
  onUseCurrent,
  onSaveMine,
}: {
  mine: ContactInput;
  current: ContactDetail;
  onUseCurrent: () => void;
  onSaveMine: () => void;
}) {
  const { t } = useTranslation();
  const conflictMessage = useConflictMessage();
  const [showDiff, setShowDiff] = useState(false);
  const tableId = useId();
  const text = (value: string | null) =>
    value === null || value === '' ? t('contacts.conflict.empty') : value;
  const attributes = (input: ContactInput) =>
    input.attributes.length === 0
      ? t('contacts.conflict.empty')
      : input.attributes.map((attribute) => `${attribute.key}: ${attribute.value}`).join('\n');
  const tags = (input: ContactInput) =>
    input.tags.length === 0 ? t('contacts.conflict.empty') : input.tags.join(', ');
  const field = (label: string, key: 'firstName' | 'lastName' | 'address' | 'email' | 'phone') => ({
    field: label,
    yours: text(mine[key]),
    theirs: text(current[key]),
  });
  const rows = [
    field(t('contacts.form.firstName'), 'firstName'),
    field(t('contacts.form.lastName'), 'lastName'),
    field(t('contacts.form.address'), 'address'),
    field(t('contacts.form.email'), 'email'),
    field(t('contacts.form.phone'), 'phone'),
    {
      field: t('contacts.form.attributesLegend'),
      yours: attributes(mine),
      theirs: attributes(current),
    },
    { field: t('contacts.form.tagsLegend'), yours: tags(mine), theirs: tags(current) },
  ].filter((row) => row.yours !== row.theirs);

  return (
    <div role="alert" className={warningAlert}>
      <p className="flex gap-2">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="mt-0.5 shrink-0" />
        <span>{conflictMessage(current.updatedBy, current.updatedAt)}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          aria-expanded={showDiff}
          aria-controls={tableId}
          onClick={() => setShowDiff((value) => !value)}
        >
          {t('contacts.conflict.showDiff')}
        </button>
        <button type="button" className={secondaryButton} onClick={onUseCurrent}>
          {t('contacts.conflict.useCurrent')}
        </button>
        <button type="button" className={secondaryButton} onClick={onSaveMine}>
          {t('contacts.conflict.saveMine')}
        </button>
      </div>
      <div id={tableId} hidden={!showDiff} className="overflow-x-auto">
        {showDiff && (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t('contacts.conflict.diffTable')}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2">
                  {t('contacts.conflict.field')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('contacts.conflict.yours')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('contacts.conflict.current')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field}>
                  <th scope="row" className="p-2 font-bold">
                    {row.field}
                  </th>
                  <td className="p-2 break-words whitespace-pre-line">{row.yours}</td>
                  <td className="p-2 break-words whitespace-pre-line">{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
