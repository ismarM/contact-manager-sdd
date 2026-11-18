import { IconAlertTriangle, IconArrowsExchange } from '@tabler/icons-react';
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
import {
  dangerButton,
  errorAlert,
  ghostButton,
  primaryButton,
  secondaryButton,
} from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useGroups } from '../groups/groupsContext';
import { useMemberCount, useMembersApi } from './api';
import { memberFailure } from './memberMessages';

/**
 * Dialog *Zapusti skupino* (design.md 8.11, 13.4; FR-007-06): vprašanje s predmetom, posledica, fokus ob odprtju na
 * *Prekliči*. Po uspehu: seznam skupin (osvežen), obvestilo; napaka ostane v dialogu.
 *
 * Lastnik (FR-017-19, -20) dobi pojasnilo brez potrditve zapustitve: *Prenesi lastništvo* (`onTransfer`, odpre obstoječi
 * dialog prenosa), lastnik-edini član pa *Izbriši skupino* (`onDelete`, odpre obstoječi dialog izbrisa; nič se ne izbriše
 * neposredno).
 */
export function LeaveGroupDialog({
  onTransfer,
  onDelete,
}: {
  onTransfer?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const api = useMembersApi();
  const navigate = useNavigate();
  const { group, reload } = useGroup();
  const { refresh } = useGroups();
  const count = useMemberCount(group.id);
  const isOwner = group.role === 'OWNER';
  const canTransfer = isOwner && !group.archived && count !== undefined && count > 1;
  const sole = isOwner && count !== undefined && count <= 1;
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const left = useRef(false);
  const handOver = useRef<(() => void) | undefined>(undefined);

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
      toast.success(t('members.toast.left', { group: group.title }));
      refresh();
      void navigate('/groups', { state: { focusHeading: true } });
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
          if (left.current || handOver.current) event.preventDefault();
          const next = handOver.current;
          handOver.current = undefined;
          if (next) setTimeout(next, 0);
        }}
      >
        <DialogTitle>
          {isOwner
            ? t('members.leave.owner.title', { group: group.title })
            : t('members.leave.title', { group: group.title })}
        </DialogTitle>
        <p>
          {!isOwner
            ? t('members.leave.body')
            : sole
              ? t('members.leave.owner.sole')
              : t('members.leave.owner.body')}
        </p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={ghostButton}>
            {isOwner ? t('members.leave.owner.close') : t('members.leave.cancel')}
          </DialogClose>
          {!isOwner && (
            <button
              type="button"
              className={dangerButton}
              aria-disabled={busy}
              onClick={() => void confirm()}
            >
              {t('members.leave.confirm')}
            </button>
          )}
          {canTransfer && onTransfer && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                handOver.current = onTransfer;
                setOpen(false);
              }}
            >
              <IconArrowsExchange aria-hidden="true" size={20} stroke={1.75} />
              {t('members.transfer.button')}
            </button>
          )}
          {sole && group.canDelete && onDelete && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                handOver.current = onDelete;
                setOpen(false);
              }}
            >
              {t('groups.manage.delete')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
