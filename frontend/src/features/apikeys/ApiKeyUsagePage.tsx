import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useApiKeysApi } from './api';
import type { ApiKey, ApiKeyUsage } from './types';
import { UsageChart } from './UsageChart';

type Days = 7 | 30;

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; key: ApiKey; usage: ApiKeyUsage };

const link = `inline-flex min-h-11 items-center gap-2 self-start text-primary underline underline-offset-4 ${focusRing}`;

/**
 * Statistika ključa (FR-019-20; plan.md – /account/api-keys/:keyId): obdobje 7 ali 30 dni, skupna števila, graf in
 * enakovredna tabela po dnevih (dan, uspešne, napake, zavrnitve). Neobstoječ ali tuj ključ → »Te strani ni«.
 */
export function ApiKeyUsagePage() {
  const { t, i18n } = useTranslation();
  const { keyId = '' } = useParams();
  const api = useApiKeysApi();
  const [days, setDays] = useState<Days>(7);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );
  const name = state.kind === 'ready' ? state.key.name : '';
  useDocumentTitle(
    state.kind === 'ready'
      ? `${t('apiKeys.usage.heading', { name })} – ${t('app.name')}`
      : t('apiKeys.heading'),
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.list(controller.signal), api.usage(keyId, days, controller.signal)]).then(
      ([keys, usage]) => {
        const key = keys.find((item) => item.id === keyId);
        setState(key ? { kind: 'ready', key, usage } : { kind: 'notFound' });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          error instanceof ApiError && error.status === 404
            ? { kind: 'notFound' }
            : { kind: 'failed' },
        );
      },
    );
    return () => controller.abort();
  }, [api, keyId, days, reloads]);

  if (state.kind === 'notFound') return <NotFoundPage />;

  const back = (
    <Link to="/account" className={link}>
      <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
      {t('apiKeys.usage.back')}
    </Link>
  );

  if (state.kind === 'failed') {
    return (
      <div className="mx-auto flex max-w-[70ch] flex-col gap-4 px-4 py-8">
        {back}
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('apiKeys.usage.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('apiKeys.usage.retry')}
            </button>
          </span>
        </div>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return <div className="mx-auto max-w-[70ch] px-4 py-8" aria-busy="true" />;
  }

  const { usage } = state;
  const totals = usage.totals;
  const totalRows: [string, number][] = [
    [t('apiKeys.usage.total'), totals.total],
    [t('apiKeys.usage.successful'), totals.readOk + totals.writeOk],
    [t('apiKeys.usage.reads'), totals.readOk],
    [t('apiKeys.usage.writes'), totals.writeOk],
    [t('apiKeys.usage.errors'), totals.errors],
    [t('apiKeys.usage.rateLimited'), totals.rateLimited],
  ];

  return (
    <div className="mx-auto flex max-w-[70ch] flex-col gap-6 px-4 py-8">
      {back}
      <h1 className="text-2xl font-bold break-words">{t('apiKeys.usage.heading', { name })}</h1>

      <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <legend className="mb-1 font-bold">{t('apiKeys.usage.periodLegend')}</legend>
        {([7, 30] as const).map((period) => (
          <label key={period} className="flex min-h-11 items-center gap-3 pointer-coarse:min-h-12">
            <input
              type="radio"
              name="usage-period"
              checked={days === period}
              onChange={() => setDays(period)}
              className="size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {t(`apiKeys.usage.period${period}`)}
          </label>
        ))}
      </fieldset>

      <section aria-labelledby="usage-totals" className="flex flex-col gap-2">
        <h2 id="usage-totals" className="text-xl font-bold">
          {t('apiKeys.usage.totals')}
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 sm:max-w-sm">
          {totalRows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="text-right font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="usage-chart" className="flex flex-col gap-3">
        <h2 id="usage-chart" className="text-xl font-bold">
          {t('apiKeys.usage.chartHeading')}
        </h2>
        <UsageChart usage={usage} />
        <div>
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t('apiKeys.usage.tableCaption')}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3">
                  {t('apiKeys.usage.day')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t('apiKeys.usage.successful')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t('apiKeys.usage.errors')}
                </th>
                <th scope="col" className="py-2 text-right">
                  {t('apiKeys.usage.rateLimited')}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...usage.perDay].reverse().map((day) => (
                <tr key={day.day} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 font-normal">
                    {date.format(new Date(`${day.day}T00:00:00`))}
                  </th>
                  <td className="py-2 pr-3 text-right">{day.readOk + day.writeOk}</td>
                  <td className="py-2 pr-3 text-right">{day.errors}</td>
                  <td className="py-2 text-right">{day.rateLimited}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">{t('apiKeys.usage.note')}</p>
    </div>
  );
}
