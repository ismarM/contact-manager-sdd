import { useMemo } from 'react';

import { useAuth } from '../../features/auth/authContext';
import type { AuthFetch } from '../api/authFetch';
import { ApiError } from '../api/client';
import type { ImageErrorCode, PhotoResult, PhotoSize, PhotoTarget } from './photoTypes';

/** Pot slike (relativna na `/api`, kot jo pričakuje `authFetch`), brez poizvedbe. */
export function photoPath(target: PhotoTarget): string {
  switch (target.kind) {
    case 'me':
      return '/me/photo';
    case 'member':
      return `/groups/${target.groupId}/members/${target.memberId}/photo`;
    case 'group':
      return `/groups/${target.groupId}/photo`;
    case 'contact':
      return `/groups/${target.groupId}/contacts/${target.contactId}/photo`;
  }
}

/** Naslov za prenos slike v dani velikosti; `revision` je samo ključ predpomnilnika (strežnik ga prezre). */
export function photoUrl(path: string, size: PhotoSize, revision: number): string {
  return `${path}?size=${size}&v=${revision}`;
}

export interface ImageApi {
  /** `version` je obvezna pri skupini in kontaktu (optimistično zaklepanje), pri lastni sliki je ni. */
  upload(target: PhotoTarget, file: Blob, version?: number): Promise<PhotoResult>;
  /** Lastna slika: `204`, zato vrne `{ photoRevision: null }`; skupina in kontakt: `200 PhotoResult`. */
  remove(target: PhotoTarget, version?: number): Promise<PhotoResult>;
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export function createImageApi(authFetch: AuthFetch): ImageApi {
  return {
    upload: (target, file, version) => {
      const form = new FormData();
      form.append('file', file, `slika.${EXTENSIONS[file.type] ?? 'jpg'}`);
      if (version !== undefined) form.append('version', String(version));
      // Content-Type nastavi brskalnik (meja multipart).
      return authFetch<PhotoResult>(photoPath(target), { method: 'PUT', body: form });
    },
    remove: async (target, version) => {
      const query = version === undefined ? '' : `?version=${version}`;
      const result = await authFetch<PhotoResult | undefined>(`${photoPath(target)}${query}`, {
        method: 'DELETE',
      });
      return result ?? { photoRevision: null };
    },
  };
}

export function useImageApi(): ImageApi {
  const { authFetch } = useAuth();
  return useMemo(() => createImageApi(authFetch), [authFetch]);
}

/** Pomen napake nalaganja za uporabnika (design.md 8.13: brez tehničnih kod). */
export function imageErrorCode(error: unknown): ImageErrorCode {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 413) return 'FILE_TOO_LARGE';
  if (error.status === 429) return 'RATE_LIMITED';
  if (error.status === 409 && error.code === 'GOOGLE_PHOTO_UNAVAILABLE') {
    return 'GOOGLE_PHOTO_UNAVAILABLE';
  }
  if (error.status === 400 && error.body && typeof error.body === 'object') {
    const errors = (error.body as { errors?: unknown }).errors;
    if (Array.isArray(errors)) {
      for (const entry of errors as { field?: unknown; code?: unknown }[]) {
        if (entry.code === 'IMAGE_TOO_LARGE' || entry.code === 'FILE_TOO_LARGE') return entry.code;
        if (entry.field === 'file') return 'INVALID_IMAGE';
      }
    }
  }
  return 'generic';
}
