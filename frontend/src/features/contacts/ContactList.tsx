import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconDots,
} from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';

import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import {
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  warningAlert,
} from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { SectionPagination } from '../groups/SectionPagination';
import { useDelayed } from '../groups/useDelayed';
import { type ListFailure, listFailure, useContactsApi } from './api';
import { useConflictMessage } from './conflictMessage';
import {
  type ContactQuery,
  type FieldRef,
  serializeQuery,
  toApiParams,
  withChange,
} from './contactQuery';
import { canEditContacts, type ListNotice, listState } from './contactRouting';
import { ContactToolbar } from './ContactToolbar';
import { DeleteContactDialog } from './DeleteContactDialog';
import { selectionParams } from './selection/api';
import { SelectAllOnPage } from './selection/SelectAllOnPage';
import { SelectContact } from './selection/SelectContact';
import { SelectionActionBar, type SelectionNotice } from './selection/SelectionActionBar';
import { useSelection } from './selection/selectionContext';
import type { ContactDetail, ContactPage, ContactSummary } from './types';
import { type UpdateOptions, useContactQuery, useSearchText } from './useContactQuery';

const VISIBLE_TAGS = 3;

/**
 * Stanje branja seznama: izid zadnjega zahtevka (`key`) z zadnjimi uspešnimi podatki, ki ostanejo prikazani med
 * ponovnim branjem in ob neuspehu osvežitve (design.md 8.15). Nalaganje je izpeljano: `key` ni ključ trenutnega zahtevka.
 */
interface ListState {
  key: string | null;
  data: ContactPage | null;
  /** Poizvedba, ki je dala `data`, je imela iskalni niz ali filtre (prazno stanje). */
  filtered: boolean;
  /** Seznam je že vsaj enkrat odgovoril (uspešno ali z neveljavnimi filtri): orodna vrstica je prikazana. */
  answered: boolean;
  failure: Exclude<ListFailure, 'notFound'> | null;
}

function isFiltered(query: ContactQuery): boolean {
  return query.q !== '' || query.conditions.length > 0 || query.tags.length > 0;
}

/** Stanje navigacije na seznam (po izbrisu iz pogleda): ponovno branje in morebitno sporočilo. */
export interface ListNavigationState {
  refresh?: number;
  notice?: ListNotice;
}

/**
 * Seznam kontaktov skupine (FR-004-06, FR-004-07, FR-008-01 … FR-008-17; design.md 8.6, 8.7, 8.9, 9.3): orodna vrstica
 * z iskanjem, filtri in razvrščanjem, preglednica z napisom, ki se pod 640 px vsebnika zloži v kartice (samo CSS), in
 * paginacija. Celotna poizvedba (iskanje, pogoji, značke, razvrstitev, stran, velikost) je v naslovu poti (R-07, R-11);
 * stran onkraj zadnje preusmeri na zadnjo obstoječo. Med ponovnim branjem in ob neuspehu osvežitve ostanejo stari
 * podatki; zastareli odgovor se zavrže.
 */
