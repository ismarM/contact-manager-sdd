/** Prenos datoteke (FR-012-02, FR-010-10): `Blob` + `<a download>`; ob zaključku se začasni URL sprosti. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Datum v obliki `YYYY-MM-DD` po lokalnem času brskalnika (spec, Predpostavke; ne `toISOString`, ki je UTC). */
export function localDateStamp(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
