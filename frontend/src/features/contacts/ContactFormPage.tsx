import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { errorAlert, focusRing, secondaryButton, warningAlert } from '../../shared/ui/styles';
import { useGroup } from '../groups/groupContext';
import { useDelayed } from '../groups/useDelayed';
import { isNotFound, useContactsApi } from './api';
import { canEditContacts } from './contactRouting';
import { ContactForm } from './ContactForm';
import type { ContactDetail } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'notFound' }
  | { kind: 'ready'; contact: ContactDetail };

const link = `inline-flex items-center gap-1 self-start text-primary underline underline-offset-4 ${focusRing}`;

/**
 * Stran *Nov kontakt* (brez `contactId`) in *Uredi kontakt* (FR-004-01, -10): obrazec samo za EDITOR+ v nearhivirani
 * skupini, sicer razlaga in povezava na seznam (FR-004-17); kontakt, ki ga ni, je »Te strani ni« (FR-004-14).
 */
export function ContactFormPage({ contactId }: { contactId?: string }) {
  const { t } = useTranslation();
  const api = useContactsApi();
  const { group } = useGroup();
  const location = useLocation();
  const editable = canEditContacts(group);
  const [state, setState] = useState<State>(contactId ? { kind: 'loading' } : { kind: 'failed' });
  const [reloads, setReloads] = useState(0);
  const showLoader = useDelayed(state.kind === 'loading');
  const list = `/groups/${group.id}/contacts${location.search}`;

  useEffect(() => {
    if (!contactId || !editable) return undefined;
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
  }, [api, group.id, contactId, editable, reloads]);

  useDocumentTitle(
    t('title.groupScreen', {
      screen: t(contactId ? 'contacts.screen.edit' : 'contacts.screen.new'),
      group: group.title,
    }),
  );

  if (!editable) {
    const archived = group.archived;
    return (
      <div className="mx-auto flex w-full max-w-[70ch] flex-col gap-4 px-4 py-6">
        <div role="status" className={warningAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span>{t(archived ? 'contacts.archived' : 'contacts.noEditRole')}</span>
        </div>
        <Link to={list} className={link}>
          <IconArrowLeft aria-hidden="true" size={20} stroke={1.75} />
          {t('contacts.view.back')}
        </Link>
      </div>
    );
  }

  if (contactId && state.kind === 'notFound') return <NotFoundPage />;

  const headingId = 'contact-form-heading';
  return (
    <div className="mx-auto flex w-full max-w-[70ch] flex-col gap-5 px-4 py-6">
      <h2 id={headingId} className="text-2xl font-bold">
        {t(contactId ? 'contacts.form.editHeading' : 'contacts.form.newHeading')}
      </h2>
      {!contactId && <ContactForm labelledBy={headingId} />}
      {contactId && state.kind === 'ready' && (
        <ContactForm key={state.contact.id} contact={state.contact} labelledBy={headingId} />
      )}
      {contactId && state.kind === 'loading' && showLoader && (
        <p role="status">{t('contacts.list.loading')}</p>
      )}
      {contactId && state.kind === 'failed' && (
        <div role="alert" className={errorAlert}>
          <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
          <span className="flex flex-wrap items-center gap-3">
            {t('contacts.view.loadFailed')}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setState({ kind: 'loading' });
                setReloads((n) => n + 1);
              }}
            >
              {t('contacts.list.retry')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