export function ContactList({ titled, selectedId }: { titled: boolean; selectedId?: string }) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const location = useLocation();
  const { query, update } = useContactQuery();
  const navigation = (location.state ?? null) as ListNavigationState | null;
  const [state, setState] = useState<ListState>({
    key: null,
    data: null,
    filtered: false,
    answered: false,
    failure: null,
  });
  const [gone, setGone] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [notice, setNotice] = useState<ListNotice | null>(navigation?.notice ?? null);
  const [removing, setRemoving] = useState<ContactSummary | null>(null);
  const selection = useSelection();
  const [selectionNotice, setSelectionNotice] = useState<SelectionNotice | null>(null);
  const selectAllBox = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const latest = useRef(0);
  const requested = useRef<string | null>(null);
  // Poizvedba zadnjega zahtevka: naslov se posodobi z zamikom, »Izberi vse zadetke« pa mora zajeti prav tisto, kar je
  // uporabnik pravkar iskal (FR-009-03).
  const latestQuery = useRef(query);
  const mounted = useRef(false);
  const updateRef = useRef(update);
  const heading = useRef<HTMLHeadingElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const focusHeading = useRef(false);
  const headingId = useId();
  const captionId = useId();
  const refresh = navigation?.refresh;
  const requestKey = `${group.id}|${toApiParams(query).toString()}|${reloads}|${refresh ?? ''}`;
  const loading = state.key !== requestKey;
  const failure = loading ? null : state.failure;
  const showLoader = useDelayed(loading);
  const conflictMessage = useConflictMessage();
  const editable = canEditContacts(group);
  const title = t('title.groupScreen', { screen: t('contacts.screen.list'), group: group.title });

  useEffect(() => {
    // Ko je odprt kontakt v panelu, naslov strani določi pogled kontakta.
    if (titled) document.title = title;
  }, [titled, title]);

  // Sporočilo iz navigacije (po izbrisu ali konfliktu) prevzamemo med izrisom, ne v učinku.
  const [seenNotice, setSeenNotice] = useState(navigation?.notice);
  if (navigation?.notice !== seenNotice) {
    setSeenNotice(navigation?.notice);
    if (navigation?.notice) setNotice(navigation.notice);
  }

  // Branje seznama: zadnji zahtevek zmaga, odgovor starejšega se zavrže, njegov zahtevek se prekine. Zahtevek se
  // sproži takoj ob spremembi poizvedbe (`change`), še preden se izris odzove na nov naslov; učinek ga samo zagotovi
  // (naslov iz zunanje navigacije) in ne podvoji.
  const load = useCallback(
    (next: ContactQuery, key: string) => {
      if (requested.current === key) return;
      requested.current = key;
      latestQuery.current = next;
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      const id = ++latest.current;
      api.listContacts(group.id, next, controller.signal).then(
        (data) => {
          if (!mounted.current || id !== latest.current) return;
          const pages = Math.max(1, Math.ceil(data.total / next.size));
          if (next.page > pages) {
            // Stran onkraj zadnje (stara povezava ali izbris zadnjega kontakta strani): zadnja obstoječa stran.
            updateRef.current({ page: pages }, { replace: true });
            return;
          }
          setState({ key, data, filtered: isFiltered(next), answered: true, failure: null });
          if (focusHeading.current) {
            focusHeading.current = false;
            heading.current?.focus();
          }
        },
        (error: unknown) => {
          if (!mounted.current || id !== latest.current) return;
          const kind = listFailure(error);
          if (kind === 'notFound') {
            setGone(true);
            return;
          }
          // Neveljavni filtri: prejšnji zadetki ne ustrezajo več poizvedbi; sicer ostanejo prikazani.
          setState((previous) => ({
            key,
            data: kind === 'invalid' ? null : previous.data,
            filtered: previous.filtered,
            answered: previous.answered || kind === 'invalid',
            failure: kind,
          }));
        },
      );
    },
    [api, group.id],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    updateRef.current = update;
  });
  useEffect(() => {
    load(query, requestKey);
  }, [load, query, requestKey]);

  /** Nova poizvedba: zahtevek steče takoj, naslov in izris sledita (brez podvojenega vnosa, če je naslov enak). */
  const apply = useCallback(
    (next: ContactQuery, options?: UpdateOptions) => {
      if (serializeQuery(next) === serializeQuery(query)) return;
      load(next, `${group.id}|${toApiParams(next).toString()}|${reloads}|${refresh ?? ''}`);
      update(next, options);
    },
    [query, update, load, group.id, reloads, refresh],
  );

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const goTo = (nextPage: number, nextSize: number) => {
    focusHeading.current = true;
    changeQuery(nextSize === query.size ? { page: nextPage } : { size: nextSize });
  };

  const [searchText, setSearchText, flushSearch] = useSearchText(query.q, (q) =>
    apply(withChange(query, { q }), { replace: true }),
  );
  const changeQuery = (change: Partial<ContactQuery>, options?: UpdateOptions) =>
    apply(withChange(query, { ...change, q: flushSearch(change.q) }), options);
  // Besedilo v polju se razlikuje od iskanja v naslovu: seznam se bo osvežil (zakasnitev 300 ms).
  const searchPending = searchText.trim() !== query.q;

  const clearFilters = () => changeQuery({ q: '', conditions: [], tags: [] });
  // Gumb v praznem stanju in opozorilu izgine: fokus preide na iskalno polje (design.md 8.12).
  const clearAndFocus = () => {
    clearFilters();
    searchField.current?.focus();
  };

  const sortBy = (field: FieldRef) =>
    changeQuery(
      query.sort === field
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: field, dir: 'asc' },
    );

  const onDeleted = (name: string) => {
    setRemoving(null);
    setNotice(null);
    toast(t('contacts.toast.deleted', { name }));
    reload();
  };
  const onGone = () => {
    setRemoving(null);
    setNotice({ kind: 'gone' });
    reload();
  };
  const onConflict = (current: ContactDetail) => {
    setRemoving(null);
    setNotice({ kind: 'conflict', updatedBy: current.updatedBy, updatedAt: current.updatedAt });
    reload();
  };

  if (gone) return <NotFoundPage />;

  const data = state.data;
  // Orodna vrstica se pokaže z odgovorom seznama; prazna skupina brez iskanja in filtrov je ne potrebuje.
  const showToolbar =
    state.answered && !(data?.total === 0 && !state.filtered && !isFiltered(query));
  const link = listState(query);
  const base = `/groups/${group.id}/contacts`;
  const pageIds = data?.items.map((contact) => contact.id) ?? [];

  return (
    <section
      aria-labelledby={headingId}
      className={`flex min-w-0 flex-col gap-4 ${selection.count > 0 ? 'pb-28 sm:pb-0' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
          {t('contacts.heading')}
        </h2>
        {editable && data && data.total > 0 && selection.count === 0 && (
          <Link to={`${base}/new${link}`} className={primaryButton}>
            {t('contacts.newContact')}
          </Link>
        )}
      </div>

      {showToolbar && (
        <ContactToolbar
          query={query}
          update={changeQuery}
          searchText={searchText}
          onSearchText={setSearchText}
          total={data?.total ?? null}
          searchRef={searchField}
          onClear={clearFilters}
        />
      )}

      {selection.count > 0 && (
        <SelectionActionBar
          total={data?.total ?? null}
          params={() => selectionParams(latestQuery.current)}
          onNotice={setSelectionNotice}
          onClear={() => {
            selection.clear();
            setSelectionNotice(null);
            selectAllBox.current?.focus();
          }}
          onChanged={reload}
          onDeleted={() => {
            setSelectionNotice(null);
            reload();
            selectAllBox.current?.focus();
          }}
        />
      )}

      {selectionNotice && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>
            {selectionNotice === 'limit'
              ? t('contacts.selection.limit')
              : t('contacts.selection.loadFailed')}
          </span>
        </div>
      )}

      {notice && (
        <div role="alert" className={notice.kind === 'gone' ? errorAlert : warningAlert}>
          <p className="flex gap-2">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>
              {notice.kind === 'gone'
                ? t('contacts.gone')
                : conflictMessage(notice.updatedBy, notice.updatedAt)}
            </span>
          </p>
        </div>
      )}

      {failure === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('contacts.search.loadFailed')}
            <button type="button" className={secondaryButton} onClick={reload}>
              {t('contacts.search.retry')}
            </button>
          </span>
        </div>
      )}

      {failure === 'invalid' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('contacts.search.invalid')}
            <button type="button" className={secondaryButton} onClick={clearAndFocus}>
              {t('contacts.search.clear')}
            </button>
          </span>
        </div>
      )}

      {loading && showLoader && <p role="status">{t('contacts.list.loading')}</p>}

      {data && data.total === 0 && (
        <div className="flex flex-col items-start gap-3 py-4">
          {state.filtered ? (
            <>
              <h3 className="text-lg font-bold">{t('contacts.search.empty')}</h3>
              <button type="button" className={secondaryButton} onClick={clearAndFocus}>
                {t('contacts.search.clear')}
              </button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold">{t('contacts.list.empty')}</h3>
              {editable && (
                <Link to={`${base}/new${link}`} className={primaryButton}>
                  {t('contacts.newContact')}
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div
            role="region"
            aria-labelledby={captionId}
            aria-busy={loading || searchPending ? 'true' : undefined}
            tabIndex={0}
            className={`contacts-list overflow-x-auto ${focusRing}`}
          >
            <table className="w-full border-collapse text-left">
              <caption id={captionId} className="sr-only">
                {t('contacts.list.caption', { group: group.title })}
              </caption>
              <thead className="sticky top-0 bg-card">
                <tr>
                  <td data-select-all className="w-10 border-b border-border p-2">
                    <SelectAllOnPage
                      inputRef={selectAllBox}
                      state={selection.pageState(pageIds)}
                      onChange={(selected) => {
                        setSelectionNotice(
                          selection.setPage(pageIds, selected) === 'limit' ? 'limit' : null,
                        );
                      }}
                    />
                  </td>
                  <SortHeader
                    field="lastName"
                    label={t('contacts.list.name')}
                    query={query}
                    onSort={sortBy}
                  />
                  <SortHeader
                    field="email"
                    label={t('contacts.list.email')}
                    query={query}
                    onSort={sortBy}
                  />
                  <SortHeader
                    field="phone"
                    label={t('contacts.list.phone')}
                    query={query}
                    onSort={sortBy}
                  />
                  <th scope="col" className="border-b border-border p-2">
                    {t('contacts.list.tags')}
                  </th>
                  {editable && (
                    <th scope="col" className="border-b border-border p-2">
                      <span className="sr-only">{t('contacts.list.actions')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((contact) => (
                  <tr
                    key={contact.id}
                    aria-current={contact.id === selectedId ? 'true' : undefined}

                    className={`h-12 border-b border-border hover:bg-muted aria-[current=true]:bg-selected ${selection.isSelected(contact.id) ? 'bg-selected' : ''}`}
                  >
                    <td data-select className="p-2">
                      <SelectContact
                        name={contact.displayName}
                        checked={selection.isSelected(contact.id)}
                        onChange={() => {
                          setSelectionNotice(
                            selection.toggle(contact.id) === 'limit' ? 'limit' : null,
                          );
                        }}
                      />
                    </td>
                    <th scope="row" className="p-2 font-bold break-words">
                      <Link
                        to={`${base}/${contact.id}${link}`}
                        className={`text-primary underline underline-offset-4 ${focusRing}`}
                      >
                        {contact.displayName}
                      </Link>
                      {contact.reverted && (
                        <span className="ml-2 rounded-md border border-border px-2 py-0.5 text-sm text-muted-foreground">
                          {t('contacts.reverted.badge')}
                        </span>
                      )}
                    </th>
                    <td data-label={t('contacts.list.email')} className="p-2 break-all">
                      {contact.email}
                    </td>
                    <td data-label={t('contacts.list.phone')} className="p-2">
                      {contact.phone}
                    </td>
                    <td data-label={t('contacts.list.tags')} className="p-2">
                      {contact.tags.length > 0 && <TagChips tags={contact.tags} />}
                    </td>
                    {editable && (
                      <td data-actions className="p-2 text-right">
                        <RowActions
                          contact={contact}
                          editTo={`${base}/${contact.id}/edit${link}`}
                          onDelete={() => setRemoving(contact)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionPagination
            label={t('contacts.pagination.label')}
            page={query.page - 1}
            size={query.size}
            total={data.total}
            disabled={false}
            onPage={(next) => goTo(next + 1, query.size)}
            onSize={(next) => goTo(1, next)}
          />
        </>
      )}

      {removing && (
        <DeleteContactDialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          contact={removing}
          onDeleted={() => onDeleted(removing.displayName)}
          onGone={onGone}
          onConflict={onConflict}
        />
      )}
    </section>
  );
}

/** Glava stolpca, po katerem je mogoče razvrščati (FR-008-07; design.md 8.6): gumb, `aria-sort` in puščica smeri. */
function SortHeader({
  field,
  label,
  query,
  onSort,
}: {
  field: FieldRef;
  label: string;
  query: ContactQuery;
  onSort: (field: FieldRef) => void;
}) {
  const active = query.sort === field;
  const Icon = !active ? IconArrowsSort : query.dir === 'desc' ? IconArrowDown : IconArrowUp;
  return (
    <th
      scope="col"
      aria-sort={!active ? 'none' : query.dir === 'desc' ? 'descending' : 'ascending'}
      className="border-b border-border p-2"
    >
      <button
        type="button"
        className={`inline-flex min-h-11 items-center gap-1 font-bold ${focusRing}`}
        onClick={() => onSort(field)}
      >
        {label}
        <Icon aria-hidden="true" size={16} stroke={1.75} />
      </button>
    </th>
  );
}

/** Prve tri značke v vrstnem redu vnosa in »+N« za ostale (FR-004-06). */
function TagChips({ tags }: { tags: string[] }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.slice(0, VISIBLE_TAGS).map((tag) => (
        <span key={tag} className="rounded-sm bg-muted px-2 py-0.5 text-sm">
          {tag}
        </span>
      ))}
      {tags.length > VISIBLE_TAGS && (
        <span className="px-1 py-0.5 text-sm text-muted-foreground">
          {t('contacts.list.moreTags', { count: tags.length - VISIBLE_TAGS })}
        </span>
      )}
    </span>
  );
}

/** Meni dejanj vrstice (design.md 8.6): *Uredi kontakt* (povezava) in *Izbriši kontakt*. */
function RowActions({
  contact,
  editTo,
  onDelete,
}: {
  contact: ContactSummary;
  editTo: string;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={t('contacts.list.rowActions', { name: contact.displayName })}
        className={`${secondaryButton} px-2`}
      >
        <IconDots aria-hidden="true" size={20} stroke={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={editTo}>{t('contacts.view.edit')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>{t('contacts.view.delete')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
