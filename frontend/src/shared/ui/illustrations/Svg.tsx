import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

// Osnova ilustracij »črtna risba kartoteke« (design.md 8.21): obrisi 1,5 px `text` z zaobljenimi konci, polnila iz
// `surface`, `sunken`, `accent-soft` in en poudarek (`accent`). Barve so razredi iz žetonov, zato sledijo temi; risba je
// okras (`aria-hidden`), pomen nosi besedilo ob njej. Brez prelivov, senc in 3D.

export interface IllustrationProps {
  /** Širina v px (prazna stanja 160–200, pozdravne do 360). */
  size?: number;
  className?: string;
}

export function Svg({
  size = 180,
  className,
  children,
}: IllustrationProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('stroke-foreground', className)}
    >
      {children}
    </svg>
  );
}

/** Kartica z vrsticami besedila (osnovni element risb). */
export function Card({
  x,
  y,
  w = 80,
  h = 52,
  fill = 'fill-card',
  lines = 2,
  rotate = 0,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  fill?: string;
  lines?: number;
  rotate?: number;
}) {
  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={8} className={fill} />
      <circle cx={x + 16} cy={y + 17} r={7} className="fill-muted" />
      {Array.from({ length: lines }, (_, i) => (
        <path key={i} d={`M${x + 30} ${y + 14 + i * 9}h${w - 46 - i * 10}`} />
      ))}
      <path d={`M${x + 10} ${y + h - 12}h${w - 30}`} />
    </g>
  );
}

/** Predal kartoteke: sprednja stran z jezičkom. */
export function Drawer({
  x = 40,
  y = 82,
  w = 120,
  h = 58,
}: {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} className="fill-selected" />
      <rect x={x + w / 2 - 22} y={y + 14} width={44} height={16} rx={4} className="fill-card" />
      <path d={`M${x + w / 2 - 12} ${y + 22}h24`} className="stroke-primary" />
    </g>
  );
}
