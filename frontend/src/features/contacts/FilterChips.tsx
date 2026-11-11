import { IconX } from '@tabler/icons-react';
import { type RefObject, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing } from '../../shared/ui/styles';
import { type AppliedFilter, describeFilter } from './contactQuery';

/**
 * Uporabljeni filtri kot odstranljive oznake (FR-008-11; design.md 8.7). Po odstranitvi fokus preide na naslednjo
 * oznako, sicer na prejšnjo, sicer na gumb *Filtri* – nikoli ne ostane na izginulem elementu.
 */
export function FilterChips({
  filters,
  onRemove,
  fallbackFocus,
}: {
  filters: AppliedFilter[];
  onRemove: (filter: AppliedFilter) => void;
  fallbackFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLUListElement>(null);
  const pending = useRef<number | null>(null);
  const count = filters.length;

  useEffect(() => {
    if (pending.current === null) return;
    const index = pending.current;
    pending.current = null;
    const buttons = list.current?.querySelectorAll('button') ?? [];
    const target = buttons[Math.min(index, buttons.length - 1)];
    (target ?? fallbackFocus.current)?.focus();
  }, [count, fallbackFocus]);

  if (count === 0) return null;
  return (
    <ul ref={list} aria-label={t('contacts.filters.applied')} className="flex flex-wrap gap-2">
      {filters.map((filter, index) => {
        const label = describeFilter(filter, t);
        return (
          <li key={`${filter.kind}:${label}`}>
            <button
              type="button"
              aria-label={t('contacts.filters.remove', { label })}
              className={`inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-muted px-3 break-all ${focusRing}`}
              onClick={() => {
                pending.current = index;
                onRemove(filter);
              }}
            >
              {label}
              <IconX aria-hidden="true" size={16} stroke={1.75} className="shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
