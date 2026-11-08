import { http, HttpResponse, type JsonBodyType } from 'msw';

import type {
  AcceptedInvitation,
  OutgoingInvitation,
  OutgoingInvitations,
  ReceivedInvitation,
  ReceivedInvitations,
} from '../features/invitations/types';
import { groupId, renderGroupsApp } from './groupsApi';
import { server } from './msw';

// Gradniki odgovorov in MSW rokovalniki za API povabil (specs/006-povabila/contracts/openapi.yaml).

export const INVITATION_ID = '0193c4a2-7a1f-7c3e-9b1a-aaaaaaaaaaaa';

/** Edinstven uuid za n-to testno povabilo. */
export function invitationId(n: number): string {
  return `0193c4a2-7a1f-7c3e-9b1a-${n.toString(16).padStart(12, 'b')}`;
}

/** Prejeto povabilo n (privzeto: Projekt FERI, vloga Urednik, povabila Ana Novak). */
export function receivedInvitation(
  n: number,
  overrides: Partial<ReceivedInvitation> = {},
): ReceivedInvitation {
  return {
    id: invitationId(n),
    group: { id: groupId(n), title: 'Projekt FERI', color: 'mah', archived: false },
    role: 'EDITOR',
    invitedBy: { name: 'Ana Novak', email: 'ana@primer.si' },
    createdAt: '2026-11-05T12:32:00Z',
    ...overrides,
  };
}

/** `count` prejetih povabil, novejše prvo (kot strežnik); skupine »Skupina 001« …, vrednosti po potrebi prepiše `overrides`. */
export function received(
  count: number,
  overrides: (n: number) => Partial<ReceivedInvitation> = () => ({}),
): ReceivedInvitation[] {
  return Array.from({ length: count }, (_, i) => {
    const n = count - i;
    return receivedInvitation(n, {
      group: {
        id: groupId(n),
        title: `Skupina ${n.toString().padStart(3, '0')}`,
        color: 'tinta',
        archived: false,
      },
      ...overrides(n),
    });
  });
}

/** Čakajoče povabilo skupine n (privzeto: uporabnikN@primer.si, Urednik, odpoklicljivo). */
export function outgoingInvitation(
  n: number,
  overrides: Partial<OutgoingInvitation> = {},
): OutgoingInvitation {
  return {
    id: invitationId(n),
    inviteeEmail: `uporabnik${n}@primer.si`,
    role: 'EDITOR',
    invitedBy: { name: 'Ana Novak', email: 'ana@primer.si' },
    createdAt: '2026-11-05T12:32:00Z',
    canWithdraw: true,
    ...overrides,
  };
}

/** `count` čakajočih povabil, novejše prvo. */
export function outgoing(
  count: number,
  overrides: (n: number) => Partial<OutgoingInvitation> = () => ({}),
): OutgoingInvitation[] {
  return Array.from({ length: count }, (_, i) => {
    const n = count - i;
    return outgoingInvitation(n, overrides(n));
  });
}

export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

/** Strežnik seznama prejetih povabil po pogodbi: `page` in `size` režeta dani seznam. */
export function receivedReply(all: ReceivedInvitation[]) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: ReceivedInvitations = {
      total: all.length,
      page,
      size,
      items: all.slice(page * size, page * size + size),
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

/** Strežnik seznama čakajočih povabil skupine po pogodbi. */
export function outgoingReply(all: OutgoingInvitation[]) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const body: OutgoingInvitations = {
      total: all.length,
      page,
      size,
      items: all.slice(page * size, page * size + size),
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

export interface RecordedInvitationRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

/**
 * MSW za API povabil; zabeleži vse zahtevke. Privzeto: število `0`, seznami prazni, `accept` vrne skupino povabila,
 * `decline`/`withdraw` `204`, `send` `201` z vrnjenim povabilom iz telesa.
 */
export function mockInvitationsApi(
  handlers: {
    count?: () => Reply | Promise<Reply>;
    listReceived?: (url: URL) => Reply | Promise<Reply>;
    accept?: (id: string) => Reply | Promise<Reply>;
    decline?: (id: string) => Reply | Promise<Reply>;
    listOutgoing?: (url: URL, groupId: string) => Reply | Promise<Reply>;
    send?: (groupId: string, body: unknown) => Reply | Promise<Reply>;
    withdraw?: (groupId: string, id: string) => Reply | Promise<Reply>;
  } = {},
) {
  const requests: RecordedInvitationRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedInvitationRequest = {
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
    http.get('/api/invitations/count', async ({ request }) => {
      await record(request);
      return respond(handlers.count ? await handlers.count() : { status: 200, body: { count: 0 } });
    }),
    http.get('/api/invitations', async ({ request }) => {
      await record(request);
      const url = new URL(request.url);
      return respond(
        handlers.listReceived ? await handlers.listReceived(url) : receivedReply([])(url),
      );
    }),
    http.post('/api/invitations/:invitationId/accept', async ({ request, params }) => {
      await record(request);
      const id = String(params.invitationId);
      const accepted: AcceptedInvitation = {
        groupId: groupId(1),
        title: 'Projekt FERI',
        role: 'EDITOR',
        archived: false,
      };
      return respond(
        handlers.accept
          ? await handlers.accept(id)
          : { status: 200, body: accepted as unknown as JsonBodyType },
      );
    }),
    http.post('/api/invitations/:invitationId/decline', async ({ request, params }) => {
      await record(request);
      const id = String(params.invitationId);
      return respond(handlers.decline ? await handlers.decline(id) : { status: 204 });
    }),
    http.get('/api/groups/:groupId/invitations', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const id = String(params.groupId);
      return respond(
        handlers.listOutgoing ? await handlers.listOutgoing(url, id) : outgoingReply([])(url),
      );
    }),
    http.post('/api/groups/:groupId/invitations', async ({ request, params }) => {
      const { body } = await record(request);
      const id = String(params.groupId);
      if (handlers.send) return respond(await handlers.send(id, body));
      const input = body as { email: string; role: OutgoingInvitation['role'] };
      return respond({
        status: 201,
        body: outgoingInvitation(900, {
          inviteeEmail: input.email.trim().toLowerCase(),
          role: input.role,
        }) as unknown as JsonBodyType,
      });
    }),
    http.delete('/api/groups/:groupId/invitations/:invitationId', async ({ request, params }) => {
      await record(request);
      const id = String(params.groupId);
      const invitation = String(params.invitationId);
      return respond(handlers.withdraw ? await handlers.withdraw(id, invitation) : { status: 204 });
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
 * Aplikacija na dani poti s prijavljeno Ano, API-jem skupin in API-jem povabil. Vrne še zabeležene zahtevke povabil.
 */
export function renderInvitationsApp(
  path: string,
  handlers: Parameters<typeof mockInvitationsApi>[0] = {},
  groupHandlers: Parameters<typeof renderGroupsApp>[1] = {},
) {
  const invitations = mockInvitationsApi(handlers);
  const view = renderGroupsApp(path, groupHandlers);
  return { ...view, invitations };
}
