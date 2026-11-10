import { http, HttpResponse, type JsonBodyType } from 'msw';

import type { Member, Members } from '../features/members/types';
import { GROUP_ID, groupDetail, renderGroupsApp } from './groupsApi';
import { server } from './msw';

// Gradniki odgovorov in MSW rokovalniki za API članov (specs/007-clani/contracts/openapi.yaml).

export const MEMBER_ID = '0193c4a2-7a1f-7c3e-9b1a-cccccccccccc';

/** Edinstven uuid za n-tega testnega člana. */
export function memberId(n: number): string {
  return `0193c4a2-7a1f-7c3e-9b1a-${n.toString(16).padStart(12, 'c')}`;
}

/** Član n (privzeto: Urednik »Član 001«, upravljiv). */
export function member(n: number, overrides: Partial<Member> = {}): Member {
  const label = n.toString().padStart(3, '0');
  return {
    id: memberId(n),
    name: `Član ${label}`,
    email: `clan${label}@primer.si`,
    role: 'EDITOR',
    version: 0,
    self: false,
    canManage: true,
    updatedBy: null,
    updatedAt: null,
    ...overrides,
  };
}

/** Prijavljena Ana (lastnica) – lastna vrstica, nikoli upravljiva. */
export function selfMember(role: Member['role'] = 'OWNER'): Member {
  return member(900, {
    id: memberId(900),
    name: 'Ana Novak',
    email: 'ana@primer.si',
    role,
    self: true,
    canManage: false,
  });
}

/** `count` upravljivih članov z imeni »Član 001« …, vrednosti po potrebi prepiše `overrides`. */
export function manyMembers(
  count: number,
  overrides: (n: number) => Partial<Member> = () => ({}),
): Member[] {
  return Array.from({ length: count }, (_, i) => member(i + 1, overrides(i + 1)));
}

export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

/** Strežnik seznama članov po pogodbi: `page` in `size` režeta dani seznam. */
export function membersReply(all: Member[], extra: { deletedOwner?: boolean } = {}) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: Members = {
      total: all.length,
      page,
      size,
      deletedOwner: extra.deletedOwner ?? false,
      items: all.slice(page * size, page * size + size),
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

export interface RecordedMemberRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

/**
 * MSW za API članov; zabeleži vse zahtevke. Privzeto: seznam z lastnico (`total` 1), `changeRole` vrne člana s +1 verzijo,
 * `remove` in `leave` `204`, `transfer` vrne skupino z vlogo ADMIN.
 */
export function mockMembersApi(
  handlers: {
    list?: (url: URL, groupId: string) => Reply | Promise<Reply>;
    changeRole?: (groupId: string, memberId: string, body: unknown) => Reply | Promise<Reply>;
    remove?: (groupId: string, memberId: string) => Reply | Promise<Reply>;
    leave?: (groupId: string) => Reply | Promise<Reply>;
    transfer?: (groupId: string, body: unknown) => Reply | Promise<Reply>;
  } = {},
) {
  const requests: RecordedMemberRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedMemberRequest = {
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
    http.get('/api/groups/:groupId/members', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const group = String(params.groupId);
      return respond(
        handlers.list ? await handlers.list(url, group) : membersReply([selfMember()])(url),
      );
    }),
    http.put('/api/groups/:groupId/members/:memberId', async ({ request, params }) => {
      const { body } = await record(request);
      const input = body as { role: Member['role']; version: number };
      return respond(
        handlers.changeRole
          ? await handlers.changeRole(String(params.groupId), String(params.memberId), body)
          : {
              status: 200,
              body: member(1, {
                id: String(params.memberId),
                role: input.role,
                version: input.version + 1,
              }) as unknown as JsonBodyType,
            },
      );
    }),
    http.delete('/api/groups/:groupId/members/:memberId', async ({ request, params }) => {
      await record(request);
      return respond(
        handlers.remove
          ? await handlers.remove(String(params.groupId), String(params.memberId))
          : { status: 204 },
      );
    }),
    http.post('/api/groups/:groupId/leave', async ({ request, params }) => {
      await record(request);
      return respond(
        handlers.leave ? await handlers.leave(String(params.groupId)) : { status: 204 },
      );
    }),
    http.post('/api/groups/:groupId/ownership-transfer', async ({ request, params }) => {
      const { body } = await record(request);
      return respond(
        handlers.transfer
          ? await handlers.transfer(String(params.groupId), body)
          : {
              status: 200,
              body: groupDetail({
                id: String(params.groupId),
                role: 'ADMIN',
              }) as unknown as JsonBodyType,
            },
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

/** Aplikacija na dani poti s prijavljeno Ano, API-jem skupin in API-jem članov. */
export function renderMembersApp(
  path: string,
  handlers: Parameters<typeof mockMembersApi>[0] = {},
  groupHandlers: Parameters<typeof renderGroupsApp>[1] = {},
) {
  const members = mockMembersApi(handlers);
  const view = renderGroupsApp(path, groupHandlers);
  return { ...view, members };
}

export { GROUP_ID };
