import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ghostButton } from '../../shared/ui/styles';

/**
 * Blok kode (design.md 8.1, FR-019-14): `sunken` kartica z oznako vrste (HTTP, Zahtevek, Odgovor) in gumbom *Kopiraj*
 * (`copyable`). Vrstice se prelomijo samo pri dolgih nizih (vodoravno drsi blok, ne stran); stanje kopiranja je
 * sporočeno bralniku zaslona z `role="status"`.
 */
export function CodeBlock({
  code,
  name,
  label,
  copyable = true,
}: {
  code: string;
  name: string;
  label: string;
  copyable?: boolean;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = () => {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) {
      setState('failed');
      return;
    }
    clipboard.writeText(code).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };

  return (
    <div className="flex flex-col rounded-md bg-muted">
      <div className="flex min-h-11 items-center justify-between gap-2 pr-2 pl-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        {copyable && (
          <div className="flex items-center gap-2">
            <span role="status" className="text-sm">
              {state === 'copied' && t('apiDocs.copied')}
              {state === 'failed' && t('apiDocs.copyFailed')}
            </span>
            <button
              type="button"
              className={ghostButton}
              aria-label={t('apiDocs.copyExample', { name })}
              onClick={copy}
            >
              <IconCopy aria-hidden="true" size={16} stroke={1.75} />
              {t('apiDocs.copy')}
            </button>
          </div>
        )}
      </div>
      <pre className="overflow-x-auto px-4 pt-1 pb-4 font-mono text-sm text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
