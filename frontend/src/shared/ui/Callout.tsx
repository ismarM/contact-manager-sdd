import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// Sporočilo (design.md 8.13): ozadje `*-soft`, `radius-md`, ikona v barvi stanja, besedilo `text`, brez barvnih robov na
// levi. Napaka je `role="alert"`, opozorilo in informacija `role="status"`; vedno z ikono in besedilom.

type Tone = 'error' | 'warning' | 'info' | 'success';

const TONE: Record<Tone, { box: string; icon: string; Icon: typeof IconInfoCircle }> = {
  error: { box: 'bg-destructive-soft', icon: 'text-destructive', Icon: IconAlertTriangle },
  warning: { box: 'bg-warning-soft', icon: 'text-warning', Icon: IconAlertTriangle },
  info: { box: 'bg-selected', icon: 'text-primary', Icon: IconInfoCircle },
  success: { box: 'bg-success-soft', icon: 'text-success', Icon: IconCircleCheck },
};

export function Callout({
  tone,
  children,
  action,
  className,
  announce = true,
  role,
}: {
  tone: Tone;
  children: ReactNode;
  /** Npr. gumb *Poskusi znova*. */
  action?: ReactNode;
  className?: string;
  /** `false`: brez vloge (obvestilo že objavlja nadrejeno živo področje). */
  announce?: boolean;
  /** Vloga namesto privzete (opozorilo, ki ga je treba objaviti kot `alert`). */
  role?: 'alert' | 'status';
}) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      role={announce ? (role ?? (tone === 'error' ? 'alert' : 'status')) : undefined}
      className={cn(
        'flex items-start gap-3 rounded-md border border-border p-3 text-foreground',
        box,
        className,
      )}
    >
      <Icon aria-hidden="true" size={20} stroke={1.75} className={cn('mt-0.5 shrink-0', icon)} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
