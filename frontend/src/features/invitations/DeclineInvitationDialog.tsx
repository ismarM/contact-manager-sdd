import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, secondaryButton } from '../../shared/ui/styles';
import { useInvitationsApi } from './api';
import type { ReceivedInvitation } from './types';

/**
 * Potrditveni dialog *Zavrni povabilo* (design.md 13.4; FR-006-10): vprašanje s predmetom, posledica, fokus ob odprtju
 * na *Prekliči*, nevarni gumb zadnji. Ob uspehu in napaki se dialog zapre; napako prikaže stran (`onError`).
 */
export function DeclineInvitationDialog({
  invitation,
  onDeclined,
  onError,
}: {
  invitation: ReceivedInvitation;
  onDeclined: () => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const api = useInvitationsApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  const title = invitation.group.title;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) done.current = false;
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.decline(invitation.id);
      done.current = true;
      setOpen(false);
      onDeclined();
    } catch (error) {
      setOpen(false);
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        className={secondaryButton}
        aria-label={t('invitations.item.declineName', { title })}
      >
        {t('invitations.item.decline')}
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (done.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('invitations.declineDialog.title', { title })}</DialogTitle>
        <p>{t('invitations.declineDialog.text')}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('invitations.declineDialog.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('invitations.declineDialog.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
