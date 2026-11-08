import { IconFilter, IconX } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { focusRing, primaryButton, secondaryButton } from '../../shared/ui/styles';
import { AUDIT_ACTIONS, type AuditAction, type AuditFilters as Filters } from './types';

/**
 * Filtri sledi (design.md 8.7; FR-005-09): razkrivni panel z vrstami dejanj in odstranljive oznake uporabljenih filtrov
 * (vrste in kontakt). Spremembe se zapišejo v pot šele z *Uporabi filtre*.
 */
export function AuditFilters({
  filters,
  contactName,
  onChange,
}: {
  filters: Filters;
  /** Ime kontakta za oznako filtra (`null`: neznan kontakt). */
  contactName: string | null;
  onChange: (filters: Filters) => void;
}) {
  const { t } = useTranslation();
  const panel = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AuditAction[]>(filters.actions);
  const count = filters.actions.length + (filters.contact ? 1 : 0);

  const toggle = () => {
    if (!open) setDraft(filters.actions);
    setOpen(!open);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={secondaryButton}
          aria-expanded={open}
          aria-controls={panel}
          onClick={toggle}
        >
          <IconFilter aria-hidden="true" size={20} stroke={1.75} />
          {count > 0 ? t('audit.filters.toggleCount', { count }) : t('audit.filters.toggle')}
        </button>
        {filters.actions.map((action) => {
          const label = t(`audit.filters.action.${action}`);
          return (
            <button
              key={action}
              type="button"
              aria-label={t('audit.filters.removeAction', { action: label })}
              className={`inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-muted px-3 ${focusRing}`}
              onClick={() =>
                onChange({ ...filters, actions: filters.actions.filter((a) => a !== action) })
              }
            >
              {t('audit.filters.chipAction', { action: label })}
              <IconX aria-hidden="true" size={16} stroke={1.75} />
            </button>
          );
        })}
        {filters.contact && (
          <button
            type="button"
            aria-label={t('audit.filters.removeContact', {
              name: contactName ?? t('audit.filters.unknownContact'),
            })}
            className={`inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-muted px-3 ${focusRing}`}
            onClick={() => onChange({ ...filters, contact: null })}
          >
            {t('audit.filters.chipContact', {
              name: contactName ?? t('audit.filters.unknownContact'),
            })}
            <IconX aria-hidden="true" size={16} stroke={1.75} />
          </button>
        )}
      </div>
      {open && (
        <div id={panel} className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-bold">{t('audit.filters.actionLegend')}</legend>
            {AUDIT_ACTIONS.map((action) => (
              <label key={action} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.includes(action)}
                  onChange={(event) =>
                    setDraft(
                      event.target.checked ? [...draft, action] : draft.filter((a) => a !== action),
                    )
                  }
                  className="size-5 accent-primary"
                />
                {t(`audit.filters.action.${action}`)}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                onChange({ ...filters, actions: AUDIT_ACTIONS.filter((a) => draft.includes(a)) });
                setOpen(false);
              }}
            >
              {t('audit.filters.apply')}
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                onChange({ actions: [], contact: null });
                setOpen(false);
              }}
            >
              {t('audit.filters.clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
