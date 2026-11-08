import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { primaryButton, secondaryButton } from '../../shared/ui/styles';
import { useAuditTime } from './formatTime';

/** Cilj rollbacka: vnos (njegov čas) ali *Začetno stanje* (`null`). */
export type RollbackTarget = { id: string; createdAt: string } | null;

/**
 * Potrditev rollbacka (design.md 8.11; FR-005-16, FR-005-20): naslov s časom točke, posledica, fokus na *Prekliči*.
 * Dialog ostane odprt med zahtevo; napake prikaže stran nad sledjo.
 */
export function RollbackDialog({
  open,
  target,
  busy,
  onConfirm,
  onCancel,
  returnFocus,
}: {
  open: boolean;
  target: RollbackTarget;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Element, ki je odprl dialog: nanj se vrne fokus ob zaprtju (dialog nima lastnega sprožilca). */
  returnFocus: { current: HTMLElement | null };
}) {
  const { t } = useTranslation();
  const time = useAuditTime();
  const cancel = useRef<HTMLButtonElement>(null);
  const when = target ? time(target.createdAt) : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>
          {target ? t('audit.rollback.title', { time: when }) : t('audit.initial.title')}
        </DialogTitle>
        <p>{target ? t('audit.rollback.text', { time: when }) : t('audit.initial.text')}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('audit.rollback.cancel')}
          </DialogClose>
          <button
            type="button"
            className={primaryButton}
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onConfirm();
            }}
          >
            {t('audit.rollback.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
