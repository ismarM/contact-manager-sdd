import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';

// Oznaka polja (design.md 8.6): ob neobveznih poljih mirna oznaka »(neobvezno)«. Oznaka je ob oznaki `label`, ne v njej,
// zato ne spremeni dostopnega imena polja (`aria-hidden`); obveznost polja poroča njegova vrednost (`required`).

export function FieldLabel({
  htmlFor,
  children,
  optional = false,
  className = 'font-bold',
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  );
  if (!optional) return label;
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2')}>
      {label}
      <span aria-hidden="true" className="text-sm text-muted-foreground">
        {t('ui.optional')}
      </span>
    </div>
  );
}
