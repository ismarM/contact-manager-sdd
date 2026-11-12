import type { ExportRequest } from '../types';

export interface ExportResult {
  blob: Blob;
  count: number;
  skipped: number;
}

/** `POST …/contacts/export` (010): ogrodje, izvedba sledi po pregledu testov. */
export function exportContacts(groupId: string, request: ExportRequest): Promise<ExportResult> {
  void groupId;
  void request;
  return Promise.reject(new Error('not implemented'));
}
