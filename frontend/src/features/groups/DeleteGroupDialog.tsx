import { IconAlertTriangle } from '@tabler/icons-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

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
import { manageFailureKey, useGroupsApi } from './api';
import { useGroup } from './groupContext';
import { useGroups } from './groupsContext';

/**
 * Potrditveni dialog *Izbriši skupino* z vpisom naslova (design.md 8.11; FR-003-10): vpis se primerja po obrezu
 * presledkov, z enakimi velikimi in malimi črkami; ob neujemanju napaka ob polju in zahtevek se ne pošlje.
 */
export function DeleteGroupDialog() {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const navigate = useNavigate();
  const { group, markNotFound } = useGroup();
  const { refresh } = useGroups();
  const inputId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const deleted = useRef(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      deleted.current = false;
      setTyped('');
      setMismatch(false);
      setFailure(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    if (typed.trim() !== group.title) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    try {
      await api.deleteGroup(group.id);
      deleted.current = true;
      setOpen(false);
      toast(t('groups.toast.deleted'));
      refresh();
      void navigate('/');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        markNotFound();
      } else {
        setFailure(t(manageFailureKey(error, 'groups.manage.deleteFailed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={secondaryButton}>{t('groups.manage.delete')}</DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (deleted.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('groups.deleteDialog.title', { title: group.title })}</DialogTitle>
        <p>{t('groups.deleteDialog.text')}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="font-bold">
              {t('groups.deleteDialog.confirmLabel')}
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
                {t('groups.deleteDialog.mismatch')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose ref={cancel} className={secondaryButton}>
              {t('groups.form.cancel')}
            </DialogClose>
            <button type="submit" className={dangerButton} aria-disabled={busy}>
              {t('groups.manage.delete')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
