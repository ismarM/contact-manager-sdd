import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApiError } from '../../shared/api/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, errorAlert, secondaryButton } from '../../shared/ui/styles';
import { manageFailureKey, useGroupsApi } from './api';
import { useGroup } from './groupContext';
import { useGroups } from './groupsContext';

/**
 * Potrditveni dialog *Arhiviraj skupino* (design.md 8.11; FR-003-01): vprašanje s predmetom, besedilo posledic, fokus
 * ob odprtju na *Prekliči*, nevarni gumb zadnji. Po uspehu fokus prevzame `onDone` (sprožilec izgine).
 */
export function ArchiveGroupDialog({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const { group, setGroup, markNotFound, reload } = useGroup();
  const { refresh } = useGroups();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      done.current = false;
      setFailure(null);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const updated = await api.archiveGroup(group.id);
      done.current = true;
      setOpen(false);
      setGroup(updated);
      toast(t('groups.toast.archived'));
      refresh();
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        markNotFound();
      } else if (error instanceof ApiError && error.status === 409) {
        // Skupina je medtem že postala arhivirana (GROUP_ARCHIVED): osveži stanje.
        done.current = true;
        setOpen(false);
        await reload();
        refresh();
      } else {
        setFailure(t(manageFailureKey(error, 'groups.manage.archiveFailed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger className={secondaryButton}>{t('groups.manage.archive')}</DialogTrigger>
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
        <DialogTitle>{t('groups.archiveDialog.title', { title: group.title })}</DialogTitle>
        <p>{t('groups.archiveDialog.text')}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={secondaryButton}>
            {t('groups.form.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('groups.manage.archive')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
