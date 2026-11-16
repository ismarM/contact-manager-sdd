// Oblike slik (specs/018-slike/contracts/openapi.yaml).

/** Odgovor na nalaganje ali odstranitev slike; `version` samo pri skupini in kontaktu. */
export interface PhotoResult {
  photoRevision: number | null;
  version?: number;
}

/** Kdo ima sliko; iz tega izhaja pot (`photoPath`). */
export type PhotoTarget =
  | { kind: 'me' }
  | { kind: 'member'; groupId: string; memberId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'contact'; groupId: string; contactId: string };

/** Velikosti, ki jih strežnik izdela (`?size=`). */
export type PhotoSize = 96 | 256 | 512;

/** Koda napake polja `file` pri `400 VALIDATION_FAILED` ali drug pomen napake nalaganja (nginx 413, 429). */
export type ImageErrorCode =
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'FILE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'GOOGLE_PHOTO_UNAVAILABLE'
  | 'generic';
