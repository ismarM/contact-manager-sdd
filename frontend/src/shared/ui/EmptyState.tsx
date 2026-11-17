import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// Prazno stanje (design.md 8.21): naslov, stavek in dovoljeno dejanje; ilustracija (okras, `aria-hidden`) samo na
// zaslonih brez delovnih podatkov (prvi zagon, skupine, povabila, 404). Dejanje poda klicatelj glede na vlogo in
// stanje skupine (VIEWER in arhivirana skupina ga ne dobita).

export function EmptyState({
  title,
  text,
  action,
  illustration,
  headingLevel = 2,
  centered = false,
  className,
}: {
  title: ReactNode;
  text?: ReactNode;
  /** Dovoljeno dejanje (gumb ali povezava); `null`, kadar vloga ali stanje skupine dejanja ne dopušča. */
  action?: ReactNode;
  /** Skupna ilustracija iz `shared/ui/illustrations` (že `aria-hidden`). */
  illustration?: ReactNode;
  headingLevel?: 2 | 3;
  /** Sredinska postavitev (zaslon brez podatkov); sicer levo poravnano v delovnem zaslonu. */
  centered?: boolean;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      className={cn(
        'flex flex-col gap-3 py-6',
        centered ? 'items-center py-10 text-center' : 'items-start',
        className,
      )}
    >
      {illustration}
      <Heading className={cn('font-bold', headingLevel === 2 ? 'text-xl' : 'text-lg')}>
        {title}
      </Heading>
      {text && <p className="max-w-prose text-muted-foreground">{text}</p>}
      {action}
    </section>
  );
}
