import { downloadBlob } from '../../shared/download';

/** Prenos JSON kot datoteke (FR-012-02); skupna izvedba prenosa je v `shared/download.ts`. */
export function downloadJson(data: unknown, fileName: string): void {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}
