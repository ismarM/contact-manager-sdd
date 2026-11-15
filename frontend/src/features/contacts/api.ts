import { useEffect, useMemo, useState } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import { useGroup } from '../groups/groupContext';
import { type ContactQuery, toApiParams } from './contactQuery';
import type {
  ContactDetail,
  ContactFilterOptions,
  ContactInput,
  ContactPage,
  CountryResolution,
  Suggestion,
  SuggestionType,
  Suggestions,
} from './types';

// Odjemalec API kontaktov (plan.md – REST endpoints, contracts/openapi.yaml).

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createContactsApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;
  const contact = (groupId: string, contactId: string) =>
    `${base(groupId)}/contacts/${encodeURIComponent(contactId)}`;
  return {
    listContacts(groupId: string, query: ContactQuery, signal?: AbortSignal): Promise<ContactPage> {
      return authFetch<ContactPage>(`${base(groupId)}/contacts?${toApiParams(query).toString()}`, {
        signal,
      });
    },
    getContact(groupId: string, contactId: string): Promise<ContactDetail> {
      return authFetch<ContactDetail>(contact(groupId, contactId));
    },
    createContact(groupId: string, input: ContactInput): Promise<ContactDetail> {
      return authFetch<ContactDetail>(`${base(groupId)}/contacts`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
    },
    updateContact(
      groupId: string,
      contactId: string,
      input: ContactInput & { version: number },
    ): Promise<ContactDetail> {
      return authFetch<ContactDetail>(contact(groupId, contactId), {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      });
    },
    deleteContact(groupId: string, contactId: string, version: number): Promise<void> {
      const query = new URLSearchParams({ version: String(version) });
      return authFetch<void>(`${contact(groupId, contactId)}?${query.toString()}`, {
        method: 'DELETE',
      });
    },
    contactFilters(groupId: string, signal?: AbortSignal): Promise<ContactFilterOptions> {
      return authFetch<ContactFilterOptions>(`${base(groupId)}/contact-filters`, { signal });
    },
    /** 013: predlogi skupine (`type=key|value|company|tag|country`); `q` in `key` samo, kadar je neprazen. */
    suggestions(
      groupId: string,
      request: SuggestionRequest,
      signal?: AbortSignal,
    ): Promise<Suggestions> {
      const params = new URLSearchParams({ type: request.type });
      if (request.q) params.set('q', request.q);
      if (request.key) params.set('key', request.key);
      return authFetch<Suggestions>(`${base(groupId)}/suggestions?${params.toString()}`, {
        signal,
      });
    },
    /** 013: prepoznavanje držav iz besedila (ni vezano na skupino). */
    resolveCountries(values: string[]): Promise<{ results: CountryResolution[] }> {
      return authFetch<{ results: CountryResolution[] }>('/countries/resolve', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ values }),
      });
    },
  };
}

export interface SuggestionRequest {
  type: SuggestionType;
  q?: string;
  key?: string;
}

export type ContactsApi = ReturnType<typeof createContactsApi>;

export function useContactsApi(): ContactsApi {
  const { authFetch } = useAuth();
  return useMemo(() => createContactsApi(authFetch), [authFetch]);
}

/** Trenutno stanje kontakta iz `409 VERSION_CONFLICT` (sicer `null`). */
export function conflictCurrent(error: unknown): ContactDetail | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'VERSION_CONFLICT') {
    return null;
  }
  const body = error.body;
  return body && typeof body === 'object' && 'current' in body
    ? (body.current as ContactDetail)
    : null;
}

export type FailureKey =
  | 'groups.offline'
  | 'contacts.forbidden'
  | 'contacts.archived'
  | 'contacts.gone'
  | 'contacts.form.saveFailed'
  | 'contacts.delete.failed';

/** Ključ sporočila neuspeha dejanja (design.md 8.13): brez tehničnih kod; omrežna napaka = brez povezave. */
export function failureKey(
  error: unknown,
  fallback: 'contacts.form.saveFailed' | 'contacts.delete.failed',
): FailureKey {
  if (!(error instanceof ApiError)) return 'groups.offline';
  if (error.status === 403) return 'contacts.forbidden';
  if (error.status === 404) return 'contacts.gone';
  if (error.status === 409 && error.code === 'GROUP_ARCHIVED') return 'contacts.archived';
  return fallback;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export type ListFailure = 'invalid' | 'notFound' | 'failed';

/** Razvrstitev napake pri branju seznama: `400 VALIDATION_FAILED` (neveljavni filtri), `404`, sicer neuspeh nalaganja. */
export function listFailure(error: unknown): ListFailure {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.code === 'VALIDATION_FAILED') return 'invalid';
    if (error.status === 404) return 'notFound';
  }
  return 'failed';
}

const SUGGESTION_DELAY_MS = 150;

/**
 * Predlogi za kombinirana polja (FR-013-09 … FR-013-18): ob vklopu (`enabled`, npr. fokus) in ob vsaki spremembi
 * vpisa se po 150 ms pošlje zahtevek, prejšnji se prekliče, zastarel odgovor nikoli ne prepiše novejšega. Napaka je
 * tiha: seznam je prazen in polje deluje kot navadno. `loaded` pove, da je odgovor za trenutni vpis prispel.
 */
export function useSuggestions(
  request: SuggestionRequest,
  enabled: boolean,
): { items: Suggestion[]; loaded: boolean } {
  const api = useContactsApi();
  const { group } = useGroup();
  const { type, q = '', key = '' } = request;
  const [state, setState] = useState<{ scope: string; id: string; items: Suggestion[] } | null>(
    null,
  );
  const scope = `${group.id}|${type}|${key}`;
  const id = `${scope}|${q}`;
  const active = enabled && (type !== 'value' || key !== '');

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.suggestions(group.id, { type, q, key }, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setState({ scope, id, items: result.items });
        },
        () => {
          if (!controller.signal.aborted) setState({ scope, id, items: [] });
        },
      );
    }, SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, api, group.id, type, q, key, scope, id]);

  if (!active || state === null || state.scope !== scope) return { items: [], loaded: false };
  return { items: state.items, loaded: state.id === id };
}

/**
 * Kanonični zapis (FR-013-10): med predlogi skupine poišče zapis z enakim `toLowerCase` kot vpis; napaka ali brez
 * zadetka vrne `null` (strežnik ob shranjevanju vseeno kanonizira).
 */
export function useCanonical(type: 'key' | 'tag'): (text: string) => Promise<string | null> {
  const api = useContactsApi();
  const { group } = useGroup();
  return useMemo(
    () => async (text: string) => {
      const wanted = text.trim();
      if (wanted === '') return null;
      try {
        const result = await api.suggestions(group.id, { type, q: wanted });
        return (
          result.items.find((item) => item.text.toLowerCase() === wanted.toLowerCase())?.text ??
          null
        );
      } catch {
        return null;
      }
    },
    [api, group.id, type],
  );
}
