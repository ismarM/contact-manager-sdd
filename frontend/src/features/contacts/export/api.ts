import type { AuthFetchBlob } from '../../../shared/api/authFetch';
import type { ExportRequest } from '../types';

export interface ExportResult {
  blob: Blob;
  count: number;
  skipped: number;
}

/** `POST …/contacts/export` (010): datoteka `.xlsx` s številom izvoženih in izpuščenih kontaktov iz glav odgovora. */
export async function exportContacts(
  authFetchBlob: AuthFetchBlob,
  groupId: string,
  request: ExportRequest,
): Promise<ExportResult> {
  const { blob, headers } = await authFetchBlob(`/groups/${groupId}/contacts/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return {
    blob,
    count: Number(headers.get('X-Export-Count') ?? 0),
    skipped: Number(headers.get('X-Export-Skipped') ?? 0),
  };
}
