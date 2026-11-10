import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Dialog, DialogClose, DialogContent, DialogTitle } from '../../shared/ui/dialog';
import { dangerButton, errorAlert, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useMembersApi } from './api';
import { memberFailure } from './memberMessages';
import type { Member } from './types';

interface Props {
  member: Member;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
  onSucceeded: () => void;
  onStale: () => void;
}

/**
 * Dialog *Odstrani iz skupine* (design.md 8.11, 13.4; FR-007-05): vprašanje s predmetom, posledica, fokus ob odprtju na
 * *Prekliči*, nevarni gumb *Odstrani člana*. Napaka ostane v dialogu; po uspehu fokus prevzame naslov razdelka.
 */
function RemoveMemberDialogBody({
  member,
  onClose,
  onCancelled,
  onSucceeded,
  onStale,
}: {
  member: Member;
  onClose: () => void;
  onCancelled: () => void;
  onSucceeded: () => void;
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const api = useMembersApi();
  const { group, reload } = useGroup();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);
  const name = member.name ?? member.email;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.remove(group.id, member.id);
      done.current = true;
      toast(t('members.toast.removed', { name }));
      onClose();
      onSucceeded();
    } catch (error) {
      const result = memberFailure(error, 'remove');
      setFailure(t(result.key));
      if (result.stale) {
        onStale();
        void reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!done.current) onCancelled();
        }}
      >
        <DialogTitle>{t('members.remove.title', { name, group: group.title })}</DialogTitle>
        <p>{t('members.remove.body', { name })}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('members.remove.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('members.remove.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Stanje dialoga živi samo, dokler je odprt: ob vsakem odprtju se začne znova. */
export function RemoveMemberDialog({ open, ...props }: Props) {
  return open ? <RemoveMemberDialogBody {...props} /> : null;
}
