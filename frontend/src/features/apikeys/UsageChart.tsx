import { useTranslation } from 'react-i18next';

import type { ApiKeyUsage } from './types';

type Day = ApiKeyUsage['perDay'][number];

const SEGMENTS = [
  {
    key: 'successful',
    swatch: 'bg-success',
    fill: 'fill-success',
    value: (d: Day) => d.readOk + d.writeOk,
  },
  {
    key: 'errors',
    swatch: 'bg-destructive',
    fill: 'fill-[url(#usage-hatch)]',
    value: (d: Day) => d.errors,
  },
  {
    key: 'rateLimited',
    swatch: 'bg-warning',
    fill: 'fill-warning',
    value: (d: Day) => d.rateLimited,
  },
] as const;

/** Višina grafa v enotah viewBox; en dan je stolpec širine {@link BAR} z razmikom {@link GAP}. */
const HEIGHT = 100;
const BAR = 10;
const GAP = 6;
const TICKS = 3;

/** Zgornja meja osi: prvo »lepo« število (1, 2, 5 × 10^k), deljivo s številom delitev. */
function niceMax(value: number): number {
  const exponent = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  for (const step of [1, 1.5, 3, 6, 9, 15, 30]) {
    const candidate = step * exponent;
    if (candidate >= value && candidate % TICKS === 0) return candidate;
  }
  return Math.ceil(value / TICKS) * TICKS;
}

/** Legenda grafa (besedilo, ne samo barva): uspešne, napake (črtkano), zavrnitve zaradi omejitve. */
export function UsageLegend() {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('apiKeys.usage.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {SEGMENTS.map(({ key, swatch }) => (
        <li key={key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block size-3 rounded-xs ${swatch}`} />
          {t(`apiKeys.usage.${key}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Stolpčni graf zahtev po dnevih (FR-019-20, design.md 13.4: brez knjižnice): vsak dan je en stolpec iz treh delov –
 * uspešne, napake (črtkano), zavrnitve zaradi omejitve – v barvah žetonov (SVG), z oznakami osi in mrežo. Graf je
 * samo vizualen (`aria-hidden`); enakovredni podatki so v tabeli ob njem.
 */
export function UsageChart({ usage }: { usage: ApiKeyUsage }) {
  const { i18n } = useTranslation();
  const max = niceMax(Math.max(1, ...usage.perDay.map((day) => day.total)));
  const width = usage.perDay.length * (BAR + GAP) - GAP;
  const number = new Intl.NumberFormat(i18n.language);
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
  const every = usage.perDay.length > 10 ? 5 : 1;
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => (max / TICKS) * (TICKS - index));

  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 text-xs text-muted-foreground tabular-nums"
    >
      <div className="flex h-56 flex-col justify-between text-right">
        {ticks.map((tick) => (
          <span key={tick}>{number.format(tick)}</span>
        ))}
      </div>
      <svg
        focusable="false"
        data-testid="usage-chart"
        viewBox={`0 0 ${width + GAP} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-56 w-full overflow-visible border-b border-input"
      >
        <defs>
          <pattern
            id="usage-hatch"
            patternUnits="userSpaceOnUse"
            width="3"
            height="3"
            patternTransform="rotate(45)"
          >
            <rect width="3" height="3" className="fill-destructive" />
            <rect width="1" height="3" className="fill-card" />
          </pattern>
        </defs>
        {ticks.slice(0, -1).map((tick) => (
          <line
            key={tick}
            x1="0"
            x2={width + GAP}
            y1={HEIGHT - (tick / max) * HEIGHT}
            y2={HEIGHT - (tick / max) * HEIGHT}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="stroke-border"
          />
        ))}
        {usage.perDay.map((day, index) => {
          let top = HEIGHT;
          return (
            <g key={day.day}>
              {SEGMENTS.map(({ key, fill, value }) => {
                const height = (value(day) / max) * HEIGHT;
                top -= height;
                return height > 0 ? (
                  <rect
                    key={key}
                    x={GAP / 2 + index * (BAR + GAP)}
                    y={top}
                    width={BAR}
                    height={height}
                    className={fill}
                  />
                ) : null;
              })}
            </g>
          );
        })}
      </svg>
      <span />
      <div className="flex pt-1 text-center">
        {usage.perDay.map((day, index) => (
          <span key={day.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {index % every === 0 ? dayFormat.format(new Date(`${day.day}T00:00:00`)) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
