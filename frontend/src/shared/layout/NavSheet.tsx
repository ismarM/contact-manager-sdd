import { IconMenu2 } from '@tabler/icons-react';
import { Dialog as Primitive } from 'radix-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { focusRing } from '../ui/styles';
import { Sidebar } from './Sidebar';
import type { NavCounts } from './useNavCounts';

/**
 * Stranska vrstica pod 1024 px kot ploskev z gumbom v zgornji vrstici (design.md 7.1; FR-020-07): enaka vsebina kot
 * stalna vrstica; zapre se z *Esc*, klikom izven ali ob menjavi poti.
 */
export function NavSheet({ counts }: { counts: NavCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Ploskev je odprta samo na poti, na kateri je bila odprta: ob menjavi poti se zapre.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  return (
    <Primitive.Root open={open} onOpenChange={(next) => setOpenPath(next ? pathname : null)}>
      <Primitive.Trigger
        aria-label={t('shell.openNav')}
        className={`flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted pointer-coarse:size-12 ${focusRing}`}
      >
        <IconMenu2 aria-hidden="true" size={24} stroke={1.75} />
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 k-fade-in bg-backdrop" />
        <Primitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 w-[min(var(--k-sidebar-w),85vw)] overflow-y-auto border-r border-border bg-sidebar shadow-lg"
        >
          <Primitive.Title className="sr-only">{t('shell.nav')}</Primitive.Title>
          <Sidebar counts={counts} />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
