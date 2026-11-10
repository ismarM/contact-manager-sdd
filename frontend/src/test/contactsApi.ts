import { http, HttpResponse, type JsonBodyType } from 'msw';

import type {
  ContactDetail,
  ContactInput,
  ContactPage,
  ContactSummary,
} from '../features/contacts/types';
import { ANA, createAuthFake } from './authFake';
import { GROUP_ID, groupDetail, mockGroupsApi, type Reply } from './groupsApi';
import { server } from './msw';
import { mockProfileApi, renderApp } from './renderApp';

// Gradniki odgovorov in MSW rokovalniki za API kontaktov (specs/004-kontakti/contracts/openapi.yaml).

export const CONTACT_ID = '0193c4a2-7a1f-7c3e-9b1a-c0ffee000001';

/** Edinstven uuid za n-ti testni kontakt. */
export function contactId(n: number): string {
  return `0193c4a2-7a1f-7c3e-9b1a-c0ffee${n.toString().padStart(6, '0')}`;
}

/** ISO čas danes (lokalni dan) ob dani uri – za opozorila o konfliktu, ki kažejo samo uro (plan 004, kot 002). */
export function todayAt(hour: number, minute: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString();
}

/** ISO čas pred `days` dnevi (lokalni dan) ob dani uri – opozorilo o konfliktu pokaže še datum. */
export function daysAgoAt(days: number, hour: number, minute: number): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - days,
    hour,
    minute,
  ).toISOString();
}

export function contactDetail(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    id: CONTACT_ID,
    firstName: 'Janez',
    lastName: 'Novak',
    displayName: 'Janez Novak',
    address: null,
    email: 'janez@primer.si',
    phone: '01 234 5678',
    attributes: [],
    tags: [],
    version: 2,
    createdAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-05T12:32:00Z',
    updatedBy: { name: 'Ana Novak', email: 'ana@primer.si' },
    ...overrides,
  };
}

export function contactSummary(n: number, overrides: Partial<ContactSummary> = {}): ContactSummary {
  const num = n.toString().padStart(3, '0');
  return {
    id: contactId(n),
    firstName: `Ime${num}`,
    lastName: `Priimek${num}`,
    displayName: `Ime${num} Priimek${num}`,
    email: `kontakt${num}@primer.si`,
    phone: `01 000 ${num}`,
    tags: [],
    version: 0,
    ...overrides,
  };
}

/** `count` kontaktov »Ime001 Priimek001« … (že v privzetem vrstnem redu). */
export function contactSummaries(count: number, start = 1): ContactSummary[] {
  return Array.from({ length: count }, (_, i) => contactSummary(start + i));
}

/** Strežnik seznama po pogodbi: `page` (0-osna) in `size` režeta dani seznam. */
export function contactPageReply(all: ContactSummary[]) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: ContactPage = {
      total: all.length,
      page,
      size,
      items: all.slice(page * size, page * size + size),
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

export function conflictReply(current: ContactDetail): Reply {
  return { status: 409, body: { code: 'VERSION_CONFLICT', current } as unknown as JsonBodyType };
}

export interface RecordedContactRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Handler<A extends unknown[]> = (...args: A) => Reply | Promise<Reply>;

/**
 * MSW za API kontaktov in predlogov značk; zabeleži vse zahtevke. Privzeto: seznam prazen, branje `404`, ustvarjanje
 * `201` z vrnjenim kontaktom iz telesa, urejanje `200` z `version + 1`, izbris `204`, predlogi prazni.
 */
export function mockContactsApi(
  handlers: {
    list?: Handler<[URL, string]>;
    get?: Handler<[string, string]>;
    create?: Handler<[unknown, string]>;
    update?: Handler<[string, unknown, string]>;
    remove?: Handler<[string, URL, string]>;
    tags?: Handler<[URL, string]>;
    /** Možnosti filtrov (008); privzeto prazne. */
    filters?: Handler<[string]>;
  } = {},
) {
  const requests: RecordedContactRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedContactRequest = {
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    requests.push(entry);
    return entry;
  };
  const respond = (reply: Reply) =>
    reply === 'network-error'
      ? HttpResponse.error()
      : reply.body === undefined
        ? new HttpResponse(null, { status: reply.status })
        : HttpResponse.json(reply.body, { status: reply.status });

  server.use(
    http.get('/api/groups/:groupId/contacts', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const group = String(params.groupId);
      return respond(handlers.list ? await handlers.list(url, group) : contactPageReply([])(url));
    }),
    http.post('/api/groups/:groupId/contacts', async ({ request, params }) => {
      const { body } = await record(request);
      const group = String(params.groupId);
      if (handlers.create) return respond(await handlers.create(body, group));
      const input = body as ContactInput;
      const displayName = [input.firstName, input.lastName].filter(Boolean).join(' ');
      return respond({
        status: 201,
        body: contactDetail({
          ...input,
          id: contactId(999),
          displayName,
          version: 0,
        }) as unknown as JsonBodyType,
      });
    }),
    http.get('/api/groups/:groupId/contacts/:contactId', async ({ request, params }) => {
      await record(request);
      return respond(
        handlers.get
          ? await handlers.get(String(params.contactId), String(params.groupId))
          : { status: 404 },
      );
    }),
    http.put('/api/groups/:groupId/contacts/:contactId', async ({ request, params }) => {
      const { body } = await record(request);
      const id = String(params.contactId);
      const group = String(params.groupId);
      if (handlers.update) return respond(await handlers.update(id, body, group));
      const input = body as ContactInput & { version: number };
      return respond({
        status: 200,
        body: contactDetail({
          ...input,
          id,
          displayName: [input.firstName, input.lastName].filter(Boolean).join(' '),
          version: input.version + 1,
        }) as unknown as JsonBodyType,
      });
    }),
    http.delete('/api/groups/:groupId/contacts/:contactId', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const id = String(params.contactId);
      const group = String(params.groupId);
      return respond(handlers.remove ? await handlers.remove(id, url, group) : { status: 204 });
    }),
    http.get('/api/groups/:groupId/contact-filters', async ({ request, params }) => {
      await record(request);
      const group = String(params.groupId);
      return respond(handlers.filters ? await handlers.filters(group) : filterOptionsReply([], []));
    }),
    http.get('/api/groups/:groupId/tags', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const group = String(params.groupId);
      return respond(
        handlers.tags ? await handlers.tags(url, group) : { status: 200, body: { tags: [] } },
      );
    }),
  );

  return {
    requests,
    /** Zahtevki z dano metodo in potjo (brez poizvedbe). */
    of(method: string, path: string) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
  };
}

