import { useTranslation } from 'react-i18next';

import type { ApiKeyUsage } from './types';

type Day = ApiKeyUsage['perDay'][number];

const SEGMENTS = [
  {
    key: 'successful',
    color: 'bg-success',
    fill: 'fill-success',
    value: (d: Day) => d.readOk + d.writeOk,
  },
  { key: 'errors', color: 'bg-destructive', fill: 'fill-destructive', value: (d: Day) => d.errors },
  {
    key: 'rateLimited',
    color: 'bg-warning',
    fill: 'fill-warning',
    value: (d: Day) => d.rateLimited,
  },
] as const;

/** Višina grafa v enotah viewBox; en dan je stolpec širine {@link BAR} z razmikom {@link GAP}. */
const HEIGHT = 100;
const BAR = 10;
const GAP = 2;

/**
 * Stolpčni graf zahtev po dnevih (FR-019-20, design.md 13.4: brez knjižnice): vsak dan je en stolpec iz treh delov –
 * uspešne, napake, zavrnitve zaradi omejitve – v barvah žetonov (SVG). Graf je samo vizualen (`aria-hidden`);
 * enakovredni podatki so v tabeli ob njem, legenda pa z besedilom, ne samo z barvo.
 */
export function UsageChart({ usage }: { usage: ApiKeyUsage }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...usage.perDay.map((day) => day.total));
  const width = usage.perDay.length * (BAR + GAP) - GAP;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {SEGMENTS.map(({ key, color }) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`inline-block size-3 rounded-sm ${color}`} />
            {t(`apiKeys.usage.${key}`)}
          </li>
        ))}
      </ul>
      <svg
        aria-hidden="true"
        focusable="false"
        data-testid="usage-chart"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-40 w-full rounded-md border border-border bg-card p-2"
      >
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
                    x={index * (BAR + GAP)}
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
    </div>
  );
}
