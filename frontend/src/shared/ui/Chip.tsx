import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';
import { focusRing } from './styles';

// Filtrirni čip (design.md 8.4, 8.7): `radius-full`, `surface` z robom `border`; aktiven `accent-soft` z besedilom
// `accent`. Čip je gumb (`aria-pressed`); aktiven čip z `onRemove` ima ločen gumb »Odstrani filter …«.

export function Chip({
  active = false,
  onClick,
  onRemove,
  children,
  name,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  /** Gumb za odstranitev (samo aktiven čip; čipi vlog ga nimajo). */
  onRemove?: () => void;
  children: ReactNode;
  /** Ime filtra v dostopnem imenu gumba za odstranitev. */
  name?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border',
        active ? 'border-primary bg-selected text-primary' : 'border-input bg-card text-foreground',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={onClick ? active : undefined}
        onClick={onClick}
        className={cn(
          'inline-flex h-9 items-center rounded-full px-3 text-sm font-medium pointer-coarse:h-11',
          !active && 'hover:bg-muted',
          focusRing,
        )}
      >
        {children}
      </button>
      {active && onRemove && (
        <button
          type="button"
          aria-label={t('ui.chip.remove', { name: name ?? '' })}
          onClick={onRemove}
          className={cn(
            'mr-1 inline-flex size-9 items-center justify-center rounded-full hover:bg-muted pointer-coarse:size-11',
            focusRing,
          )}
        >
          <IconX aria-hidden="true" size={16} stroke={1.75} />
        </button>
      )}
    </span>
  );
}