export interface ContactsAppOptions {
  /** Vloga prijavljene Ane v skupini `GROUP_ID` (privzeto OWNER). */
  role?: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  archived?: boolean;
  contacts?: Parameters<typeof mockContactsApi>[0];
  groups?: Parameters<typeof mockGroupsApi>[0];
}

/**
 * Aplikacija na dani poti s prijavljeno Ano; `GET /api/groups/{GROUP_ID}` vrne skupino z dano vlogo in stanjem, API
 * kontaktov in skupin sta posnetka MSW. Vrne zabeležene zahtevke kontaktov.
 */
export function renderContactsApp(path: string, options: ContactsAppOptions = {}) {
  mockProfileApi();
  const groupsApi = mockGroupsApi({
    get: (id) => ({
      status: 200,
      body: groupDetail({
        id,
        role: options.role ?? 'OWNER',
        archived: options.archived ?? false,
      }) as unknown as JsonBodyType,
    }),
    ...options.groups,
  });
  const api = mockContactsApi(options.contacts);
  const view = renderApp(path, { gateway: createAuthFake({ user: ANA }) });
  return { ...view, api, groupsApi };
}

export { GROUP_ID };

// --- 008: iskanje, filtri, razvrščanje -----------------------------------------------------------------------------

/** Parametri zahtevka seznama, kot jih je poslal vmesnik (nespremenjeni nizi; ponovljivi `f` in `tag` kot seznama). */
export interface RecordedQuery {
  q: string | null;
  f: string[];
  tag: string[];
  sort: string | null;
  dir: string | null;
  page: string | null;
  size: string | null;
}

export function recordedQuery(search: URLSearchParams): RecordedQuery {
  return {
    q: search.get('q'),
    f: search.getAll('f'),
    tag: search.getAll('tag'),
    sort: search.get('sort'),
    dir: search.get('dir'),
    page: search.get('page'),
    size: search.get('size'),
  };
}

/** Zahtevki seznama kontaktov (brez posameznih kontaktov) po vrstnem redu. */
export function listQueries(
  api: ReturnType<typeof mockContactsApi>,
  group = GROUP_ID,
): RecordedQuery[] {
  return api
    .of('GET', `/api/groups/${group}/contacts`)
    .map((request) => recordedQuery(request.search));
}

/** Odgovor seznama z dano vsebino in skupnim številom, ne glede na poizvedbo (zadetke podaja test, ne MSW). */
export function resultsReply(items: ContactSummary[], total = items.length) {
  return (url: URL): Reply => {
    const body: ContactPage = {
      total,
      page: Number(url.searchParams.get('page') ?? 0),
      size: Number(url.searchParams.get('size') ?? 25),
      items,
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

/** Odgovor `contact-filters` (contracts/openapi.yaml – ContactFilterOptions). */
export function filterOptionsReply(keys: string[], tags: string[]): Reply {
  return { status: 200, body: { keys, tags } };
}

/** `400 VALIDATION_FAILED` z napakami po poljih. */
export function validationFailedReply(...errors: { field: string; code: string }[]): Reply {
  return { status: 400, body: { code: 'VALIDATION_FAILED', errors } };
}

/** Obljuba, ki jo test razreši ročno (zakasnjen odgovor za preizkus zastarelih odgovorov). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** `count` značk »znacka0001« … za preizkus velikih seznamov. */
export function manyTags(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `znacka${String(i + 1).padStart(4, '0')}`);
}
