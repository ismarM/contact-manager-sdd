import { useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { dangerButton, secondaryButton } from '../../shared/ui/styles';

/**
 * Potrditev združitve (FR-011-14; design.md 8.11): naslov s številom kontaktov, posledica, fokus na »Prekliči«, med
 * pošiljanjem `aria-disabled` in »Združujem…«; ob zaprtju se fokus vrne na sprožilec.
 */
export function MergeDialog({
  count,
  name,
  busy,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  count: number;
  /** Ime ohranjenega kontakta po združitvi. */
  name: string;
  busy: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const cancel = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent
        role="alertdialog"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogTitle>{t('duplicates.dialog.title', { count })}</DialogTitle>
        <p>{t('duplicates.dialog.body', { count: count - 1, name })}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton} aria-disabled={busy}>
            {t('duplicates.dialog.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onConfirm();
            }}
          >
            {busy ? t('duplicates.dialog.merging') : t('duplicates.dialog.confirm', { count })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
