import { http, HttpResponse, type JsonBodyType } from 'msw';

import type { Actor, AuditEntry } from '../features/audit/types';
import type {
  Comparison,
  ContactStateView,
  DeletedItem,
  DeletedPage,
  Duplicate,
  History,
  HistoryEvent,
  RestorePreview,
  Version,
} from '../features/history/types';
import { i18n } from '../i18n';
import {
  auditEntry,
  entryId,
  type AuditAppOptions,
  mockAuditApi,
  ok,
  renderAuditApp,
} from './auditApi';
import { CONTACT_ID } from './contactsApi';
import type { Reply } from './groupsApi';
import { server } from './msw';

// Gradniki odgovorov in MSW rokovalniki za API zgodovine kontakta, različic, obnove in izbrisanih kontaktov
// (specs/015-napredna-revizija/contracts/openapi.yaml).

export { entryId, formatAuditTime, GROUP_ID } from './auditApi';
export { CONTACT_ID };

/**
 * Prevod v trenutnem jeziku testa: imena elementov v testih so vedno iz prevodov (konstitucija §3.3), zato sprememba
 * besedila pomeni en popravek.
 */
export const tr = i18n.t.bind(i18n);

export const ANA = { name: 'Ana Novak', email: 'ana@primer.si' };
export const BORIS = { name: 'Boris Kranjc', email: 'boris@primer.si' };

export function stateView(overrides: Partial<ContactStateView> = {}): ContactStateView {
  return {
    firstName: 'Janez',
    lastName: 'Novak',
    address: null,
    email: 'janez@primer.si',
    phone: '01 234 5678',
    company: null,
    country: null,
    attributes: [],
    tags: [],
    version: 2,
    ...overrides,
  };
}

/** Dogodek zgodovine: privzeto `UPDATE` telefona kontakta »Janez Novak« (Ana Novak), stanje po dogodku obstaja. */
export function historyEvent(n: number, overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    entryId: entryId(n),
    createdAt: new Date(Date.parse('2026-10-12T12:00:00Z') + n * 60_000).toISOString(),
    actor: ANA,
    action: 'UPDATE',
    kind: 'CHANGED',
    entryContactCount: 1,
    displayName: 'Janez Novak',
    fields: [{ field: 'PHONE', key: null, before: '01 234 5678', after: '031 123 456' }],
    hasVersion: true,
    target: null,
    targetInitial: false,
    mergedInto: null,
    ...overrides,
  };
}

/** `count` dogodkov, najnovejši prvi (oznake `count` … 1). */
export function historyEvents(count: number): HistoryEvent[] {
  return Array.from({ length: count }, (_, i) => historyEvent(count - i));
}

export function history(items: HistoryEvent[], overrides: Partial<History['contact']> = {}) {
  return {
    contact: {
      id: CONTACT_ID,
      displayName: 'Janez Novak',
      status: 'ACTIVE' as const,
      version: 3,
      lastEntryId: items[0]?.entryId ?? null,
      hasInitial: false,
      ...overrides,
    },
    items,
  };
}

/** Strežnik zgodovine po pogodbi: `page` (0-osna) in `size` režeta dani seznam. */
export function historyReply(all: HistoryEvent[], contact: Partial<History['contact']> = {}) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: History = {
      ...history(all, contact),
      total: all.length,
      page,
      size,
      items: all.slice(page * size, page * size + size),
    };
    return ok(body);
  };
}

export function version(ref: string, overrides: Partial<Version> = {}): Version {
  return {
    ref,
    createdAt: ref === 'initial' || ref === 'current' ? null : '2026-10-12T12:32:00Z',
    actor: ANA,
    action: ref === 'initial' || ref === 'current' ? null : 'UPDATE',
    state: stateView(),
    ...overrides,
  };
}

export function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return {
    from: version(entryId(1)),
    to: version('current'),
    changes: [],
    ...overrides,
  };
}

export function restorePreview(overrides: Partial<RestorePreview> = {}): RestorePreview {
  return {
    target: version(entryId(1)),
    changes: [{ field: 'PHONE', key: null, before: '031 123 456', after: '01 234 5678' }],
    status: 'ACTIVE',
    restorable: true,
    reason: null,
    currentVersion: 3,
    lastEntryId: entryId(5),
    duplicates: [],
    ...overrides,
  };
}

export function duplicate(overrides: Partial<Duplicate> = {}): Duplicate {
  return {
    contactId: '0193c4a2-7a1f-7c3e-9b1a-c0ffee0000d1',
    displayName: 'Janez Novak (drugi)',
    reason: 'EMAIL',
    ...overrides,
  };
}

