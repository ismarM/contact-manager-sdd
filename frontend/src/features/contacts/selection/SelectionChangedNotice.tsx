import { IconAlertTriangle } from '@tabler/icons-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing, primaryButton, secondaryButton, warningAlert } from '../../../shared/ui/styles';
import type { CheckNotice } from './useSelectionCheck';

/**
 * Obvestilo o spremenjenem izboru (FR-009-18, FR-009-10; design.md 8.13, warning): števila po vrstah, kljukica
 * »Odstrani tudi kontakte, ki ne ustrezajo več filtrom« (samo če taki obstajajo) in gumba za razrešitev; po
 * `409 SELECTION_CHANGED` samo »N izbranih kontaktov ne obstaja več« in *Odstrani jih iz izbora*.
 */
export function SelectionChangedNotice({
  notice,
  removeNoLonger,
  onRemoveNoLonger,
  onUpdate,
  onContinue,
  onRemoveMissing,
  busy,
}: {
  notice: CheckNotice;
  removeNoLonger: boolean;
  onRemoveNoLonger: (value: boolean) => void;
  onUpdate: () => void;
  onContinue: () => void;
  onRemoveMissing: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const checkboxId = useId();

  if (notice.kind === 'missing') {
    return (
      <div role="alert" className={warningAlert}>
        <p className="flex gap-2">
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('contacts.bulk.missingAlert', { count: notice.missing.length })}</span>
        </p>
        <div>
          <button type="button" className={secondaryButton} onClick={onRemoveMissing}>
            {t('contacts.bulk.removeMissing')}
          </button>
        </div>
      </div>
    );
  }

  const { result } = notice;
  const newMatches = result.queries.reduce((sum, query) => sum + query.newMatches.length, 0);
  const noLonger = result.queries.reduce((sum, query) => sum + query.noLongerMatching.length, 0);
  const parts = [
    newMatches > 0 ? t('contacts.bulk.newMatches', { count: newMatches }) : null,
    noLonger > 0 ? t('contacts.bulk.noLonger', { count: noLonger }) : null,
    result.missing.length > 0 ? t('contacts.bulk.missing', { count: result.missing.length }) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div role="alert" className={warningAlert}>
      <p className="flex gap-2">
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span>{t('contacts.bulk.changed', { parts: parts.join(', ') })}</span>
      </p>
      {notice.limit && <p>{t('contacts.selection.limit')}</p>}
      {noLonger > 0 && (
        <label htmlFor={checkboxId} className="flex items-center gap-2">
          <input
            id={checkboxId}
            type="checkbox"
            checked={removeNoLonger}
            onChange={(event) => onRemoveNoLonger(event.target.checked)}
            className={`size-6 accent-primary ${focusRing}`}
          />
          {t('contacts.bulk.removeNoLonger')}
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} onClick={onUpdate}>
          {t('contacts.bulk.updateSelection')}
        </button>
        <button
          type="button"
          className={secondaryButton}
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onContinue();
          }}
        >
          {t('contacts.bulk.continueSelection')}
        </button>
      </div>
    </div>
  );
}
