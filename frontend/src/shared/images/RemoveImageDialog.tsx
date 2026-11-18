import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { imageErrorCode } from './imageApi';
import type { ImageErrorCode } from './photoTypes';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';
import { dangerButton, errorAlert, ghostButton } from '../ui/styles';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Odstrani sliko; zavrnitev pusti dialog odprt z napako. Ob uspehu dialog zapre klicatelj. */
  onConfirm: () => Promise<void>;
}

function RemoveBody({ onConfirm }: Pick<Props, 'onConfirm'>) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState<ImageErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm();
    } catch (error) {
      setFailed(imageErrorCode(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent
      onInteractOutside={(event) => event.preventDefault()}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancel.current?.focus();
      }}
    >
      <DialogTitle>{t('images.removeDialog.title')}</DialogTitle>
      <p>{t('images.removeDialog.body')}</p>
      {failed !== null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t(`images.errors.${failed}`)}</span>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <DialogClose ref={cancel} className={ghostButton}>
          {t('images.removeDialog.cancel')}
        </DialogClose>
        <button
          type="button"
          className={dangerButton}
          aria-disabled={busy}
          onClick={() => void confirm()}
        >
          <IconTrash aria-hidden="true" size={20} stroke={1.75} />
          {t('images.removeDialog.confirm')}
        </button>
      </div>
    </DialogContent>
  );
}

/** Potrditveni dialog *Odstranim sliko?* (design.md 8.11): fokus ob odprtju na *Prekliči*, nevarni gumb. */
export function RemoveImageDialog({ open, onClose, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <RemoveBody onConfirm={onConfirm} />}
    </Dialog>
  );
}
