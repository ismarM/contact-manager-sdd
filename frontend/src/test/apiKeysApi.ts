import { http, HttpResponse, type JsonBodyType } from 'msw';

import type { ApiKey, ApiKeyCreated, ApiKeyUsage, UsageCounts } from '../features/apikeys/types';
import { server } from './msw';
import { tr } from './smartAttributes';

// Gradniki odgovorov in MSW rokovalniki za upravljanje API ključev 019
// (specs/019-api-kljuci/contracts/openapi.yaml): `GET|POST /api/me/api-keys`, `DELETE /api/me/api-keys/{keyId}`,
// `GET /api/me/api-keys/{keyId}/usage?days=7|30`.

/** Odgovor: status s telesom ali brez, ali omrežna napaka (zahtevek ne dobi odgovora). */
export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

/** Odgovor ali funkcija, ki ga izračuna (zaporedna številka klica od 1; lahko je asinhrona za `aria-busy` teste). */
export type ReplySource<Args extends unknown[] = []> =
  Reply | ((call: number, ...args: Args) => Reply | Promise<Reply>);

export const UUID_PREFIX = '0193c4a2-7a1f-7c3e-9b1a-';
export const KLUB_ID = `${UUID_PREFIX}00000000c1b0`;

/** Ključ n z edinstvenim uuid. */
export const keyId = (n: number) => `${UUID_PREFIX}${n.toString(16).padStart(12, 'a')}`;

/** Aktiven ključ »Nočni izvoz« za skupino Klub (samo branje, 90 dni, še ni uporabljen). */
export function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: keyId(1),
    name: 'Nočni izvoz',
    hint: 'x7Qa9Z',
    allGroups: false,
    allGroupsPermission: null,
    groups: [{ groupId: KLUB_ID, title: 'Klub', permission: 'READ' }],
    createdAt: '2026-11-16T08:00:00Z',
    expiresAt: '2027-02-14T08:00:00Z',
    lastUsedAt: null,
    revokedAt: null,
    status: 'ACTIVE',
    expiringSoon: false,
    requestsLast24h: 0,
    ...overrides,
  };
}

/** Očitno lažen žeton ključa (ni JWT, ni podpisa); konča se z namigom `x7Qa9Z`. */
export const TOKEN = ['cmk_fake', 'fake', 'x7Qa9Z'].join('.');

export function apiKeyCreated(key: ApiKey = apiKey(), token: string = TOKEN): ApiKeyCreated {
  return { key, token };
}

const counts = (
  readOk: number,
  writeOk: number,
  errors: number,
  rateLimited: number,
): UsageCounts => ({
  total: readOk + writeOk + errors + rateLimited,
  readOk,
  writeOk,
  errors,
  rateLimited,
});

/**
 * Statistika za obdobje, ki se konča z dnem `lastDay`; `perDay` poda števila po dnevih od najnovejšega nazaj
 * (manjkajoči dnevi so 0, kot jih zapolni zaledje).
 */
export function usage(
  days: 7 | 30,
  perDay: [readOk: number, writeOk: number, errors: number, rateLimited: number][] = [],
  lastDay = '2026-11-16',
): ApiKeyUsage {
  const end = new Date(`${lastDay}T00:00:00Z`);
  const rows = Array.from({ length: days }, (_, index) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const [readOk, writeOk, errors, rateLimited] = perDay[days - 1 - index] ?? [0, 0, 0, 0];
    return { day: day.toISOString().slice(0, 10), ...counts(readOk, writeOk, errors, rateLimited) };
  });
  const totals = rows.reduce(
    (sum, row) =>
      counts(
        sum.readOk + row.readOk,
        sum.writeOk + row.writeOk,
        sum.errors + row.errors,
        sum.rateLimited + row.rateLimited,
      ),
    counts(0, 0, 0, 0),
  );
  return { days, totals, perDay: rows };
}

/** Pripravljeni odgovori po pogodbi. */
export const replies = {
  list: (keys: ApiKey[] = [apiKey()]): Reply => ({
    status: 200,
    body: keys as unknown as JsonBodyType,
  }),
  created: (created: ApiKeyCreated = apiKeyCreated()): Reply => ({
    status: 201,
    body: created as unknown as JsonBodyType,
  }),
  revoked: { status: 204 } satisfies Reply,
  usage: (data: ApiKeyUsage = usage(7)): Reply => ({
    status: 200,
    body: data as unknown as JsonBodyType,
  }),
  limit: { status: 409, body: { code: 'API_KEY_LIMIT' } } satisfies Reply,
  groupNotFound: { status: 404, body: { code: 'NOT_FOUND' } } satisfies Reply,
  notFound: { status: 404, body: { code: 'NOT_FOUND' } } satisfies Reply,
  validation: (field: string, code: string): Reply => ({
    status: 400,
    body: { code: 'VALIDATION_FAILED', errors: [{ field, code }] },
  }),
  serverError: { status: 500, body: { code: 'INTERNAL' } } satisfies Reply,
  unauthenticated: { status: 401, body: { code: 'UNAUTHENTICATED' } } satisfies Reply,
  networkError: 'network-error' as const,
};

