import { IconCopy } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DialogClose, DialogTitle } from '../../shared/ui/dialog';
import { Callout } from '../../shared/ui/Callout';
import { primaryButton, softButton, textInput } from '../../shared/ui/styles';
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
        toast.success(t('apiKeys.createdDialog.copied'));
      },
      () => setCopyFailed(true),
    );
  };

  return (
    <>
      <DialogTitle>{t('apiKeys.createdDialog.title', { name: created.key.name })}</DialogTitle>
      <Callout tone="warning" role="status">
        {t('apiKeys.createdDialog.showOnce')}
      </Callout>
      <div className="flex flex-col gap-1">
        <label htmlFor={keyId} className="font-medium">
          {t('apiKeys.createdDialog.keyLabel')}
        </label>
        <div className="flex gap-2">
          <input
            id={keyId}
            readOnly
            value={created.token}
            onFocus={(event) => event.currentTarget.select()}
            className={`${textInput} min-w-0 flex-1 font-mono`}
          />
          <button type="button" className={softButton} onClick={copy}>
            <IconCopy aria-hidden="true" size={20} stroke={1.75} />
            {t('apiKeys.createdDialog.copy')}
          </button>
        </div>
      </div>
      {copyFailed && <Callout tone="error">{t('apiKeys.createdDialog.copyFailed')}</Callout>}
      <div className="flex justify-end">
        <DialogClose className={primaryButton}>{t('apiKeys.createdDialog.close')}</DialogClose>
      </div>
    </>
  );
}
