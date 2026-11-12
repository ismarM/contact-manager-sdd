import type { AuthGateway } from '../../features/auth/AuthGateway';
import { ApiError, apiFetch, apiFetchBlob, type BlobResponse } from './client';

export type AuthFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Kot {@link AuthFetch}, vendar uspešen odgovor ni JSON, temveč datoteka (010, izvoz). */
export type AuthFetchBlob = (path: string, init?: RequestInit) => Promise<BlobResponse>;

/**
 * Odjemalec API s prijavo (FR-001-07, FR-001-10, research R-06): vsak zahtevek nosi ID žeton trenutnega uporabnika.
 * Če uporabnika ni več (odjava v drugem zavihku) ali žetona ni mogoče podaljšati, se zahtevek ne pošlje; ob tem in ob
 * odgovoru 401 se pokliče `onSessionLost`. Omrežna napaka seje ne konča.
 */
export function createAuthFetch(gateway: AuthGateway, onSessionLost: () => void): AuthFetch {
  return <T>(path: string, init?: RequestInit): Promise<T> =>
    authorized(gateway, onSessionLost, path, init, apiFetch<T>);
}

export function createAuthFetchBlob(
  gateway: AuthGateway,
  onSessionLost: () => void,
): AuthFetchBlob {
  return (path, init) => authorized(gateway, onSessionLost, path, init, apiFetchBlob);
}

async function authorized<R>(
  gateway: AuthGateway,
  onSessionLost: () => void,
  path: string,
  init: RequestInit | undefined,
  send: (path: string, init?: RequestInit) => Promise<R>,
): Promise<R> {
  let token: string | null;
  try {
    token = await gateway.getIdToken();
  } catch {
    token = null;
  }
  if (!token) {
    onSessionLost();
    throw new ApiError(401, 'UNAUTHENTICATED');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  try {
    return await send(path, { ...init, headers });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) onSessionLost();
    throw error;
  }
}
