import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { secondaryButton } from '../../shared/ui/styles';

/**
 * Blok kode z gumbom *Kopiraj* (design.md 8.1, FR-019-14). Vrstice se prelomijo (brez vodoravnega drsenja strani pri
 * 320 px); stanje kopiranja je sporočeno bralniku zaslona z `role="status"`.
 */
export function CodeBlock({ code, name }: { code: string; name: string }) {
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
    <div className="flex flex-col gap-2">
      <pre className="rounded-md border border-border bg-muted p-3 font-mono text-sm break-all whitespace-pre-wrap text-foreground">
        <code>{code}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondaryButton}
          aria-label={t('apiDocs.copyExample', { name })}
          onClick={copy}
        >
          {t('apiDocs.copy')}
        </button>
        <span role="status" className="text-sm">
          {state === 'copied' && t('apiDocs.copied')}
          {state === 'failed' && t('apiDocs.copyFailed')}
        </span>
      </div>
    </div>
  );
}
