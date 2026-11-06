import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useListLanguage } from './api';
import { conflictMessage } from './conflictMessage';
import type { GroupDetail, GroupInput } from './types';

/**
 * Opozorilo o konfliktu verzij (design.md 8.14; FR-002-12): kdo in kdaj je skupino medtem spremenil, razlike samo za
 * polja, ki se razlikujejo, ter *Uporabi trenutno različico* in *Shrani moje spremembe*. Nič se ne prepiše tiho.
 */
export function ConflictAlert({
  mine,
  current,
  onUseCurrent,
  onSaveMine,
}: {
  mine: GroupInput;
  current: GroupDetail;
  onUseCurrent: () => void;
  onSaveMine: () => void;
}) {
  const { t } = useTranslation();
  const language = useListLanguage();
  const [showDiff, setShowDiff] = useState(false);
  const tableId = useId();
  const description = (value: string | null) => value ?? t('groups.details.noDescription');
  const rows = [
    { field: t('groups.form.title'), yours: mine.title, theirs: current.title },
    {
      field: t('groups.form.description'),
      yours: description(mine.description),
      theirs: description(current.description),
    },
    {
      field: t('groups.form.color'),
      yours: t(`colors.${mine.color}`),
      theirs: t(`colors.${current.color}`),
    },
  ].filter((row) => row.yours !== row.theirs);

  return (
    <div role="alert" className={warningAlert}>
      <p className="flex gap-2">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="mt-0.5 shrink-0" />
        <span>{conflictMessage(current.updatedBy, current.updatedAt, language, new Date())}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          aria-expanded={showDiff}
          aria-controls={tableId}
          onClick={() => setShowDiff((value) => !value)}
        >
          {t('groups.conflict.showDiff')}
        </button>
        <button type="button" className={secondaryButton} onClick={onUseCurrent}>
          {t('groups.conflict.useCurrent')}
        </button>
        <button type="button" className={secondaryButton} onClick={onSaveMine}>
          {t('groups.conflict.saveMine')}
        </button>
      </div>
      <div id={tableId} hidden={!showDiff} className="overflow-x-auto">
        {showDiff && (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t('groups.conflict.diffTable')}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2">
                  {t('groups.conflict.field')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('groups.conflict.yours')}
                </th>
                <th scope="col" className="border-b border-border p-2">
                  {t('groups.conflict.current')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field}>
                  <th scope="row" className="p-2 font-bold">
                    {row.field}
                  </th>
                  <td className="p-2 break-words">{row.yours}</td>
                  <td className="p-2 break-words">{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
