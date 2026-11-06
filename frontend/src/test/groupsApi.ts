import { http, HttpResponse, type JsonBodyType } from 'msw';

import {
  type GroupDetail,
  type GroupSection,
  type GroupSummary,
  type Role,
  ROLES,
} from '../features/groups/types';
import { ANA, createAuthFake } from './authFake';
import { server } from './msw';
import { mockProfileApi, renderApp } from './renderApp';

// Gradniki odgovorov in MSW rokovalniki za API skupin (specs/002-skupine/contracts/openapi.yaml).

export const GROUP_ID = '0193c4a2-7a1f-7c3e-9b1a-3d2f4e5a6b7c';

/** Edinstven uuid za n-to testno skupino. */
export function groupId(n: number): string {
  return `0193c4a2-7a1f-7c3e-9b1a-${n.toString().padStart(12, '0')}`;
}

export function groupDetail(overrides: Partial<GroupDetail> = {}): GroupDetail {
  return {
    id: GROUP_ID,
    title: 'Projekt FERI',
    description: 'Kontakti projekta',
    color: 'mah',
    role: 'OWNER',
    archived: false,
    version: 3,
    updatedAt: '2026-11-05T12:32:00Z',
    updatedBy: { name: 'Ana Novak', email: 'ana@primer.si' },
    ...overrides,
  };
}

export function summary(n: number, overrides: Partial<GroupSummary> = {}): GroupSummary {
  return {
    id: groupId(n),
    title: `Skupina ${n.toString().padStart(3, '0')}`,
    description: null,
    color: 'tinta',
    contactCount: 0,
    ...overrides,
  };
}

/** `count` skupin z naslovi »Skupina 001« … (že po abecedi). */
export function summaries(count: number, start = 1): GroupSummary[] {
  return Array.from({ length: count }, (_, i) => summary(start + i));
}

export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

export interface RecordedGroupRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  authorization: string | null;
  body: unknown;
}

/**
 * Strežnik seznama po pogodbi: razdelki v vrstnem redu OWNER, ADMIN, EDITOR, VIEWER, prazni izpuščeni; brez `role` prva
 * stran vsakega razdelka, z `role` in `page` izbrana stran (privzeto `size` 25).
 */
export function listReply(groups: Partial<Record<Role, GroupSummary[]>>) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const role = url.searchParams.get('role') as Role | null;
    const page = Number(url.searchParams.get('page') ?? 0);
    const sections: GroupSection[] = ROLES.filter((r) => (role ? r === role : true))
      .filter((r) => (groups[r]?.length ?? 0) > 0)
      .map((r) => {
        const all = groups[r] ?? [];
        const p = role ? page : 0;
        return {
          role: r,
          total: all.length,
          page: p,
          size,
          items: all.slice(p * size, p * size + size),
        };
      });
    return { status: 200, body: { sections } as unknown as JsonBodyType };
  };
}

/**
 * MSW za API skupin; zabeleži vse zahtevke. Privzeto: seznam prazen, branje `404`, ustvarjanje `201` z vrnjeno skupino
 * iz telesa, urejanje `200` z `version + 1`.
 */
export function mockGroupsApi(
  handlers: {
    list?: (url: URL) => Reply | Promise<Reply>;
    get?: (id: string) => Reply | Promise<Reply>;
    create?: (body: unknown) => Reply | Promise<Reply>;
    update?: (id: string, body: unknown) => Reply | Promise<Reply>;
  } = {},
) {
  const requests: RecordedGroupRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedGroupRequest = {
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      authorization: request.headers.get('Authorization'),
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
    http.get('/api/groups', async ({ request }) => {
      await record(request);
      const url = new URL(request.url);
      return respond(handlers.list ? await handlers.list(url) : listReply({})(url));
    }),
    http.post('/api/groups', async ({ request }) => {
      const { body } = await record(request);
      if (handlers.create) return respond(await handlers.create(body));
      const input = body as { title: string; description?: string | null; color?: string | null };
      return respond({
        status: 201,
        body: groupDetail({
          id: groupId(999),
          title: input.title.trim(),
          description: input.description ?? null,
          color: (input.color ?? 'tinta') as GroupDetail['color'],
          role: 'OWNER',
          version: 0,
        }) as unknown as JsonBodyType,
      });
    }),
    http.get('/api/groups/:groupId', async ({ request, params }) => {
      await record(request);
      const id = String(params.groupId);
      return respond(handlers.get ? await handlers.get(id) : { status: 404 });
    }),
    http.put('/api/groups/:groupId', async ({ request, params }) => {
      const { body } = await record(request);
      const id = String(params.groupId);
      if (handlers.update) return respond(await handlers.update(id, body));
      const input = body as GroupDetail;
      return respond({
        status: 200,
        body: groupDetail({ ...input, id, version: input.version + 1 }) as unknown as JsonBodyType,
      });
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

/**
 * Aplikacija na dani poti s prijavljeno Ano (001: `PUT /api/me`) in API-jem skupin. Vrne zabeležene zahtevke skupin in
 * pomožne funkcije za štetje nalaganj povzetka (stranski pas in meni preklopa nalagata `size=10`).
 */
export function renderGroupsApp(path: string, handlers: Parameters<typeof mockGroupsApi>[0] = {}) {
  mockProfileApi();
  const api = mockGroupsApi(handlers);
  const view = renderApp(path, { gateway: createAuthFake({ user: ANA }) });
  const listRequests = (size: number) =>
    api.of('GET', '/api/groups').filter((r) => r.search.get('size') === String(size));
  return { ...view, api, listRequests };
}
