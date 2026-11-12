import { http, HttpResponse, type JsonBodyType } from 'msw';

import type {
  CompareContact,
  DuplicateCategory,
  DuplicateGroup,
  DuplicatePage,
  MergeRequest,
  MergeResponse,
} from '../features/duplicates/types';
import { contactId, GROUP_ID, renderContactsApp, type ContactsAppOptions } from './contactsApi';
import type { Reply } from './groupsApi';
import { server } from './msw';

// Gradniki odgovorov in MSW rokovalniki za API dvojnikov (specs/011-dvojniki/contracts/openapi.yaml).

export { contactId, GROUP_ID };

/** Pot endpointa dvojnikov skupine: `duplicates`, `duplicates/compare` ali `duplicates/merge`. */
export function duplicatesPath(endpoint: '' | 'compare' | 'merge' = '', group = GROUP_ID): string {
  return `/api/groups/${group}/duplicates${endpoint === '' ? '' : `/${endpoint}`}`;
}

/** Skupina dvojnikov z danimi kontakti (id po `contactId(n)`, ime »Kontakt n« ali dano). */
export function duplicateGroup(
  category: DuplicateCategory,
  value: string,
  contacts: { n: number; name?: string }[],
): DuplicateGroup {
  return {
    reason: { category, value },
    size: contacts.length,
    contacts: contacts.map(({ n, name }) => ({
      id: contactId(n),
      displayName: name ?? `Kontakt ${n}`,
    })),
  };
}

/** Odgovor `GET …/duplicates`: `total` je število skupin (privzeto `groups.length`). */
export function duplicatesReply(
  groups: DuplicateGroup[],
  options: { category?: DuplicateCategory; total?: number; page?: number; size?: number } = {},
): Reply {
  const body: DuplicatePage = {
    category: options.category ?? 'email',
    total: options.total ?? groups.length,
    page: options.page ?? 0,
    size: options.size ?? 25,
    groups,
  };
  return { status: 200, body: body as unknown as JsonBodyType };
}

/** Kontakt za primerjavo; privzeto »Janez Novak« z verzijo 0 (vsa polja prazna razen imena in priimka). */
export function compareContact(
  overrides: Partial<CompareContact> & { n?: number } = {},
): CompareContact {
  const { n = 1, ...rest } = overrides;
  return {
    id: contactId(n),
    version: 0,
    createdAt: new Date(Date.parse('2026-11-01T10:00:00Z') + n * 60_000).toISOString(),
    firstName: 'Janez',
    lastName: 'Novak',
    address: null,
    email: null,
    phone: null,
    attributes: [],
    tags: [],
    ...rest,
  };
}

/**
 * Trije kontakti z različnimi polji (A: telefon prazen, B: `041 111 222`, C: `041 333 444`; priimek in e-naslov enaka,
 * atribut `Kompetenca`/`kompetenca`, značke `vip`, `konferenca2025`/`VIP`, `alumni`); verzije 3, 5, 7.
 */
export function compareTrio(): [CompareContact, CompareContact, CompareContact] {
  return [
    compareContact({
      n: 1,
      version: 3,
      firstName: 'Janez',
      lastName: 'Novak',
      address: 'Cesta 1',
      email: 'janez@primer.si',
      phone: null,
      attributes: [{ key: 'Kompetenca', value: 'web dev' }],
      tags: ['vip', 'konferenca2025'],
    }),
    compareContact({
      n: 2,
      version: 5,
      firstName: 'Jan',
      lastName: 'Novak',
      address: null,
      email: 'janez@primer.si',
      phone: '041 111 222',
      attributes: [{ key: 'kompetenca', value: 'java' }],
      tags: ['VIP', 'alumni'],
    }),
    compareContact({
      n: 3,
      version: 7,
      firstName: 'Janko',
      lastName: 'Novak',
      address: 'Cesta 2',
      email: 'janez@primer.si',
      phone: '041 333 444',
    }),
  ];
}

/** `count` kontaktov »Ime1 Novak« … z verzijami 1 … `count` (privzeti kontakt po združitvi je »Ime1 Novak«). */
export function compareSet(count: number): CompareContact[] {
  return Array.from({ length: count }, (_, i) =>
    compareContact({ n: i + 1, version: i + 1, firstName: `Ime${i + 1}`, lastName: 'Novak' }),
  );
}

/** Odgovor `GET …/duplicates/compare`. */
export function compareReply(contacts: CompareContact[]): Reply {
  return { status: 200, body: { contacts } as unknown as JsonBodyType };
}

