import { type RefObject, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { focusRing, primaryButton, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import { canEditContacts } from '../contactRouting';
import { useSelectionApi } from './api';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { BulkEditDialog } from './BulkEditDialog';
import { type SelectionParams } from './selection';
import { useSelection } from './selectionContext';

/** Sporočilo pod akcijsko vrstico (FR-009-04, FR-009-17): meja 10 000 ali neuspeh nalaganja zadetkov. */
export type SelectionNotice = 'limit' | 'loadFailed';

/**
 * Akcijska vrstica izbora (FR-009-05; design.md 8.8, D-72): `toolbar` »Dejanja izbora« namesto vrstice z *Nov kontakt*,
 * dokler je kaj izbrano. Vsak član vidi število izbranih, *Izberi vse zadetke (N)* in *Počisti izbor*; *Uredi izbrane* in
 * *Izbriši* samo urednik in više v nearhivirani skupini. *Izvozi v Excel* doda šele 010. Število je območje
 * `aria-live="polite"`; pod 640 px je vrstica prilepljena na spodnji rob.
 */
export function SelectionActionBar({
  total,
  params,
  onNotice,
  onClear,
  onChanged,
  onDeleted,
}: {
  /** Število zadetkov trenutnega iskanja in filtrov (`null`, dokler seznam ni odgovoril). */
  total: number | null;
  /** Iskanje in filtri, ki so veljali ob kliku (zadnja poizvedba seznama). */
  params: () => SelectionParams;
  onNotice: (notice: SelectionNotice | null) => void;
  onClear: () => void;
  /** Množično urejanje je uspelo: seznam se osveži, izbor ostane. */
  onChanged: () => void;
  /** Množični izbris je uspel: seznam se osveži, izbor je prazen. */
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const api = useSelectionApi();
  const { group } = useGroup();
  const selection = useSelection();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const [loading, setLoading] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const editable = canEditContacts(group);

  /** Zapre dialog in takoj vrne fokus na gumb, ki ga je odprl (design.md 8.10); gumba morda ni več (vloga, arhiv). */
  const close = (button: RefObject<HTMLButtonElement | null>) => {
    flushSync(() => setDialog(null));
    button.current?.focus();
  };

  const selectAllResults = async () => {
    if (loading) return;
    setLoading(true);
    onNotice(null);
    try {
      const matched = params();
      const result = await api.contactIds(group.id, matched);
      if (result.truncated || result.total > 10_000) {
        onNotice('limit');
      } else if (selection.addMatches(matched, result.ids) === 'limit') {
        onNotice('limit');
      }
    } catch {
      onNotice('loadFailed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('contacts.selection.toolbar')}
        className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-card p-3 shadow-float sm:static sm:rounded-md sm:border sm:shadow-none"
      >
        <p role="status" aria-live="polite" className="font-bold">
          {t('contacts.selection.count', { count: selection.count })}
        </p>
        {total !== null && (
          <button
            type="button"
            className={secondaryButton}
            aria-disabled={loading}
            onClick={() => void selectAllResults()}
          >
            {t('contacts.selection.selectAllResults', { total })}
          </button>
        )}
        {editable && (
          <>
            <button
              ref={editButton}
              type="button"
              className={primaryButton}
              onClick={() => setDialog('edit')}
            >
              {t('contacts.selection.edit')}
            </button>
            <button
              ref={deleteButton}
              type="button"
              className={`${secondaryButton} text-destructive`}
              onClick={() => setDialog('delete')}
            >
              {t('contacts.selection.delete')}
            </button>
          </>
        )}
        <button type="button" className={`ml-auto px-2 underline ${focusRing}`} onClick={onClear}>
          {t('contacts.selection.clear')}
        </button>
      </div>
      {dialog === 'edit' && (
        <BulkEditDialog
          onClose={() => close(editButton)}
          onApplied={() => {
            close(editButton);
            onChanged();
          }}
        />
      )}
      {dialog === 'delete' && (
        <BulkDeleteDialog
          onClose={() => close(deleteButton)}
          onDeleted={() => {
            setDialog(null);
            onDeleted();
          }}
        />
      )}
    </>
  );
}
