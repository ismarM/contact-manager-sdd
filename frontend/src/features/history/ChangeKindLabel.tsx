import { IconEqual, IconMinus, IconPencil, IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { ChangeKind } from './types';

export type RowKind = ChangeKind | 'UNCHANGED';

const ICON = {
  ADDED: IconPlus,
  REMOVED: IconMinus,
  CHANGED: IconPencil,
  UNCHANGED: IconEqual,
} as const;

const TONE = {
  ADDED: 'text-success',
  REMOVED: 'text-destructive',
  CHANGED: 'text-warning',
  UNCHANGED: 'text-muted-foreground',
} as const;

/** Vrsta spremembe vedno z ikono in besedilom, nikoli le z barvo (design.md §10; FR-015-09, FR-015-20). */
export function ChangeKindLabel({ kind }: { kind: RowKind }) {
  const { t } = useTranslation();
  const Icon = ICON[kind];
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${TONE[kind]}`}>
      <Icon aria-hidden="true" size={16} stroke={1.75} />
      {t(`history.kind.${kind}`)}
    </span>
  );
}
