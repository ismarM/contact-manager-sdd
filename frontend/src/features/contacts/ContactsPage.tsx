import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { PANEL, useMediaQuery } from '../../shared/lib/useMediaQuery';
import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { ContactFormPage } from './ContactFormPage';
import { ContactList } from './ContactList';
import { ContactView } from './ContactView';

type Route =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'unknown' };

/** Podpot razdelka *Kontakti* (plan.md – Pages and routes); neznana podpot je »Te strani ni«. */
function resolve(section: string): Route {
  const [, id, action, ...rest] = section.split('/');
  if (rest.length > 0) return { kind: 'unknown' };
  if (!id) return { kind: 'list' };
  if (id === 'new') return action === undefined ? { kind: 'new' } : { kind: 'unknown' };
  // Neveljaven identifikator obravnava strežnik kot kontakt, ki ga ni (404; FR-004-14).
  if (action === undefined) return { kind: 'view', id };
  if (action === 'edit') return { kind: 'edit', id };
  return { kind: 'unknown' };
}

/**
 * Razdelek *Kontakti* skupine (FR-004-06 … FR-004-09): seznam; od 1280 px izbran kontakt v panelu desno od seznama
 * (design.md 7.2), sicer na ločeni strani; obrazca *Nov kontakt* in *Uredi kontakt* sta ločeni strani.
 */
export function ContactsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const panel = useMediaQuery(PANEL);
  const route = resolve(params['*'] ?? '');

  if (route.kind === 'unknown') return <NotFoundPage />;
  if (route.kind === 'new') return <ContactFormPage />;
  if (route.kind === 'edit') return <ContactFormPage contactId={route.id} />;
  if (route.kind === 'view' && !panel) {
    return (
      <div className="mx-auto w-full max-w-[70ch] px-4 py-6">
        <ContactView key={route.id} contactId={route.id} panel={false} />
      </div>
    );
  }

  const selected = route.kind === 'view' ? route.id : undefined;
  return (
    <div className="flex gap-6 px-4 py-6">
      <div className="min-w-0 flex-1">
        <ContactList titled={selected === undefined} selectedId={selected} />
      </div>
      {selected !== undefined && (
        <section
          aria-label={t('contacts.view.panel')}
          className="w-[420px] shrink-0 border-l border-border pl-6"
        >
          <ContactView key={selected} contactId={selected} panel />
        </section>
      )}
    </div>
  );
}
