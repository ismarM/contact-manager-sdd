import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../shared/api/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import {
  dangerButton,
  errorAlert,
  fieldError,
  secondaryButton,
  textInput,
} from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { useMyDataApi } from './api';
import { deletionError } from './accountMessages';
import type { BlockingGroup, DeletionOutcome } from './types';

export interface DeleteAccountDialogProps {
  /** Račun je izbrisan (`deleted` = 204, `pending` = 202). */
  onDeleted: (outcome: DeletionOutcome) => void;
  /** Zaledje je odgovorilo `409 OWNS_ACTIVE_GROUPS` z danim seznamom skupin. */
  onBlocked: (groups: BlockingGroup[]) => void;
}

/**
 * Potrditveni dialog *Izbrišem račun?* (design.md 8.11; FR-012-07): vpis lastnega e-naslova (po obrezu in brez velikosti
 * črk); ob neujemanju napaka ob polju in zahtevek se ne pošlje. Fokus ob odprtju na *Prekliči*, Esc in *Prekliči* vrneta
 * fokus na sprožilec. 409 zapre dialog (seznam skupin dobi razdelek), ostale napake so vidne v dialogu.
 */
export function DeleteAccountDialog({ onDeleted, onBlocked }: DeleteAccountDialogProps) {
  const { t } = useTranslation();
  const api = useMyDataApi();
  const { profile } = useAuth();
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      finished.current = false;
      setTyped('');
      setMismatch(false);
      setFailure(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    const email = typed.trim();
    if (!email || email.toLowerCase() !== (profile?.email ?? '').trim().toLowerCase()) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    try {
      const outcome = await api.deleteAccount(email);
      finished.current = true;
      setOpen(false);
      onDeleted(outcome);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      const known = deletionError(error);
      if (known.kind === 'mismatch') {
        setMismatch(true);
      } else if (known.kind === 'blocked') {
        finished.current = true;
        setOpen(false);
        onBlocked(known.groups);
      } else {
        setFailure(t('account.delete.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={dangerButton}>{t('account.delete.button')}</DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Po 409 ali izbrisu sprožilca ni več: fokus določi razdelek oziroma stran za prijavo.
          if (finished.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('account.delete.dialogTitle')}</DialogTitle>
        <p>{t('account.delete.consequences')}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="font-bold">
              {t('account.delete.confirmLabel')}
            </label>
            <input
              id={inputId}
              type="text"
              value={typed}
              autoComplete="off"
              aria-required="true"
              aria-invalid={mismatch}
              aria-describedby={mismatch ? errorId : undefined}
              onChange={(event) => setTyped(event.target.value)}
              className={textInput}
            />
            {mismatch && (
              <p id={errorId} className={fieldError}>
                {t('account.delete.mismatch')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose ref={cancel} className={secondaryButton}>
              {t('account.delete.cancel')}
            </DialogClose>
            <button type="submit" className={dangerButton} aria-busy={busy} aria-disabled={busy}>
              {t('account.delete.confirm')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
