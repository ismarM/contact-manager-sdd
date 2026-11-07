import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, errorAlert, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { conflictCurrent, failureKey, isNotFound, useContactsApi } from './api';
import type { ContactDetail } from './types';

interface Props {
  contact: { id: string; displayName: string; version: number };
  /** Z gumbom *Izbriši kontakt* (pogled); brez njega ga odpre meni vrstice (`open`). */
  trigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDeleted: () => void;
  /** Kontakt je medtem izbrisal nekdo drug (404; FR-004-13). */
  onGone: () => void;
  /** Kontakt je medtem spremenil nekdo drug (409 VERSION_CONFLICT; FR-004-12). */
  onConflict: (current: ContactDetail) => void;
}

/**
 * Potrditev izbrisa kontakta (design.md 8.11; FR-004-12): naslov s kontaktom, posledica, fokus na *Prekliči*. Napake brez
 * povezave, pravic ali arhivirane skupine ostanejo v dialogu; izbrisan ali spremenjen kontakt dialog zapre.
 */
export function DeleteContactDialog({
  contact,
  trigger = false,
  open,
  onOpenChange,
  onDeleted,
  onGone,
  onConflict,
}: Props) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const [ownOpen, setOwnOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const shown = open ?? ownOpen;

  const changeOpen = (next: boolean) => {
    if (next) setFailure(null);
    setOwnOpen(next);
    onOpenChange?.(next);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.deleteContact(group.id, contact.id, contact.version);
      changeOpen(false);
      onDeleted();
    } catch (error) {
      const current = conflictCurrent(error);
      if (current) {
        changeOpen(false);
        onConflict(current);
      } else if (isNotFound(error)) {
        changeOpen(false);
        onGone();
      } else {
        setFailure(t(failureKey(error, 'contacts.delete.failed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={shown} onOpenChange={changeOpen}>
      {trigger && (
        <DialogTrigger className={secondaryButton}>{t('contacts.view.delete')}</DialogTrigger>
      )}
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>{t('contacts.delete.title', { name: contact.displayName })}</DialogTitle>
        <p>{t('contacts.delete.text', { group: group.title })}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('contacts.delete.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('contacts.delete.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
