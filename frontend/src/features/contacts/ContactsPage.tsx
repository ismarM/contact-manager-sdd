import { useParams } from 'react-router';

import { NotFoundPage } from '../../shared/pages/NotFoundPage';
import { ImportPage } from '../import/ImportPage';
import { ContactFormPage } from './ContactFormPage';
import { ContactList } from './ContactList';
import { ContactView } from './ContactView';

type Route =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'import' }
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string }
  | { kind: 'unknown' };

/** Podpot razdelka *Kontakti* (plan.md – Pages and routes); neznana podpot je »Te strani ni«. */
function resolve(section: string): Route {
  const [, id, action, ...rest] = section.split('/');
  if (rest.length > 0) return { kind: 'unknown' };
  if (!id) return { kind: 'list' };
  if (id === 'new') return action === undefined ? { kind: 'new' } : { kind: 'unknown' };
  // 014: uvoz kontaktov (`contacts/import?source=xlsx|vcf`), pred identifikatorjem kontakta.
  if (id === 'import') return action === undefined ? { kind: 'import' } : { kind: 'unknown' };
  // Neveljaven identifikator obravnava strežnik kot kontakt, ki ga ni (404; FR-004-14).
  if (action === undefined) return { kind: 'view', id };
  if (action === 'edit') return { kind: 'edit', id };
  return { kind: 'unknown' };
}

/**
 * Razdelek *Kontakti* skupine (FR-004-06 … FR-004-09): seznam; izbrani kontakt in obrazca *Nov kontakt* ter
 * *Uredi kontakt* so ločene strani.
 */
export function ContactsPage() {
  const params = useParams();
  const route = resolve(params['*'] ?? '');

  if (route.kind === 'unknown') return <NotFoundPage />;
  if (route.kind === 'new') return <ContactFormPage />;
  if (route.kind === 'import') return <ImportPage />;
  if (route.kind === 'edit') return <ContactFormPage contactId={route.id} />;
  if (route.kind === 'view') {
    return (
      <div className="mx-auto w-full max-w-[70ch] px-4 py-6">
        <ContactView key={route.id} contactId={route.id} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <ContactList />
    </div>
  );
}
