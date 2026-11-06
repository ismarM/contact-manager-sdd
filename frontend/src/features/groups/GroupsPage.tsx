import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { errorAlert, secondaryButton } from '../../shared/ui/styles';
import { useGroupsApi, useListLanguage } from './api';
import { GroupSection } from './GroupSection';
import { NewGroupDialog } from './NewGroupDialog';
import { PAGE_SIZES } from './SectionPagination';
import type { GroupSection as Section } from './types';
import { useDelayed } from './useDelayed';

interface Loaded {
  key: string;
  sections: Section[] | null;
}

/**
 * Zaslon *Skupine* na `/` (design.md 9.2; FR-002-04, -05, -09, -13): moje nearhivirane skupine v razdelkih po vlogi,
 * prazno stanje z akcijo *Nova skupina*, nalaganje in napaka nalaganja s ponovnim poskusom.
 */
export function GroupsPage() {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const lang = useListLanguage();
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${lang}:${tick}`;
  useDocumentTitle(t('title.groups'));

  useEffect(() => {
    let active = true;
    api.listGroups({ size: PAGE_SIZES[0], lang }).then(
      (result) => {
        if (active) setLoaded({ key, sections: result.sections });
      },
      () => {
        if (active) setLoaded({ key, sections: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, lang, key]);

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const sections = loaded?.sections;
  const empty = !loading && sections?.length === 0;

  return (
    <div className="mx-auto flex max-w-[80ch] flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('groups.heading')}</h1>
        {sections && sections.length > 0 && <NewGroupDialog />}
      </div>
      {showLoader && <p role="status">{t('groups.loading')}</p>}
      {loading && !sections && (
        <ul aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <li key={row} aria-hidden="true" className="h-14 rounded-lg bg-muted" />
          ))}
        </ul>
      )}
      {!loading && sections === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('groups.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={() => setTick((v) => v + 1)}>
            {t('groups.retry')}
          </button>
        </div>
      )}
      {empty && (
        <section className="flex flex-col items-start gap-3">
          <h2 className="text-xl font-bold">{t('groups.empty')}</h2>
          <NewGroupDialog />
        </section>
      )}
      {sections?.map((section) => (
        <GroupSection key={`${section.role}:${loaded?.key ?? ''}`} initial={section} />
      ))}
    </div>
  );
}
