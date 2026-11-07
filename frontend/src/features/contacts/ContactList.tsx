import { IconAlertTriangle, IconDots } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { toast } from 'sonner';

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
import { useContactsApi } from './api';
import { useConflictMessage } from './conflictMessage';
import { canEditContacts, listSearch, type ListNotice, readPaging } from './contactRouting';
import { DeleteContactDialog } from './DeleteContactDialog';
import type { ContactDetail, ContactPage, ContactSummary } from './types';

const VISIBLE_TAGS = 3;

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: ContactPage };

/** Stanje navigacije na seznam (po izbrisu iz pogleda): ponovno branje in morebitno sporočilo. */
export interface ListNavigationState {
  refresh?: number;
  notice?: ListNotice;
}

/**
 * Seznam kontaktov skupine (FR-004-06, FR-004-07; design.md 8.6, 8.9, 9.3): preglednica z napisom, ki se pod 640 px
 * vsebnika zloži v kartice (samo CSS), paginacija v naslovu poti (`page` 1-osna, `size`; privzeti vrednosti se ne
 * pišeta), stran onkraj zadnje preusmeri na zadnjo obstoječo (R-11). Med ponovnim branjem ostanejo stari podatki.
 */
export function ContactList({ titled, selectedId }: { titled: boolean; selectedId?: string }) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { page, size } = readPaging(params);
  const navigation = (location.state ?? null) as ListNavigationState | null;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [notice, setNotice] = useState<ListNotice | null>(navigation?.notice ?? null);
  const [removing, setRemoving] = useState<ContactSummary | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const headingId = useId();
  const captionId = useId();
  const showLoader = useDelayed(state.kind === 'loading');
  const conflictMessage = useConflictMessage();
  const editable = canEditContacts(group);
  const refresh = navigation?.refresh;
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

  useEffect(() => {
    let active = true;
    api.listContacts(group.id, page - 1, size).then(
      (data) => {
        if (!active) return;
        const pages = Math.max(1, Math.ceil(data.total / size));
        if (page > pages) {
          // Stran onkraj zadnje (stara povezava ali izbris zadnjega kontakta strani): zadnja obstoječa stran.
          setParams(listSearch(pages, size), { replace: true });
          return;
        }
        setState({ kind: 'ready', data });
        if (focusHeading.current) {
          focusHeading.current = false;
          heading.current?.focus();
        }
      },
      () => {
        if (active) setState({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, page, size, reloads, refresh, setParams]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const goTo = (nextPage: number, nextSize: number) => {
    focusHeading.current = true;
    setParams(listSearch(nextPage, nextSize));
  };

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

  const data = state.kind === 'ready' ? state.data : null;
  const query = location.search;
  const base = `/groups/${group.id}/contacts`;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
          {t('contacts.heading')}
        </h2>
        {editable && data && data.total > 0 && (
          <Link to={`${base}/new`} className={primaryButton}>
            {t('contacts.newContact')}
          </Link>
        )}
      </div>

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

      {state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('contacts.list.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                reload();
              }}
            >
              {t('contacts.list.retry')}
            </button>
          </span>
        </div>
      )}

      {state.kind === 'loading' && showLoader && <p role="status">{t('contacts.list.loading')}</p>}

      {data && data.total === 0 && (
        <div className="flex flex-col items-start gap-3 py-4">
          <h3 className="text-lg font-bold">{t('contacts.list.empty')}</h3>
          {editable && (
            <Link to={`${base}/new`} className={primaryButton}>
              {t('contacts.newContact')}
            </Link>
          )}
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div
            role="region"
            aria-labelledby={captionId}
            tabIndex={0}
            className={`contacts-list overflow-x-auto ${focusRing}`}
          >
            <table className="w-full border-collapse text-left">
              <caption id={captionId} className="sr-only">
                {t('contacts.list.caption', { group: group.title })}
              </caption>
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th scope="col" className="border-b border-border p-2">
                    {t('contacts.list.name')}
                  </th>
                  <th scope="col" className="border-b border-border p-2">
                    {t('contacts.list.email')}
                  </th>
                  <th scope="col" className="border-b border-border p-2">
                    {t('contacts.list.phone')}
                  </th>
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
                    className="h-12 border-b border-border hover:bg-muted aria-[current=true]:bg-selected"
                  >
                    <th scope="row" className="p-2 font-bold break-words">
                      <Link
                        to={`${base}/${contact.id}${query}`}
                        className={`text-primary underline underline-offset-4 ${focusRing}`}
                      >
                        {contact.displayName}
                      </Link>
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
                          editTo={`${base}/${contact.id}/edit${query}`}
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
            page={page - 1}
            size={size}
            total={data.total}
            disabled={false}
            onPage={(next) => goTo(next + 1, size)}
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
