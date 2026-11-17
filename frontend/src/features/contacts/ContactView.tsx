import { IconAlertTriangle, IconArrowLeft, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Avatar } from '../../shared/images/Avatar';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import {
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  warningAlert,
} from '../../shared/ui/styles';
import { useAuth } from '../auth/authContext';
import { downloadBlob } from '../../shared/download';
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
import { RevertedBadge } from './RevertedBadge';
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
 * atributi in vse značke; akcije samo EDITOR+ v nearhivirani skupini. `404` je pod 1280 px »Te strani ni«, v panelu
 * sporočilo, seznam pa ostane (R-08, FR-004-14).
 */
export function ContactView({ contactId, panel }: { contactId: string; panel: boolean }) {
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

  if (state.kind === 'notFound') {
    if (!panel) return <NotFoundPage />;
    return (
      <div className="flex flex-col gap-3">
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t('contacts.gone')}</span>
        </div>
        <CloseLink to={list} />
      </div>
    );
  }

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
    return showLoader ? <p role="status">{t('contacts.list.loading')}</p> : null;
  }

  const { contact } = state;
  return (
    <article aria-labelledby={`contact-${contact.id}`} className="flex flex-col gap-5">
      {panel ? (
        <CloseLink to={list} />
      ) : (
        <Link to={list} className={`inline-flex items-center gap-1 self-start ${link}`}>
          <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
          {t('contacts.view.back')}
        </Link>
      )}
      <div className="flex min-w-0 items-center gap-4">
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
        <h2 id={`contact-${contact.id}`} className="min-w-0 text-2xl font-bold break-words">
          {contact.displayName}
        </h2>
      </div>

      {contact.reverted && <RevertedBadge info={contact.reverted} />}

      <section aria-labelledby={`history-${contact.id}`} className="flex flex-col gap-1">
        <h3 id={`history-${contact.id}`} className="text-lg font-bold">
          {t('contacts.view.historyHeading')}
        </h3>
        <Link
          to={`/groups/${group.id}/contacts/${contact.id}/history`}
          className={`self-start ${link}`}
        >
          {t('contacts.view.historyLink')}
        </Link>
        <Link
          to={`/groups/${group.id}/audit?contact=${contact.id}`}
          className={`self-start ${link}`}
        >
          {t('contacts.view.auditLink')}
        </Link>
      </section>

      {conflict && (
        <div role="alert" className={warningAlert}>
          <p className="flex gap-2">
            <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
            <span>{conflictMessage(conflict.updatedBy, conflict.updatedAt)}</span>
          </p>
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/groups/${group.id}/contacts/${contact.id}/edit${location.search}`}
            className={primaryButton}
          >
            {t('contacts.view.edit')}
          </Link>
          <DeleteContactDialog
            trigger
            contact={contact}
            onDeleted={() => {
              toast(t('contacts.toast.deleted', { name: contact.displayName }));
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

      <ShareActions contact={contact} />

      {[
        contact.company,
        contact.address,
        contact.addressParts,
        contact.country,
        contact.email,
        contact.phone,
      ].some((value) => value != null) && (
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
      )}

      {contact.attributes.length > 0 && (
        <section aria-labelledby={`attributes-${contact.id}`} className="flex flex-col gap-2">
          <h3 id={`attributes-${contact.id}`} className="text-lg font-bold">
            {t('contacts.view.attributes')}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {contact.attributes.map((attribute) => (
              <div key={attribute.key} className="contents">
                <dt className="font-bold break-words">{attribute.key}</dt>
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
                      address={format.address(attribute.parts ?? attribute.value ?? '', true)}
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {contact.tags.length > 0 && (
        <section aria-labelledby={`tags-${contact.id}`} className="flex flex-col gap-2">
          <h3 id={`tags-${contact.id}`} className="text-lg font-bold">
            {t('contacts.view.tags')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {contact.tags.map((tag) => (
              <li key={tag} className="rounded-sm bg-muted px-2 py-0.5 text-sm">
                {tag}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function CloseLink({ to }: { to: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} className={`inline-flex items-center gap-1 self-start ${link}`}>
      <IconX aria-hidden="true" size={20} stroke={1.75} />
      {t('contacts.view.close')}
    </Link>
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} onClick={() => void download()}>
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
