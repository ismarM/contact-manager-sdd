import { LoadingState } from '../../shared/ui/Skeleton';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDownload,
  IconHistory,
  IconPencil,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Avatar } from '../../shared/images/Avatar';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { COLOR_SWATCH } from '../groups/colors';
import {
  backLink,
  card,
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  softButton,
  warningAlert,
} from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { downloadBlob } from '../../shared/download';
import { localCalendarDate } from '../formats/formatDate';
import { useFormatters } from '../formats/useFormatters';
import { useGroup } from '../groups/groupContext';
import { ShowOnMapButton } from '../map/ShowOnMapButton';
import { useDelayed } from '../groups/useDelayed';
import { isNotFound, useContactsApi } from './api';
import { useConflictMessage } from './conflictMessage';
import { canEditContacts } from './contactRouting';
import type { ListNavigationState } from './ContactList';
import { DeleteContactDialog } from './DeleteContactDialog';
import { countryName } from './countries';
import { contactVcard } from './export/api';
import { contactFileName, QrShareDialog } from './qr/QrShareDialog';
import type { ContactDetail } from './types';
import { useUiLanguage } from './useUiLanguage';
import { TypedValueView } from './typed/TypedValueView';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; contact: ContactDetail };

const link = `text-primary underline decoration-1 underline-offset-[3px] ${focusRing}`;

/** `tel:` brez presledkov in ločil, z ohranjenim vodilnim `+`. */
function telHref(phone: string): string {
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;
}

/**
 * Pogled kontakta (FR-004-08, design.md 9.4): ime kot naslov, polja kot seznam opisov (`mailto:`, `tel:`), dodatni
 * atributi in vse značke; akcije samo EDITOR+ v nearhivirani skupini. `404` je »Te strani ni« (R-08, FR-004-14).
 */
