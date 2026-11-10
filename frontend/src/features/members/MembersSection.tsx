import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorAlert, secondaryButton } from '../../shared/ui/styles';
import { ApiError } from '../../shared/api/client';
import { useListLanguage } from '../groups/api';
import { useGroup } from '../groups/groupContext';
import { PAGE_SIZES, SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { useMembersApi } from './api';
import { MemberCell } from './MemberCell';
import { MemberRow } from './MemberRow';
import type { Members } from './types';

interface Loaded {
  key: string;
  result: Members | null;
}

/**
 * Razdelek *Člani* v *Nastavitvah* (design.md 8.6, 9.7; FR-007-01, FR-007-02): preglednica članov po vlogi in imenu, s
 * paginacijo; meni dejanj samo ob članih, ki jih klicatelj sme upravljati (`canManage` izračuna strežnik). Pod 640 px
 * so vrstice zložene (vsaka celica ima oznako stolpca). Po uspešnem dejanju fokus prevzame naslov razdelka.
 */
export function MembersSection() {
  const { t } = useTranslation();
  const api = useMembersApi();
  const { group, markNotFound } = useGroup();
  const lang = useListLanguage();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  // Vloga klicatelja je v ključu: po prenosu lastništva se seznam sam osveži.
  const key = `${page}:${size}:${tick}:${lang}:${group.role}:${group.archived}`;

  useEffect(() => {
    let active = true;
    api.list(group.id, { page, size, lang }).then(
      (result) => {
        if (active) setLoaded({ key, result });
      },
      (error: unknown) => {
        if (!active) return;
        // Klicatelj ni več član (odstranjen med ogledom): namesto vsebine »Te strani ni« (F1).
        if (error instanceof ApiError && error.status === 404) markNotFound();
        else setLoaded({ key, result: null });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, page, size, lang, key, markNotFound]);

  const focusHeading = useRef(false);
  useEffect(() => {
    if (focusHeading.current && loaded?.key === key) {
      focusHeading.current = false;
      heading.current?.focus();
    }
  }, [loaded, key]);

  const refresh = () => setTick((value) => value + 1);
  const succeeded = () => {
    focusHeading.current = true;
    refresh();
  };

  const loading = loaded?.key !== key;
  const showLoader = useDelayed(loading);
  const result = loaded?.result;
  const cell = 'p-2 max-sm:flex max-sm:gap-2';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {t('members.section.heading')}
      </h2>
      {showLoader && <p role="status">{t('members.section.loading')}</p>}
      {!loading && result === null && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex-1">{t('members.section.loadFailed')}</span>
          <button type="button" className={secondaryButton} onClick={refresh}>
            {t('members.section.retry')}
          </button>
        </div>
      )}
      {result && (
        <table
          aria-label={t('members.table.caption')}
          aria-busy={loading}
          className="w-full border-collapse text-left"
        >
          <thead className="max-sm:sr-only">
            <tr className="border-b border-border">
              <th scope="col" className="p-2">
                {t('members.table.member')}
              </th>
              <th scope="col" className="p-2">
                {t('members.table.email')}
              </th>
              <th scope="col" className="p-2">
                {t('members.table.role')}
              </th>
              <th scope="col" className="p-2">
                {t('members.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.deletedOwner && page === 0 && (
              <tr className="border-b border-border max-sm:block max-sm:py-2">
                <MemberCell label={t('members.table.member')} className={cell}>
                  <em className="text-muted-foreground">{t('members.table.deletedUser')}</em>
                </MemberCell>
                <MemberCell label={t('members.table.email')} className={cell} />
                <MemberCell label={t('members.table.role')} className={cell}>
                  {t('roles.OWNER')}
                </MemberCell>
                <MemberCell label={t('members.table.actions')} className={cell} />
              </tr>
            )}
            {result.items.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                cellClass={cell}
                onSucceeded={succeeded}
                onStale={refresh}
              />
            ))}
          </tbody>
        </table>
      )}
      {result && result.total > PAGE_SIZES[0] && (
        <SectionPagination
          label={t('members.section.pagination')}
          page={result.page}
          size={result.size}
          total={result.total}
          disabled={loading}
          onPage={setPage}
          onSize={(next) => {
            setPage(0);
            setSize(next);
          }}
        />
      )}
    </section>
  );
}
