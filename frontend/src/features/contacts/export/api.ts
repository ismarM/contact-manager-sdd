import type { AuthFetchBlob } from '../../../shared/api/authFetch';
import type { ExportRequest } from '../types';

export interface ExportResult {
  blob: Blob;
  count: number;
  skipped: number;
}

/** `POST …/contacts/export/vcard` (014, FR-014-10): datoteka `.vcf` z enakimi pravili izbora kot izvoz v Excel. */
export async function exportVcard(
  authFetchBlob: AuthFetchBlob,
  groupId: string,
  request: ExportRequest,
): Promise<ExportResult> {
  const { blob, headers } = await authFetchBlob(`/groups/${groupId}/contacts/export/vcard`, {
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

/** `GET …/contacts/{contactId}/vcard` (014, FR-014-10): vizitka enega kontakta. */
export async function contactVcard(
  authFetchBlob: AuthFetchBlob,
  groupId: string,
  contactId: string,
  language: 'sl' | 'en',
): Promise<Blob> {
  const { blob } = await authFetchBlob(
    `/groups/${groupId}/contacts/${contactId}/vcard?language=${language}`,
  );
  return blob;
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
