import { http, HttpResponse, type JsonBodyType } from 'msw';

import type {
  AuditAction,
  AuditEntry,
  AuditPage,
  ChangePage,
  ContactChange,
} from '../features/audit/types';
import { ANA, createAuthFake } from './authFake';
import { GROUP_ID, groupDetail, mockGroupsApi, type Reply } from './groupsApi';
import { server } from './msw';
import { mockProfileApi, renderApp } from './renderApp';

// Gradniki odgovorov in MSW rokovalniki za API revizijske sledi (specs/005-revizijska-sled/contracts/openapi.yaml).

/** Edinstven uuid za n-ti testni vnos sledi. */
export function entryId(n: number): string {
  return `0193c4a2-7a1f-7c3e-9b1a-a0d170${n.toString().padStart(6, '0')}`;
}

/**
 * Čas vnosa po design.md §11 (plan.md 005 – Pages and routes, D-47) v časovnem pasu testa: sl »12. 10. 2026, 14.32«,
 * en "12 Oct 2026, 14:32". Dobesedna niza preverja vsaj en test; drugi uporabijo ta pomočnik.
 */
export function formatAuditTime(iso: string, language: 'sl' | 'en'): string {
  const instant = new Date(iso);
  if (language === 'sl') {
    const date = new Intl.DateTimeFormat('sl', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).format(instant);
    const clock = new Intl.DateTimeFormat('sl', {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(instant)
      .replace(':', '.');
    return `${date}, ${clock}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** Vnos sledi; privzeto `CREATE` kontakta »Janez Novak« (Ana Novak). */
export function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: entryId(1),
    createdAt: '2026-10-12T12:32:00Z',
    actor: { name: 'Ana Novak', email: 'ana@primer.si' },
    action: 'CREATE',
    contactCount: 1,
    contactName: 'Janez Novak',
    target: null,
    targetInitial: false,
    ...overrides,
  };
}

/**
 * `count` vnosov, najnovejši prvi: prvi ima oznako `start + count - 1`, zadnji `start`. Vrste dejanj se izmenjujejo
 * (`UPDATE`, `CREATE`, `DELETE`) in vsak vnos ima svoj čas (po eno minuto narazen).
 */
export function auditEntries(count: number, start = 1): AuditEntry[] {
  const actions: AuditAction[] = ['UPDATE', 'CREATE', 'DELETE'];
  const base = Date.parse('2026-10-12T12:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const n = start + count - 1 - i;
    return auditEntry({
      id: entryId(n),
      createdAt: new Date(base + n * 60_000).toISOString(),
      action: actions[n % actions.length] ?? 'UPDATE',
      contactName: `Kontakt ${n.toString().padStart(3, '0')}`,
    });
  });
}

export function contactChange(overrides: Partial<ContactChange> = {}): ContactChange {
  return {
    contactId: '0193c4a2-7a1f-7c3e-9b1a-c0ffee000001',
    displayName: 'Janez Novak',
    kind: 'CHANGED',
    fields: [{ field: 'PHONE', key: null, before: '01 234 5678', after: '031 123 456' }],
    ...overrides,
  };
}

/** Strežnik seznama po pogodbi: `page` (0-osna), `size` in ponovljen `action` režejo dani seznam. */
export function auditPageReply(
  all: AuditEntry[],
  options: {
    latestEntryId?: string | null;
    contactFilter?: AuditPage['contactFilter'];
  } = {},
) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const actions = url.searchParams.getAll('action');
    const matching = actions.length === 0 ? all : all.filter((e) => actions.includes(e.action));
    const body: AuditPage = {
      total: matching.length,
      page,
      size,
      items: matching.slice(page * size, page * size + size),
      latestEntryId:
        options.latestEntryId === undefined ? (all[0]?.id ?? null) : options.latestEntryId,
      contactFilter: options.contactFilter ?? null,
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

/** Strežnik sprememb vnosa: `page` in `size` režeta dani seznam. */
export function changePageReply(all: ContactChange[]) {
  return (_entryId: string, url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: ChangePage = {
      total: all.length,
      page,
      size,
      items: all.slice(page * size, page * size + size),
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

export interface RecordedAuditRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Handler<A extends unknown[]> = (...args: A) => Reply | Promise<Reply>;

/**
 * MSW za API revizijske sledi; zabeleži vse zahtevke. Privzeto: prazna sled z `latestEntryId: null`, branje vnosa
 * `404`, spremembe prazne, rollback `201` z novim vnosom `ROLLBACK`.
 */
export function mockAuditApi(
  handlers: {
    list?: Handler<[URL, string]>;
    entry?: Handler<[string, string]>;
    changes?: Handler<[string, URL, string]>;
    rollback?: Handler<[string, unknown, string]>;
    rollbackInitial?: Handler<[unknown, string]>;
  } = {},
) {
  const requests: RecordedAuditRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedAuditRequest = {
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
  const rollbackEntry = (target: AuditEntry | null): Reply => ({
    status: 201,
    body: auditEntry({
      id: entryId(900),
      action: 'ROLLBACK',
      contactCount: 1,
      target: target ? { entryId: target.id, createdAt: target.createdAt } : null,
      targetInitial: target === null,
    }) as unknown as JsonBodyType,
  });

  server.use(
    http.get('/api/groups/:groupId/audit', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const group = String(params.groupId);
      return respond(handlers.list ? await handlers.list(url, group) : auditPageReply([])(url));
    }),
    http.post('/api/groups/:groupId/audit/initial-state/rollback', async ({ request, params }) => {
      const { body } = await record(request);
      const group = String(params.groupId);
      return respond(
        handlers.rollbackInitial
          ? await handlers.rollbackInitial(body, group)
          : rollbackEntry(null),
      );
    }),
    http.get('/api/groups/:groupId/audit/:entryId/changes', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const id = String(params.entryId);
      const group = String(params.groupId);
      return respond(
        handlers.changes ? await handlers.changes(id, url, group) : changePageReply([])(id, url),
      );
    }),
    http.post('/api/groups/:groupId/audit/:entryId/rollback', async ({ request, params }) => {
      const { body } = await record(request);
      const id = String(params.entryId);
      const group = String(params.groupId);
      return respond(
        handlers.rollback
          ? await handlers.rollback(id, body, group)
          : rollbackEntry(auditEntry({ id })),
      );
    }),
    http.get('/api/groups/:groupId/audit/:entryId', async ({ request, params }) => {
      await record(request);
      const id = String(params.entryId);
      const group = String(params.groupId);
      return respond(handlers.entry ? await handlers.entry(id, group) : { status: 404 });
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

export interface AuditAppOptions {
  /** Vloga prijavljene Ane v skupini `GROUP_ID` (privzeto OWNER). */
  role?: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  archived?: boolean;
  handlers?: Parameters<typeof mockAuditApi>[0];
  groups?: Parameters<typeof mockGroupsApi>[0];
}

/**
 * Aplikacija na dani poti s prijavljeno Ano; `GET /api/groups/{GROUP_ID}` vrne skupino z dano vlogo in stanjem, API
 * sledi in skupin sta posnetka MSW. Vrne zabeležene zahtevke sledi.
 */
export function renderAuditApp(path: string, options: AuditAppOptions = {}) {
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
  const api = mockAuditApi(options.handlers);
  const view = renderApp(path, { gateway: createAuthFake({ user: ANA }) });
  return { ...view, api, groupsApi };
}

export { GROUP_ID };

/**
 * Preklopni element razkritja: `summary` nima vloge ARIA, zato ga test najde prek skupine (`details` ima vlogo
 * `group` in ime iz `summary`) – D-48.
 */
export function summaryOf(group: HTMLElement): HTMLElement {
  const summary = group.querySelector('summary');
  if (!summary) throw new Error('skupina nima elementa summary');
  return summary;
}

/** Odgovor `200` z danim telesom. */
export function ok(body: unknown): Reply {
  return { status: 200, body: body as JsonBodyType };
}

/** Odgovor `201` z danim telesom. */
export function created(body: unknown): Reply {
  return { status: 201, body: body as JsonBodyType };
}
