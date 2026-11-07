import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { ApiError } from '../../shared/api/client';
import { useAuth } from '../auth/authContext';
import type { ContactDetail, ContactInput, ContactPage, TagSuggestions } from './types';

// Odjemalec API kontaktov (plan.md – REST endpoints, contracts/openapi.yaml).

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createContactsApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;
  const contact = (groupId: string, contactId: string) =>
    `${base(groupId)}/contacts/${encodeURIComponent(contactId)}`;
  return {
    listContacts(groupId: string, page: number, size: number): Promise<ContactPage> {
      const query = new URLSearchParams({ page: String(page), size: String(size) });
      return authFetch<ContactPage>(`${base(groupId)}/contacts?${query.toString()}`);
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
    suggestTags(groupId: string, query: string, signal?: AbortSignal): Promise<TagSuggestions> {
      const params = new URLSearchParams({ q: query });
      return authFetch<TagSuggestions>(`${base(groupId)}/tags?${params.toString()}`, { signal });
    },
  };
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
