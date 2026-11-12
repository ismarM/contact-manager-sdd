import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../shared/api/client';
import { errorAlert, primaryButton, secondaryButton } from '../../shared/ui/styles';
import { useMyDataApi } from './api';
import { downloadJson, localDateStamp } from './downloadJson';

type ExportState = 'idle' | 'busy' | 'done' | 'failed';

/**
 * Razdelek *Moji podatki* (design.md 9.9, točka 3; FR-012-01 … FR-012-04): razlaga vsebine izvoza in prenos JSON.
 * Ime datoteke nosi lokalni datum brskalnika (FR-012-02). Napaka je vidna na mestu akcije z gumbom *Poskusi znova*
 * (design.md 8.13), datoteka se ob napaki ne ustvari (FR-012-04); 401 je izguba seje, ki jo obravnava `authFetch`.
 */
export function MyDataSection() {
  const { t } = useTranslation();
  const api = useMyDataApi();
  const [state, setState] = useState<ExportState>('idle');

  const download = async () => {
    if (state === 'busy') return;
    setState('busy');
    try {
      const data = await api.exportData();
      downloadJson(data, `moji-podatki-${localDateStamp(new Date())}.json`);
      setState('done');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 401 ? 'idle' : 'failed');
    }
  };

  const busy = state === 'busy';

  return (
    <section aria-labelledby="account-data" className="flex flex-col gap-3">
      <h2 id="account-data" className="text-xl font-bold">
        {t('account.data.heading')}
      </h2>
      <p>{t('account.data.description')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          aria-busy={busy}
          className={`${primaryButton} disabled:opacity-60`}
        >
          {t('account.data.download')}
        </button>
        {state === 'done' && (
          <p role="status" className="text-muted-foreground">
            {t('account.data.success')}
          </p>
        )}
      </div>
      {state === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <div role="alert" className={errorAlert}>
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{t('account.data.error')}</span>
          </div>
          <button type="button" onClick={() => void download()} className={secondaryButton}>
            {t('account.data.retry')}
          </button>
        </div>
      )}
    </section>
  );
}
