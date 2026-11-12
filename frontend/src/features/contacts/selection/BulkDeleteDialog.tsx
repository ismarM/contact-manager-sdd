import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../../shared/ui/dialog';
import { dangerButton, errorAlert, secondaryButton } from '../../../shared/ui/styles';
import { useGroup } from '../../groups/groupContext';
import type { BulkDeleteResult } from '../types';
import { useSelectionApi } from './api';
import { bulkFailure } from './bulkFailure';
import { SelectionChangedNotice } from './SelectionChangedNotice';
import { useSelection } from './selectionContext';
import { useSelectionCheck } from './useSelectionCheck';

/**
 * Potrditev množičnega izbrisa (FR-009-13, FR-009-17; design.md 8.11): naslov s številom, posledica, fokus na *Prekliči*.
 * Pred izbrisom velja preverjanje sprememb izbora (FR-009-18); napake ostanejo v dialogu. Po uspehu se izbor počisti.
 */
export function BulkDeleteDialog({
  onClose,
  onDeleted,
}: {
  /** Dialog je zaprt brez izbrisa (*Prekliči*, *Esc*): fokus se vrne na *Izbriši*. */
  onClose: () => void;
  /** Kontakti so izbrisani (seznam se osveži, izbor je prazen). */
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const api = useSelectionApi();
  const { group } = useGroup();
  const selection = useSelection();
  const cancel = useRef<HTMLButtonElement>(null);
  const run = useCallback(
    (ids: string[]) => api.bulkDelete(group.id, { contactIds: ids }),
    [api, group.id],
  );
  const { clear } = selection;
  const onSuccess = useCallback(
    (result: BulkDeleteResult) => {
      toast(t('contacts.bulk.deleted', { count: result.deleted }));
      clear();
      onDeleted();
    },
    [t, clear, onDeleted],
  );
  const check = useSelectionCheck({ run, onSuccess });
  const failure =
    check.error === null ? null : bulkFailure(check.error, t, 'contacts.bulk.deleteFailed');
  const count = selection.count;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        role="alertdialog"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>{t('contacts.bulk.deleteTitle', { count })}</DialogTitle>
        <p>{t('contacts.bulk.deleteText', { group: group.title })}</p>
        {check.notice && (
          <SelectionChangedNotice
            notice={check.notice}
            removeNoLonger={check.removeNoLonger}
            onRemoveNoLonger={check.setRemoveNoLonger}
            onUpdate={check.updateSelection}
            onContinue={() => void check.continueAnyway()}
            onRemoveMissing={check.removeMissing}
            busy={check.busy}
          />
        )}
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span className="flex flex-wrap items-center gap-3">
              {failure.text}
              {failure.retry && (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => void check.submit()}
                >
                  {t('contacts.bulk.retry')}
                </button>
              )}
            </span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('contacts.bulk.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={check.busy}
            onClick={() => void check.submit()}
          >
            {t('contacts.bulk.deleteConfirm', { count })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
