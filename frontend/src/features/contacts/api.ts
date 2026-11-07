import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type { ContactDetail, ContactInput, ContactPage, TagSuggestions } from './types';

// Odjemalec API kontaktov (plan.md – REST endpoints, contracts/openapi.yaml). OGRODJE: vedenje pride z
// implementacijo (tasks.md T030, T034, T035, T038, T040).

export function createContactsApi(authFetch: AuthFetch) {
  void authFetch;
  const notImplemented = (): never => {
    throw new Error('not implemented');
  };
  return {
    listContacts(groupId: string, page: number, size: number): Promise<ContactPage> {
      void [groupId, page, size];
      return notImplemented();
    },
    getContact(groupId: string, contactId: string): Promise<ContactDetail> {
      void [groupId, contactId];
      return notImplemented();
    },
    createContact(groupId: string, input: ContactInput): Promise<ContactDetail> {
      void [groupId, input];
      return notImplemented();
    },
    updateContact(
      groupId: string,
      contactId: string,
      input: ContactInput & { version: number },
    ): Promise<ContactDetail> {
      void [groupId, contactId, input];
      return notImplemented();
    },
    deleteContact(groupId: string, contactId: string, version: number): Promise<void> {
      void [groupId, contactId, version];
      return notImplemented();
    },
    suggestTags(groupId: string, query: string): Promise<TagSuggestions> {
      void [groupId, query];
      return notImplemented();
    },
  };
}

export type ContactsApi = ReturnType<typeof createContactsApi>;

export function useContactsApi(): ContactsApi {
  const { authFetch } = useAuth();
  return useMemo(() => createContactsApi(authFetch), [authFetch]);
}
