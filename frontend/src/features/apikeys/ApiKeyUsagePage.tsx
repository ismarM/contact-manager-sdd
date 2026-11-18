import { IconArrowLeft, IconChevronDown } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../shared/api/client';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { Callout } from '../../shared/ui/Callout';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { card, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useApiKeysApi } from './api';
import type { ApiKey, ApiKeyUsage } from './types';
import { UsageChart, UsageLegend } from './UsageChart';

type Days = 7 | 30;

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; key: ApiKey; usage: ApiKeyUsage };

const link = `inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-medium text-primary hover:underline ${focusRing}`;

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
      <IconArrowLeft aria-hidden="true" size={16} stroke={1.75} />
      {t('apiKeys.usage.back')}
    </Link>
  );

  const page = 'flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8';

  if (state.kind === 'failed') {
    return (
      <div className={page}>
        {back}
        <Callout
          tone="error"
          action={
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
          }
        >
          {t('apiKeys.usage.loadFailed')}
        </Callout>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return <div className={page} aria-busy="true" />;
  }

  const { usage } = state;
  const totals = usage.totals;
  const cardClass = `${card} flex flex-col gap-0.5 px-5 py-4`;
  const figure = 'text-3xl font-semibold tabular-nums';

  return (
    <div className={page}>
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="min-w-0 text-2xl font-semibold break-words">
          {t('apiKeys.usage.heading', { name })}
        </h1>
        <fieldset>
          <legend className="sr-only">{t('apiKeys.usage.periodLegend')}</legend>
          <SegmentedControl
            label={t('apiKeys.usage.periodLegend')}
            value={String(days)}
            segments={[
              { value: '7', label: t('apiKeys.usage.period7') },
              { value: '30', label: t('apiKeys.usage.period30') },
            ]}
            onChange={(next) => setDays(next === '30' ? 30 : 7)}
          />
        </fieldset>
      </div>

      <section aria-labelledby="usage-totals" className="flex flex-col gap-3">
        <h2 id="usage-totals" className="text-sm font-medium text-muted-foreground">
          {t('apiKeys.usage.totals')}
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={cardClass}>
            <dt className="text-sm text-muted-foreground">{t('apiKeys.usage.total')}</dt>
            <dd className={figure}>{totals.total}</dd>
          </div>
          <div className={`${cardClass} !flex-row flex-wrap items-baseline gap-x-1.5`}>
            <dt className="basis-full text-sm text-muted-foreground">
              {t('apiKeys.usage.successful')}
            </dt>
            <dd className={`${figure} basis-full`}>{totals.readOk + totals.writeOk}</dd>
            <dt className="text-xs text-muted-foreground">{t('apiKeys.usage.reads')}</dt>
            <dd className="mr-2 text-xs text-muted-foreground tabular-nums">{totals.readOk}</dd>
            <dt className="text-xs text-muted-foreground">{t('apiKeys.usage.writes')}</dt>
            <dd className="text-xs text-muted-foreground tabular-nums">{totals.writeOk}</dd>
          </div>
          <div className={cardClass}>
            <dt className="text-sm text-muted-foreground">{t('apiKeys.usage.errors')}</dt>
            <dd className={figure}>{totals.errors}</dd>
          </div>
          <div className={cardClass}>
            <dt className="text-sm text-muted-foreground">{t('apiKeys.usage.rateLimited')}</dt>
            <dd className={figure}>{totals.rateLimited}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="usage-chart" className={`${card} flex flex-col gap-4 p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="usage-chart" className="text-xl font-semibold">
            {t('apiKeys.usage.chartHeading')}
          </h2>
          <UsageLegend />
        </div>
        <UsageChart usage={usage} />
        <details className="group">
          <summary
            className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium ${focusRing}`}
          >
            <IconChevronDown
              aria-hidden="true"
              size={16}
              stroke={1.75}
              className="group-open:rotate-180"
            />
            {t('apiKeys.usage.tableSummary')}
          </summary>
          <table className="mt-3 w-full border-collapse text-left tabular-nums">
            <caption className="sr-only">{t('apiKeys.usage.tableCaption')}</caption>
            <thead className="bg-muted text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('apiKeys.usage.day')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('apiKeys.usage.successful')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('apiKeys.usage.errors')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('apiKeys.usage.rateLimited')}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...usage.perDay].reverse().map((day) => (
                <tr key={day.day} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 font-normal">
                    {date.format(new Date(`${day.day}T00:00:00`))}
                  </th>
                  <td className="px-3 py-2 text-right">{day.readOk + day.writeOk}</td>
                  <td className="px-3 py-2 text-right">{day.errors}</td>
                  <td className="px-3 py-2 text-right">{day.rateLimited}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <p className="max-w-prose text-sm text-muted-foreground">{t('apiKeys.usage.note')}</p>
    </div>
  );
}