export function deletedItem(n: number, overrides: Partial<DeletedItem> = {}): DeletedItem {
  const num = n.toString().padStart(3, '0');
  return {
    contactId: `0193c4a2-7a1f-7c3e-9b1a-c0ffee${num.padStart(6, '0')}`,
    displayName: `Izbrisan ${num}`,
    email: `izbrisan${num}@primer.si`,
    company: `Podjetje ${num}`,
    removedAt: new Date(Date.parse('2026-10-12T12:00:00Z') + n * 60_000).toISOString(),
    removedBy: ANA,
    entryId: entryId(n),
    reason: 'DELETED',
    restorable: true,
    mergedInto: null,
    ...overrides,
  };
}

/**
 * Strežnik izbrisanih po pogodbi: `q` (brez razlike velikosti črk), `state`, `page` in `size` režejo dani seznam.
 * Seznam naj bo najnovejši prvi.
 */
export function deletedReply(all: DeletedItem[]) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const state = url.searchParams.get('state') ?? 'all';
    const matching = all.filter(
      (item) =>
        (state === 'all' ||
          (state === 'merged' ? item.reason === 'MERGED' : item.reason !== 'MERGED')) &&
        (q === '' ||
          [item.displayName, item.email, item.company].some((value) =>
            value?.toLowerCase().includes(q),
          )),
    );
    const body: DeletedPage = {
      total: matching.length,
      page,
      size,
      items: matching.slice(page * size, page * size + size),
    };
    return ok(body);
  };
}

export function restoreEntry(overrides: Partial<AuditEntry> = {}): Reply {
  return {
    status: 201,
    body: auditEntry({
      id: entryId(901),
      action: 'RESTORE',
      ...overrides,
    }) as unknown as JsonBodyType,
  };
}

export function actor(id: string, kind: Actor['kind'], user: Actor['user']): Actor {
  return { id, kind, user };
}

export interface RecordedHistoryRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Handler<A extends unknown[]> = (...args: A) => Reply | Promise<Reply>;

/**
 * MSW za API zgodovine kontakta (015); zabeleži vse zahtevke. Privzeto: prazna zgodovina, različica in primerjava `404`,
 * predogled obnove obnovljiv, obnova `201`, brez izbrisanih kontaktov.
 */
export function mockHistoryApi(
  handlers: {
    history?: Handler<[URL, string]>;
    version?: Handler<[string, string]>;
    compare?: Handler<[URL, string]>;
    preview?: Handler<[URL, string]>;
    restore?: Handler<[unknown, string]>;
    deleted?: Handler<[URL]>;
  } = {},
) {
  const requests: RecordedHistoryRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedHistoryRequest = {
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
    http.get('/api/groups/:groupId/contacts/:contactId/history', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      return respond(
        handlers.history
          ? await handlers.history(url, String(params.contactId))
          : historyReply([])(url),
      );
    }),
    http.get(
      '/api/groups/:groupId/contacts/:contactId/versions/:ref',
      async ({ request, params }) => {
        await record(request);
        const ref = String(params.ref);
        return respond(
          handlers.version
            ? await handlers.version(ref, String(params.contactId))
            : { status: 404 },
        );
      },
    ),
    http.get('/api/groups/:groupId/contacts/:contactId/compare', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      return respond(
        handlers.compare ? await handlers.compare(url, String(params.contactId)) : { status: 404 },
      );
    }),
    http.get(
      '/api/groups/:groupId/contacts/:contactId/restore-preview',
      async ({ request, params }) => {
        await record(request);
        const url = new URL(request.url);
        return respond(
          handlers.preview
            ? await handlers.preview(url, String(params.contactId))
            : ok(restorePreview()),
        );
      },
    ),
    http.post('/api/groups/:groupId/contacts/:contactId/restore', async ({ request, params }) => {
      const { body } = await record(request);
      return respond(
        handlers.restore ? await handlers.restore(body, String(params.contactId)) : restoreEntry(),
      );
    }),
    http.get('/api/groups/:groupId/deleted-contacts', async ({ request }) => {
      await record(request);
      const url = new URL(request.url);
      return respond(handlers.deleted ? await handlers.deleted(url) : deletedReply([])(url));
    }),
  );

  return {
    requests,
    /** Zahtevki z dano metodo in potjo (brez poizvedbe); pot se konča z `suffix`. */
    of(method: string, suffix: string) {
      return requests.filter((r) => r.method === method && r.path.endsWith(suffix));
    },
  };
}

export interface HistoryAppOptions extends Omit<AuditAppOptions, 'handlers'> {
  history?: Parameters<typeof mockHistoryApi>[0];
  audit?: Parameters<typeof mockAuditApi>[0];
}

/** Aplikacija na dani poti s prijavljeno Ano; API zgodovine in sledi sta posnetka MSW. */
export function renderHistoryApp(path: string, options: HistoryAppOptions = {}) {
  const api = mockHistoryApi(options.history);
  const view = renderAuditApp(path, {
    role: options.role,
    archived: options.archived,
    groups: options.groups,
    handlers: options.audit,
  });
  return { ...view, history: api };
}
