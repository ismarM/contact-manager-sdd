import { isKnownAction, type AuditAction, type AuditFilters } from './types';

// Stanje seznama sledi v naslovu poti (plan.md 005 – Pages and routes): stran (1-osna), velikost, ponovljen action,
// contact, actor. Privzete vrednosti se ne zapišejo, neveljavne se prezrejo.

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 25;

/** Žeton izvajalca, ki je izbrisan uporabnik (015). */
export const DELETED_ACTOR = 'deleted';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditView {
  page: number;
  size: number;
  filters: AuditFilters;
  /** `?contact=` ali `?actor=` ni veljavna vrednost: prikaže se prazno stanje filtrov brez zahtevka. */
  contactInvalid: boolean;
}

export function readAuditView(params: URLSearchParams): AuditView {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  const actions = [...new Set(params.getAll('action'))].filter((a): a is AuditAction =>
    isKnownAction(a),
  );
  const contact = params.get('contact');
  const actor = params.get('actor');
  const actorValid = actor === null || actor === DELETED_ACTOR || UUID.test(actor);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
    filters: {
      actions,
      contact: contact && UUID.test(contact) ? contact : null,
      actor: actor && actorValid ? actor : null,
    },
    contactInvalid: (contact !== null && !UUID.test(contact)) || !actorValid,
  };
}

/** Poizvedba brez privzetih vrednosti. */
export function auditSearch(page: number, size: number, filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (size !== DEFAULT_SIZE) params.set('size', String(size));
  for (const action of filters.actions) params.append('action', action);
  if (filters.contact) params.set('contact', filters.contact);
  if (filters.actor) params.set('actor', filters.actor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function hasFilters(filters: AuditFilters, contactInvalid: boolean): boolean {
  return (
    filters.actions.length > 0 ||
    filters.contact !== null ||
    filters.actor !== null ||
    contactInvalid
  );
}