/** Odgovor `POST …/duplicates/merge` (`200`). */
export function mergeReply(
  kept: Partial<MergeResponse> & { keptDisplayName?: string; mergedCount?: number } = {},
): Reply {
  const body: MergeResponse = {
    keptContactId: contactId(1),
    keptDisplayName: 'Janez Novak',
    mergedCount: 2,
    auditEntryId: '0193c4a2-7a1f-7c3e-9b1a-a0d170000099',
    ...kept,
  };
  return { status: 200, body: body as unknown as JsonBodyType };
}

export function mergeConflict(): Reply {
  return { status: 409, body: { code: 'VERSION_CONFLICT' } };
}

/** `400 VALIDATION_FAILED` z napakami po poljih (npr. `result.firstName` `REQUIRED`). */
export function mergeValidation(...errors: { field: string; code: string }[]): Reply {
  return { status: 400, body: { code: 'VALIDATION_FAILED', errors } };
}

export function mergeServerError(): Reply {
  return { status: 500, body: { code: 'INTERNAL' } };
}

export function groupArchived(): Reply {
  return { status: 409, body: { code: 'GROUP_ARCHIVED' } };
}

export function forbidden(): Reply {
  return { status: 403, body: { code: 'FORBIDDEN' } };
}

type Handler<A extends unknown[]> = (...args: A) => Reply | Promise<Reply>;

function toResponse(reply: Reply) {
  return reply === 'network-error'
    ? HttpResponse.error()
    : HttpResponse.json(reply.body ?? null, { status: reply.status });
}

export interface RecordedDuplicatesRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

/**
 * MSW za API dvojnikov; zabeleži vse zahtevke. Privzeto: iskanje brez zadetkov, primerjava brez kontaktov, združitev
 * `200`. `recordedBody()` vrne telesa zahtevkov `merge` po vrstnem redu.
 */
export function mockDuplicatesApi(
  handlers: {
    search?: Handler<[URL]>;
    compare?: Handler<[string[], URL]>;
    merge?: Handler<[MergeRequest]>;
  } = {},
) {
  const requests: RecordedDuplicatesRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'POST' ? await request.clone().text() : '';
    requests.push({
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      body: text ? (JSON.parse(text) as unknown) : null,
    });
  };
  server.use(
    http.get('/api/groups/:groupId/duplicates', async ({ request }) => {
      await record(request);
      const url = new URL(request.url);
      return toResponse(await (handlers.search?.(url) ?? duplicatesReply([])));
    }),
    http.get('/api/groups/:groupId/duplicates/compare', async ({ request }) => {
      await record(request);
      const url = new URL(request.url);
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter((id) => id !== '');
      return toResponse(await (handlers.compare?.(ids, url) ?? compareReply([])));
    }),
    http.post('/api/groups/:groupId/duplicates/merge', async ({ request }) => {
      await record(request);
      const body = (await request.clone().json()) as MergeRequest;
      return toResponse(await (handlers.merge?.(body) ?? mergeReply()));
    }),
  );
  return {
    requests,
    /** Telesa zahtevkov `POST …/duplicates/merge`, po vrstnem redu. */
    recordedBody(): MergeRequest[] {
      return requests.filter((r) => r.method === 'POST').map((r) => r.body as MergeRequest);
    },
    /** Zahtevki `GET` na dani endpoint (`''` = iskanje, `compare`). */
    gets(endpoint: '' | 'compare' = ''): RecordedDuplicatesRequest[] {
      const path = duplicatesPath(endpoint);
      return requests.filter((r) => r.method === 'GET' && r.path === path);
    },
  };
}

export interface DuplicatesAppOptions extends Omit<ContactsAppOptions, 'contacts'> {
  duplicates?: Parameters<typeof mockDuplicatesApi>[0];
  contacts?: ContactsAppOptions['contacts'];
}

/**
 * Aplikacija na dani poti (`/groups/<GROUP_ID>/duplicates…`) s prijavljeno Ano in vlogo (VIEWER … OWNER) ter
 * arhiviranostjo skupine; API dvojnikov je posnetek MSW. Vrne tudi zabeležene zahtevke dvojnikov (`duplicatesApi`).
 */
export function renderDuplicatesApp(path: string, options: DuplicatesAppOptions = {}) {
  const { duplicates, ...rest } = options;
  const duplicatesApi = mockDuplicatesApi(duplicates);
  const view = renderContactsApp(path, rest);
  return { ...view, duplicatesApi };
}
