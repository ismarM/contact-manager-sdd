import type { AuthGateway } from '../../features/auth/AuthGateway';

export type AuthFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Odjemalec API s prijavo (FR-001-07, FR-001-10, research R-06): žeton iz gateway, izguba seje ob manjkajočem
 * uporabniku, nepodaljšljivem žetonu ali 401 – implementacija v T036.
 */
export function createAuthFetch(gateway: AuthGateway, onSessionLost: () => void): AuthFetch {
  throw new Error(`not implemented: ${typeof gateway} ${typeof onSessionLost}`);
}
