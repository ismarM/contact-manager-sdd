import { IconArchive, IconLock } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Role } from '../../features/groups/types';
import { cn } from '../lib/cn';

// Značke (design.md 8.4, 8.5): oznake, ne kategorije barv. Vloga: rob `border` in besedilo `muted` z vizualno skritim
// »Vloga:«; *Arhivirana* in *Trajno arhivirana* (ključavnica): `warning-soft` z besedilom `warning`.

const base = 'inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-sm';

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(base, 'bg-muted text-foreground', className)}>{children}</span>;
}

export function RoleBadge({ value, className }: { value: Role; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn(base, 'border border-border text-muted-foreground', className)}>
      <span className="sr-only">{t('ui.badge.rolePrefix')}</span>
      {t(`roles.${value}`)}
    </span>
  );
}

export function ArchivedBadge({
  permanent = false,
  className,
}: {
  permanent?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = permanent ? IconLock : IconArchive;
  return (
    <span className={cn(base, 'bg-warning-soft text-warning', className)}>
      <Icon aria-hidden="true" size={16} stroke={1.75} />
      {permanent ? t('ui.badge.permanentlyArchived') : t('ui.badge.archived')}
    </span>
  );
}