export interface RecordedApiKeyRequest {
  method: string;
  path: string;
  search: string;
  authorization: string | null;
  body: unknown;
}

const respond = (reply: Reply) =>
  reply === 'network-error'
    ? HttpResponse.error()
    : reply.body === undefined
      ? new HttpResponse(null, { status: reply.status })
      : HttpResponse.json(reply.body, { status: reply.status });

/**
 * MSW za upravljanje API ključev; zabeleži vse zahtevke. Privzeto: seznam z enim ključem, ustvarjanje `201`, preklic
 * `204`, statistika brez zahtev za zahtevano obdobje.
 */
export function mockApiKeysApi(
  handlers: {
    list?: ReplySource;
    create?: ReplySource<[body: unknown]>;
    revoke?: ReplySource<[keyId: string]>;
    usage?: ReplySource<[keyId: string, days: number]>;
  } = {},
) {
  const requests: RecordedApiKeyRequest[] = [];
  const calls = { list: 0, create: 0, revoke: 0, usage: 0 };
  const record = async (request: Request): Promise<RecordedApiKeyRequest> => {
    const text =
      request.method === 'GET' || request.method === 'DELETE' ? '' : await request.clone().text();
    const url = new URL(request.url);
    const entry: RecordedApiKeyRequest = {
      method: request.method,
      path: url.pathname,
      search: url.search,
      authorization: request.headers.get('Authorization'),
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    requests.push(entry);
    return entry;
  };
  const resolve = async <Args extends unknown[]>(
    source: ReplySource<Args> | undefined,
    fallback: Reply,
    call: number,
    ...args: Args
  ): Promise<Reply> => {
    if (source === undefined) return fallback;
    return typeof source === 'function' ? await source(call, ...args) : source;
  };

  server.use(
    http.get('/api/me/api-keys', async ({ request }) => {
      await record(request);
      calls.list += 1;
      return respond(await resolve(handlers.list, replies.list(), calls.list));
    }),
    http.post('/api/me/api-keys', async ({ request }) => {
      const { body } = await record(request);
      calls.create += 1;
      return respond(await resolve(handlers.create, replies.created(), calls.create, body));
    }),
    http.delete('/api/me/api-keys/:keyId', async ({ request, params }) => {
      await record(request);
      calls.revoke += 1;
      return respond(
        await resolve(handlers.revoke, replies.revoked, calls.revoke, String(params.keyId)),
      );
    }),
    http.get('/api/me/api-keys/:keyId/usage', async ({ request, params }) => {
      await record(request);
      calls.usage += 1;
      const days = Number(new URL(request.url).searchParams.get('days') ?? '7');
      const fallback = replies.usage(usage(days === 30 ? 30 : 7));
      return respond(
        await resolve(handlers.usage, fallback, calls.usage, String(params.keyId), days),
      );
    }),
  );

  return {
    requests,
    /** Zahtevki z dano metodo in potjo. */
    of(method: string, path: string) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
    createRequests: () =>
      requests.filter((r) => r.method === 'POST' && r.path === '/api/me/api-keys'),
    revokeRequests: () => requests.filter((r) => r.method === 'DELETE'),
    usageRequests: () => requests.filter((r) => r.path.endsWith('/usage')),
  };
}

/** Dostopna imena razdelka *API ključi* iz prevodov (konstitucija §3.3). */
export const apiKeyNames = {
  section: () => tr('apiKeys.heading'),
  list: () => tr('apiKeys.list'),
  create: () => tr('apiKeys.create'),
  dialog: () => tr('apiKeys.form.title'),
  name: () => tr('apiKeys.form.nameLabel'),
  scopeSelected: () => tr('apiKeys.form.scopeSelected'),
  scopeAll: () => tr('apiKeys.form.scopeAll'),
  groups: () => tr('apiKeys.form.groupsLabel'),
  permissionFor: (title: string) => tr('apiKeys.form.permissionFor', { title }),
  permissionAll: () => tr('apiKeys.form.permissionLabel'),
  permission: (permission: 'READ' | 'WRITE') => tr(`apiKeys.permission.${permission}`),
  expiry: () => tr('apiKeys.form.expiryLabel'),
  submit: () => tr('apiKeys.form.submit'),
  cancel: () => tr('apiKeys.form.cancel'),
  created: (name: string) => tr('apiKeys.createdDialog.title', { name }),
  key: () => tr('apiKeys.createdDialog.keyLabel'),
  copy: () => tr('apiKeys.createdDialog.copy'),
  close: () => tr('apiKeys.createdDialog.close'),
  revoke: (name: string) => tr('apiKeys.revoke.button', { name }),
  revokeDialog: (name: string) => tr('apiKeys.revoke.title', { name }),
  revokeConfirm: () => tr('apiKeys.revoke.confirm'),
  revokeCancel: () => tr('apiKeys.revoke.cancel'),
  docsLink: () => tr('apiKeys.docsLink'),
  usageLink: (name: string) => tr('apiKeys.usageLink', { name }),
};
