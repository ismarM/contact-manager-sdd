import { IconAlertTriangle } from '@tabler/icons-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { errorAlert, focusRing, secondaryButton } from '../../shared/ui/styles';
import { useGroupsApi, useListLanguage } from './api';
import { COLOR_SWATCH } from './colors';
import { PAGE_SIZES, SectionPagination } from './SectionPagination';
import type { GroupSection as Section } from './types';

/**
 * Razdelek zaslona *Skupine* (design.md 9.2, 8.9; FR-002-04): naslov ravni 2 s številom, vrstice z jezičkom, naslovom,
 * skrajšanim opisom in številom kontaktov, lastna paginacija (25/50/100), vidna, ko je skupin več kot 25.
 */
export function GroupSection({ initial }: { initial: Section }) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [section, setSection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const roleName = t(`roles.${section.role}`);

  const load = async (page: number, size: number, focus: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.listGroups({ role: section.role, page, size, lang });
      const next = result.sections[0];
      if (next) setSection(next);
      if (focus) heading.current?.focus();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('groups.sectionHeading', { role: roleName, total: section.total })}
      </h2>
      {failed && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('groups.loadFailed')}</span>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void load(section.page, section.size, false)}
          >
            {t('groups.retry')}
          </button>
        </div>
      )}
      <ul
        aria-busy={busy}
        className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
      >
        {section.items.map((group) => (
          <li key={group.id} className="flex min-w-0 items-start gap-3 p-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-block h-6 w-1 shrink-0 rounded-sm ${COLOR_SWATCH[group.color]}`}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                to={`/groups/${group.id}`}
                className={`truncate rounded-sm font-bold text-foreground underline-offset-4 hover:underline ${focusRing}`}
              >
                {group.title}
              </Link>
              {group.description && (
                <p className="truncate text-muted-foreground">{group.description}</p>
              )}
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              {t('groups.contactCount', { count: group.contactCount })}
            </span>
          </li>
        ))}
      </ul>
      {section.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('groups.pagination.label', { list: roleName })}
          page={section.page}
          size={section.size}
          total={section.total}
          disabled={busy}
          onPage={(page) => void load(page, section.size, true)}
          onSize={(size) => void load(0, size, false)}
        />
      )}
    </section>
  );
}
