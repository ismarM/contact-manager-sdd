import { IconSearch } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Chip } from '../../shared/ui/Chip';
import { card, textInput } from '../../shared/ui/styles';
import { ROLES, type Role } from './types';

/** Zakasnitev vnosa pred poizvedbo (FR-017-18). */
const DEBOUNCE_MS = 300;
export const MAX_QUERY_LENGTH = 100;

/**
 * Orodna vrstica zbirke skupin (FR-020-11): iskanje po nazivu (`role=search`) in čipi vlog *Vse vloge*, *Lastnik*,
 * *Admin*, *Urednik*, *Bralec* (ena vloga naenkrat, `aria-pressed`). Stanje je v URL (starš); vnos besedila se v URL
 * prenese z zakasnitvijo.
 */
export function GroupToolbar({
  q,
  role,
  onSearch,
  onRole,
}: {
  q: string;
  role: Role | undefined;
  onSearch: (q: string) => void;
  onRole: (role: Role | null) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [text, setText] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  // URL se je spremenil od zunaj (počisti, nazaj): vnos sledi, razen med tipkanjem (obrezan niz je enak).
  if (q !== seenQ) {
    setSeenQ(q);
    if (text.trim() !== q) setText(q);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = setTimeout(() => onSearch(next), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  return (
    <div
      role="search"
      aria-label={t('groups.search.label')}
      className={`${card} flex flex-wrap items-end gap-x-6 gap-y-4 p-4 md:p-5`}
    >
      <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {t('groups.search.label')}
        </label>
        <span className="relative block">
          <IconSearch
            aria-hidden="true"
            size={18}
            stroke={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={inputId}
            type="search"
            value={text}
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            placeholder={t('groups.search.placeholder')}
            onChange={(event) => setText(event.target.value)}
            className={`${textInput} pl-10`}
          />
        </span>
      </div>
      <div role="group" aria-label={t('groups.search.rolesLegend')} className="flex flex-col gap-1">
        <span aria-hidden="true" className="text-sm font-semibold">
          {t('groups.search.rolesLegend')}
        </span>
        <div className="flex flex-wrap gap-2">
          <Chip active={role === undefined} onClick={() => onRole(null)}>
            {t('groups.search.allRoles')}
          </Chip>
          {ROLES.map((value) => (
            <Chip key={value} active={role === value} onClick={() => onRole(value)}>
              {t(`roles.${value}`)}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
