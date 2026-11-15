import { useMemo } from 'react';

import type { AuthFetch } from '../../shared/api/authFetch';
import { useAuth } from '../auth/authContext';
import type {
  Candidate,
  ImportCards,
  ImportContact,
  ImportSheet,
  ImportSource,
  PreviewRow,
} from './types';

/** Odjemalec API uvoza (014, plan.md – REST endpoints). */
export function createImportApi(authFetch: AuthFetch) {
  const base = (groupId: string) => `/groups/${groupId}/imports`;
  return {
    parse: (groupId: string, file: File, format: ImportSource, language: 'sl' | 'en') => {
      const form = new FormData();
      form.append('file', file);
      // `format` in `language` sta v poizvedbi (zaledje ju bere kot parametra zahtevka, enako kot polji multipart).
      const query = new URLSearchParams({ format, language });
      return authFetch<ImportSheet | ImportCards>(`${base(groupId)}/parse?${query}`, {
        method: 'POST',
        body: form,
      });
    },
    preview: (groupId: string, candidates: Candidate[]) =>
      authFetch<{ rows: PreviewRow[] }>(`${base(groupId)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
      }),
    commit: (groupId: string, source: ImportSource, contacts: ImportContact[]) =>
      authFetch<{ created: number; auditEntryId: string }>(base(groupId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, contacts }),
      }),
  };
}

export type ImportApi = ReturnType<typeof createImportApi>;

export function useImportApi(): ImportApi {
  const { authFetch } = useAuth();
  return useMemo(() => createImportApi(authFetch), [authFetch]);
}
