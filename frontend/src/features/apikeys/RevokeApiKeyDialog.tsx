import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../shared/api/client';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../shared/ui/dialog';
import { dangerButton, errorAlert, ghostButton } from '../../shared/ui/styles';
import type { ApiKey } from './types';

/**
 * Preklic ključa s potrditvijo (FR-019-03; design.md 8.11): fokus na *Ne prekliči*, nevarni gumb ponovi dejanje.
 * Preklican ključ takoj neha delovati; 404 (že izbrisan) se šteje kot preklican.
 */
export function RevokeApiKeyDialog({
  apiKey,
  revoke,
  onRevoked,
}: {
  apiKey: ApiKey;
  revoke: (keyId: string) => Promise<void>;
  onRevoked: () => void;
}) {
  const { t } = useTranslation();
  const cancel = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await revoke(apiKey.id);
      setOpen(false);
      onRevoked();
    } catch (problem) {
      if (problem instanceof ApiError && problem.status === 404) {
        setOpen(false);
        onRevoked();
      } else {
        setFailure(problem instanceof ApiError ? t('apiKeys.revoke.failed') : t('groups.offline'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setFailure(null);
      }}
    >
      <DialogTrigger className={`${ghostButton} text-destructive`}>
        {t('apiKeys.revoke.button', { name: apiKey.name })}
      </DialogTrigger>
      <DialogContent
        role="alertdialog"
        className="max-w-[480px]"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogTitle>{t('apiKeys.revoke.title', { name: apiKey.name })}</DialogTitle>
        <p>{t('apiKeys.revoke.body')}</p>
        {failure && (
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{failure}</span>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose ref={cancel} className={ghostButton}>
            {t('apiKeys.revoke.cancel')}
          </DialogClose>
          <button
            type="button"
            className={dangerButton}
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t('apiKeys.revoke.confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
