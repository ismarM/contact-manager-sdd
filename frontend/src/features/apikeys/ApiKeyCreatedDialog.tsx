import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DialogClose, DialogTitle } from '../../shared/ui/dialog';
import { errorAlert, secondaryButton, textInput, warningAlert } from '../../shared/ui/styles';
import type { ApiKeyCreated } from './types';

/**
 * Vsebina dialoga z novim ključem (FR-019-01): ključ je prikazan samo enkrat, z gumbom *Kopiraj* in opozorilom. Po
 * zaprtju ga ni več mogoče videti.
 */
export function ApiKeyCreatedDialog({ created }: { created: ApiKeyCreated }) {
  const { t } = useTranslation();
  const keyId = useId();
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = () => {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) {
      setCopyFailed(true);
      return;
    }
    clipboard.writeText(created.token).then(
      () => {
        setCopyFailed(false);
        toast(t('apiKeys.createdDialog.copied'));
      },
      () => setCopyFailed(true),
    );
  };

  return (
    <>
      <DialogTitle>{t('apiKeys.createdDialog.title', { name: created.key.name })}</DialogTitle>
      <p className={warningAlert}>{t('apiKeys.createdDialog.showOnce')}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={keyId} className="font-bold">
          {t('apiKeys.createdDialog.keyLabel')}
        </label>
        <textarea
          id={keyId}
          readOnly
          rows={4}
          value={created.token}
          onFocus={(event) => event.currentTarget.select()}
          className={`${textInput} resize-none font-mono break-all`}
        />
      </div>
      {copyFailed && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('apiKeys.createdDialog.copyFailed')}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} onClick={copy}>
          {t('apiKeys.createdDialog.copy')}
        </button>
        <DialogClose className={secondaryButton}>{t('apiKeys.createdDialog.close')}</DialogClose>
      </div>
    </>
  );
}
