// Oblike odgovorov funkcionalnosti 019 (docs/specs/019-api-kljuci/contracts/openapi.yaml).

export type ApiKeyPermission = 'READ' | 'WRITE';

export type ApiKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export type ApiKeyExpiry = 30 | 90 | 365 | null;

export interface ApiKeyGroup {
  groupId: string;
  title: string;
  permission: ApiKeyPermission;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Prepoznavni del (zadnjih 6 znakov); prikaz `cmk_…xxxxxx`. */
  hint: string;
  allGroups: boolean;
  allGroupsPermission: ApiKeyPermission | null;
  groups: ApiKeyGroup[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: ApiKeyStatus;
  expiringSoon: boolean;
  requestsLast24h: number;
}

export interface ApiKeyCreate {
  name: string;
  allGroups: boolean;
  allGroupsPermission?: ApiKeyPermission;
  groups?: { groupId: string; permission: ApiKeyPermission }[];
  expiresInDays: ApiKeyExpiry;
}

export interface ApiKeyCreated {
  key: ApiKey;
  /** Celoten ključ `cmk_…`; prikazan samo enkrat. */
  token: string;
}

export interface UsageCounts {
  total: number;
  readOk: number;
  writeOk: number;
  errors: number;
  rateLimited: number;
}

export interface ApiKeyUsage {
  days: 7 | 30;
  totals: UsageCounts;
  perDay: (UsageCounts & { day: string })[];
}
