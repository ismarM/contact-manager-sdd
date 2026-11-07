import { IconAlertTriangle, IconArrowLeft, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import {
  errorAlert,
  focusRing,
  primaryButton,
  secondaryButton,
  warningAlert,
} from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { isNotFound, useContactsApi } from './api';
import { useConflictMessage } from './conflictMessage';
import { canEditContacts } from './contactRouting';
import type { ListNavigationState } from './ContactList';
import { DeleteContactDialog } from './DeleteContactDialog';
import type { ContactDetail } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; contact: ContactDetail };

const link = `text-primary underline underline-offset-4 ${focusRing}`;

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
      <h2 id={`contact-${contact.id}`} className="text-2xl font-bold break-words">
        {contact.displayName}
      </h2>

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

      {(contact.address ?? contact.email ?? contact.phone) !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {contact.address !== null && (
            <>
              <dt className="font-bold">{t('contacts.view.address')}</dt>
              <dd className="break-words whitespace-pre-line">{contact.address}</dd>
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
                  {contact.phone}
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
                <dd className="break-words whitespace-pre-line">{attribute.value}</dd>
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