export function ContactView({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloads, setReloads] = useState(0);
  const [conflict, setConflict] = useState<ContactDetail | null>(null);
  const language = useUiLanguage();
  const format = useFormatters();
  const showLoader = useDelayed(state.kind === 'loading');
  const conflictMessage = useConflictMessage();
  const editable = canEditContacts(group);
  const list = `/groups/${group.id}/contacts${location.search}`;

  useEffect(() => {
    let active = true;
    api.getContact(group.id, contactId).then(
      (contact) => {
        if (active) setState({ kind: 'ready', contact });
      },
      (error: unknown) => {
        if (active) setState({ kind: isNotFound(error) ? 'notFound' : 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [api, group.id, contactId, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const screen = state.kind === 'ready' ? state.contact.displayName : t('contacts.screen.list');
  useDocumentTitle(t('title.groupScreen', { screen, group: group.title }));

  const toList = (navigation: ListNavigationState) =>
    void navigate(list, { state: { ...navigation, refresh: Date.now() } });

  if (state.kind === 'notFound') return <NotFoundPage />;

  if (state.kind === 'failed') {
    return (
      <div role="alert" className={errorAlert}>
        <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
        <span className="flex flex-wrap items-center gap-3">
          {t('contacts.view.loadFailed')}
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
    );
  }

  if (state.kind === 'loading') {
    return showLoader ? <LoadingState label={t('contacts.list.loading')} /> : null;
  }

  const { contact } = state;
  const hasFields = [
    contact.company,
    contact.address,
    contact.addressParts,
    contact.country,
    contact.email,
    contact.phone,
  ].some((value) => value != null);
  const who = contact.updatedBy
    ? (contact.updatedBy.name ?? contact.updatedBy.email)
    : t('contacts.conflict.deletedUser');
  const sections = hasFields || contact.attributes.length > 0 || contact.tags.length > 0;
  return (
    <article
      aria-labelledby={`contact-${contact.id}`}
      className={`flex flex-col gap-4 ${editable ? 'pb-[calc(var(--k-bottom-bar-h)+5rem)] sm:pb-0' : ''}`}
    >
      <Link to={list} className={`inline-flex items-center gap-1 self-start ${backLink}`}>
        <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
        {t('contacts.view.back')}
      </Link>

      {conflict && (
        <div role="alert" className={warningAlert}>
          <p className="flex gap-2">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{conflictMessage(conflict.updatedBy, conflict.updatedAt)}</span>
          </p>
        </div>
      )}

      <section className={`${card} overflow-hidden`}>
        <div aria-hidden="true" className={`h-1.5 sm:h-2 ${COLOR_SWATCH[group.color]}`} />
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Avatar
              kind="contact"
              name={contact.displayName}
              colorSeed={contact.id}
              size={64}
              alt=""
              photo={{
                path: `/groups/${group.id}/contacts/${contact.id}/photo`,
                revision: contact.photoRevision,
              }}
            />
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <h2 id={`contact-${contact.id}`} className="text-2xl font-bold break-words">
                {contact.displayName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('contacts.view.meta', {
                  // design.md 8.6a: datum (ne trenutek ISO) po izbrani obliki zapisa (FR-016-16).
                  created: format.date(localCalendarDate(contact.createdAt)),
                  updated: format.date(localCalendarDate(contact.updatedAt)),
                  who,
                })}
              </p>
            </div>
            {editable && (
              <div className="flex items-center gap-2">
                {/* Na telefonu je *Uredi kontakt* v spodnji vrstici akcij nad spodnjo vrstico (FR-020-18). */}
                <div className="fixed inset-x-0 bottom-[calc(var(--k-bottom-bar-h)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-popover p-3 sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0">
                  <Link
                    to={`/groups/${group.id}/contacts/${contact.id}/edit${location.search}`}
                    className={`${primaryButton} w-full sm:w-auto`}
                  >
                    <IconPencil aria-hidden="true" size={20} stroke={1.75} />
                    {t('contacts.view.edit')}
                  </Link>
                </div>
                <DeleteContactDialog
                  trigger
                  contact={contact}
                  onDeleted={() => {
                    toast.success(t('contacts.toast.deleted', { name: contact.displayName }));
                    toList({});
                  }}
                  onGone={() => toList({ notice: { kind: 'gone' } })}
                  onConflict={(current) => {
                    // Pogled se osveži s trenutnim stanjem s strežnika; izbris je mogoče ponovno potrditi.
                    setConflict(current);
                    reload();
                  }}
                />
              </div>
            )}
          </div>
          <ShareActions contact={contact} />
        </div>
      </section>

      {sections && (
        <div className="grid items-start gap-4 sm:grid-cols-2 sm:gap-6">
          {hasFields && (
            <section
              aria-labelledby={`fields-${contact.id}`}
              className={`${card} flex flex-col gap-3 p-4 sm:p-6`}
            >
              <h3 id={`fields-${contact.id}`} className="text-lg font-bold">
                {t('contacts.view.fields')}
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {contact.company != null && (
                  <>
                    <dt className="font-bold">{t('contacts.view.company')}</dt>
                    <dd className="break-words">{contact.company}</dd>
                  </>
                )}
                {(contact.address != null || contact.addressParts != null) && (
                  <>
                    <dt className="font-bold">{t('contacts.view.address')}</dt>
                    <dd className="break-words">
                      <span className="whitespace-pre-line">
                        {format.address(contact.addressParts ?? contact.address ?? '')}
                      </span>
                      <ShowOnMapButton
                        groupId={group.id}
                        contactId={contact.id}
                        name={t('contacts.view.address')}
                        address={format.address(contact.addressParts ?? contact.address ?? '')}
                      />
                    </dd>
                  </>
                )}
                {contact.country != null && (
                  <>
                    <dt className="font-bold">{t('contacts.view.country')}</dt>
                    <dd>{countryName(contact.country, language)}</dd>
                  </>
                )}
                {contact.email !== null && (
                  <>
                    <dt className="font-bold">{t('contacts.view.email')}</dt>
                    <dd className="break-all">
                      <a href={`mailto:${contact.email}`} className={link}>
                        {contact.email}
                      </a>
                    </dd>
                  </>
                )}
                {contact.phone !== null && (
                  <>
                    <dt className="font-bold">{t('contacts.view.phone')}</dt>
                    <dd>
                      <a href={telHref(contact.phone)} className={link}>
                        {format.phone(contact.phone)}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          )}

          {(contact.attributes.length > 0 || contact.tags.length > 0) && (
            <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
              {contact.attributes.length > 0 && (
                <section
                  aria-labelledby={`attributes-${contact.id}`}
                  className={`${card} flex flex-col gap-3 p-4 sm:p-6`}
                >
                  <h3 id={`attributes-${contact.id}`} className="text-lg font-bold">
                    {t('contacts.view.attributes')}
                  </h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    {contact.attributes.map((attribute) => (
                      <div key={attribute.key} className="contents">
                        <dt className="font-mono break-words text-muted-foreground">
                          {attribute.key}
                        </dt>
                        <dd className="break-words">
                          <TypedValueView
                            type={attribute.type}
                            value={attribute.value ?? ''}
                            parts={attribute.parts}
                          />
                          {attribute.type === 'ADDRESS' && (
                            <ShowOnMapButton
                              groupId={group.id}
                              contactId={contact.id}
                              attributeKey={attribute.key}
                              name={attribute.key}
                              address={format.address(
                                attribute.parts ?? attribute.value ?? '',
                                true,
                              )}
                            />
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {contact.tags.length > 0 && (
                <section
                  aria-labelledby={`tags-${contact.id}`}
                  className={`${card} flex flex-col gap-3 p-4 sm:p-6`}
                >
                  <h3 id={`tags-${contact.id}`} className="text-lg font-bold">
                    {t('contacts.view.tags')}
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {contact.tags.map((tag) => (
                      <li key={tag} className="rounded-xs bg-muted px-2 py-0.5 text-sm">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      <section
        aria-labelledby={`history-${contact.id}`}
        className={`${card} flex flex-col gap-3 p-4 sm:p-6`}
      >
        <h3 id={`history-${contact.id}`} className="text-lg font-bold">
          {t('contacts.view.historyHeading')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('contacts.view.historyText')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/groups/${group.id}/contacts/${contact.id}/history`}
            className={secondaryButton}
          >
            <IconHistory aria-hidden="true" size={20} stroke={1.75} />
            {t('contacts.view.historyLink')}
          </Link>
          <Link to={`/groups/${group.id}/audit?contact=${contact.id}`} className={link}>
            {t('contacts.view.auditLink')}
          </Link>
        </div>
      </section>
    </article>
  );
}

/**
 * Deljenje kontakta (014, FR-014-10, -14): *Prenesi vizitko (.vcf)* in *Deli s kodo QR* za vse člane, tudi v arhivirani
 * skupini. Napaka prenosa je vidna (design.md 8.13).
 */
function ShareActions({ contact }: { contact: ContactDetail }) {
  const { t } = useTranslation();
  const { authFetchBlob } = useAuth();
  const { group } = useGroup();
  const language = useUiLanguage();
  const [failed, setFailed] = useState(false);
  const download = async () => {
    setFailed(false);
    try {
      const blob = await contactVcard(authFetchBlob, group.id, contact.id, language);
      downloadBlob(blob, `${contactFileName(contact, language)}.vcf`);
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={softButton} onClick={() => void download()}>
          <IconDownload aria-hidden="true" size={20} stroke={1.75} />
          {t('contacts.vcard.download')}
        </button>
        <QrShareDialog contact={contact} onDownloadVcard={() => void download()} />
      </div>
      {failed && (
        <p role="alert" className={errorAlert}>
          {t('contacts.vcard.failed')}
        </p>
      )}
    </div>
  );
}
