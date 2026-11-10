import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, errorAlert, secondaryButton } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useGroups } from '../groups/groupsContext';
import { useMembersApi } from './api';
import { memberFailure } from './memberMessages';

/**
 * Dialog *Zapusti skupino* (design.md 8.11, 13.4; FR-007-06): vprašanje s predmetom, posledica, fokus ob odprtju na
 * *Prekliči*. Po uspehu: seznam skupin (osvežen), obvestilo; napaka ostane v dialogu.
 */
export function LeaveGroupDialog() {
  const { t } = useTranslation();
  const api = useMembersApi();
  const navigate = useNavigate();
  const { group, reload } = useGroup();
  const { refresh } = useGroups();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const left = useRef(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      left.current = false;
      setFailure(null);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.leave(group.id);
      left.current = true;
      setOpen(false);
      toast(t('members.toast.left', { group: group.title }));
      refresh();
      void navigate('/', { state: { focusHeading: true } });
    } catch (error) {
      const result = memberFailure(error, 'leave');
      setFailure(t(result.key));
      if (result.stale) void reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={secondaryButton}>{t('members.leave.button')}</DialogTrigger>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (left.current) event.preventDefault();
        }}
      >
        <DialogTitle>{t('members.leave.title', { group: group.title })}</DialogTitle>
        <p>{t('members.leave.body')}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('members.leave.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('members.leave.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
