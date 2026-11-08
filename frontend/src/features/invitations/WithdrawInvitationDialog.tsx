import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useInvitationsApi } from './api';
import type { OutgoingInvitation } from './types';

/**
 * Potrditveni dialog *Umakni povabilo* (design.md 13.4; FR-006-15): vprašanje s predmetom (e-naslov), posledica, fokus
 * ob odprtju na *Prekliči*. Ob uspehu in napaki se dialog zapre; po uspehu fokus prevzame razdelek (`onDone`), napako
 * prikaže razdelek (`onError`).
 */
export function WithdrawInvitationDialog({
  groupId,
  invitation,
  onDone,
  onError,
}: {
  groupId: string;
  invitation: OutgoingInvitation;
  onDone: () => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const api = useInvitationsApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  const email = invitation.inviteeEmail;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) done.current = false;
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.withdraw(groupId, invitation.id);
      done.current = true;
      setOpen(false);
      onDone();
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
        className={`min-h-11 rounded-md px-2 font-bold text-primary underline underline-offset-4 hover:bg-muted pointer-coarse:min-h-12 ${focusRing}`}
        aria-label={t('invitations.pending.withdrawName', { email })}
      >
        {t('invitations.pending.withdraw')}
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
        <DialogTitle>{t('invitations.withdrawDialog.title', { email })}</DialogTitle>
        <p>{t('invitations.withdrawDialog.text')}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('invitations.withdrawDialog.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('invitations.withdrawDialog.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
