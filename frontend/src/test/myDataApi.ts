import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { onTestFinished, vi } from 'vitest';

import type { BlockingGroup, MyData } from '../features/account/types';
import { ANA, type AuthFake, createAuthFake } from './authFake';
import { server } from './msw';
import { mockProfileApi, renderApp } from './renderApp';

// Gradniki odgovorov in MSW rokovalniki za API funkcionalnosti 012 (specs/012-moji-podatki/contracts/openapi.yaml):
// `GET /api/me/export`, `GET /api/me/deletion-blockers`, `POST /api/me/deletion`.

/** Odgovor: status s telesom ali brez, ali omrežna napaka (zahtevek ne dobi odgovora). */
export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

/** Odgovor ali funkcija, ki ga izračuna (zaporedna številka klica od 1; lahko je asinhrona za `aria-busy` teste). */
export type ReplySource<Args extends unknown[] = []> =
  Reply | ((call: number, ...args: Args) => Reply | Promise<Reply>);

export const GROUP_BASE = '0193c4a2-7a1f-7c3e-9b1a-';

/** Izvoz »Ane Novak« z vsemi razdelki (brez kanarčkov – FR-012-03). */
export function myData(overrides: Partial<MyData> = {}): MyData {
  return {
    formatVersion: 1,
    exportedAt: '2026-11-12T10:15:30Z',
    profile: {
      name: 'Ana Novak',
      email: 'ana@primer.si',
      registeredAt: '2026-01-05T08:00:00Z',
      language: 'sl',
      theme: null,
    },
    memberships: [
      {
        groupTitle: 'Projekt FERI',
        role: 'OWNER',
        joinedAt: '2026-01-06T09:00:00Z',
        state: 'ACTIVE',
      },
    ],
    receivedInvitations: [
      {
        groupTitle: 'Planinci',
        offeredRole: 'EDITOR',
        sender: { name: 'Bojan Kralj', deleted: false },
        createdAt: '2026-02-01T10:00:00Z',
      },
    ],
    sentInvitations: [
      {
        groupTitle: 'Projekt FERI',
        offeredRole: 'VIEWER',
        inviteeEmail: 'eva@primer.si',
        createdAt: '2026-03-01T11:00:00Z',
      },
    ],
    ownedGroups: [
      {
        title: 'Projekt FERI',
        description: null,
        color: 'morje',
        state: 'ACTIVE',
        createdAt: '2026-01-06T09:00:00Z',
      },
    ],
    ...overrides,
  };
}

/** Blokirna skupina n (»Skupina 001« …) z edinstvenim uuid. */
export function blockingGroup(n: number): BlockingGroup {
  return {
    id: `${GROUP_BASE}${n.toString(16).padStart(12, 'b')}`,
    title: `Skupina ${n.toString().padStart(3, '0')}`,
  };
}

/** Pripravljeni odgovori po pogodbi. */
export const replies = {
  exported: (data: MyData = myData()): Reply => ({
    status: 200,
    body: data as unknown as JsonBodyType,
  }),
  blockers: (groups: BlockingGroup[]): Reply => ({ status: 200, body: { groups } }),
  serverError: { status: 500, body: { code: 'INTERNAL' } } satisfies Reply,
  unauthenticated: { status: 401, body: { code: 'UNAUTHENTICATED' } } satisfies Reply,
  networkError: 'network-error' as const,
  deleted: { status: 204 } satisfies Reply,
  pending: { status: 202, body: { code: 'IDENTITY_DELETION_PENDING' } } satisfies Reply,
  ownsActiveGroups: (groups: BlockingGroup[]): Reply => ({
    status: 409,
    body: { code: 'OWNS_ACTIVE_GROUPS', groups },
  }),
  mismatch: {
    status: 400,
    body: { code: 'VALIDATION_FAILED', errors: [{ field: 'email', code: 'MISMATCH' }] },
  } satisfies Reply,
};

export interface RecordedMyDataRequest {
  method: string;
  path: string;
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
 * MSW za API funkcionalnosti 012; zabeleži vse zahtevke. Privzeto: izvoz `myData()`, brez blokirnih skupin, izbris `204`.
 */
export function mockMyDataApi(
  handlers: {
    exportData?: ReplySource;
    blockers?: ReplySource;
    deletion?: ReplySource<[body: unknown]>;
  } = {},
) {
  const requests: RecordedMyDataRequest[] = [];
  const counts = { export: 0, blockers: 0, deletion: 0 };
  const record = async (request: Request): Promise<RecordedMyDataRequest> => {
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedMyDataRequest = {
      method: request.method,
      path: new URL(request.url).pathname,
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
    http.get('/api/me/export', async ({ request }) => {
      await record(request);
      counts.export += 1;
      return respond(await resolve(handlers.exportData, replies.exported(), counts.export));
    }),
    http.get('/api/me/deletion-blockers', async ({ request }) => {
      await record(request);
      counts.blockers += 1;
      return respond(await resolve(handlers.blockers, replies.blockers([]), counts.blockers));
    }),
    http.post('/api/me/deletion', async ({ request }) => {
      const { body } = await record(request);
      counts.deletion += 1;
      return respond(await resolve(handlers.deletion, replies.deleted, counts.deletion, body));
    }),
  );

  return {
    requests,
    /** Zahtevki z dano metodo in potjo. */
    of(method: string, path: string) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
    exportRequests: () => requests.filter((r) => r.path === '/api/me/export'),
    blockerRequests: () => requests.filter((r) => r.path === '/api/me/deletion-blockers'),
    deletionRequests: () => requests.filter((r) => r.path === '/api/me/deletion'),
  };
}

/** Odloženi odgovor za teste stanja »v teku« (`aria-busy`): `release()` sprosti zahtevek. */
export function deferredReply(): { source: () => Promise<Reply>; release: (reply: Reply) => void } {
  let release: (reply: Reply) => void = () => undefined;
  const promise = new Promise<Reply>((resolve) => {
    release = resolve;
  });
  return { source: () => promise, release };
}

export interface CapturedDownloads {
  /** Vrednosti `download` ob vsakem kliku na `<a download>`. */
  names: string[];
  /** Blobi, ki so bili ustvarjeni z `URL.createObjectURL` in navezani na kliknjeni `<a>`. */
  blobs: Blob[];
  /** Vsebina prenesenih datotek kot besedilo. */
  texts(): Promise<string[]>;
  /** Obnovi izvirne funkcije (sicer samodejno ob koncu testa). */
  restore(): void;
}

const readText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('branje bloba ni uspelo'));
    reader.readAsText(blob);
  });

/**
 * Ponaredek prenosa datoteke (jsdom nima `URL.createObjectURL` in ne izvede prenosa): zajame ime (`download`) in vsebino
 * (Blob) ob klicu `click()` na `<a download>`. Obnovi se samodejno ob koncu testa.
 */
export function captureDownloads(): CapturedDownloads {
  const urls = new Map<string, Blob>();
  const names: string[] = [];
  const blobs: Blob[] = [];
  let counter = 0;
  const originalCreate: unknown = Reflect.get(URL, 'createObjectURL');
  const originalRevoke: unknown = Reflect.get(URL, 'revokeObjectURL');
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    if (!this.hasAttribute('download')) return;
    names.push(this.download);
    const blob = urls.get(this.href);
    if (blob) blobs.push(blob);
  });
  Reflect.set(URL, 'createObjectURL', (object: Blob | MediaSource) => {
    counter += 1;
    const url = `blob:http://localhost/test-${counter}`;
    if (object instanceof Blob) urls.set(url, object);
    return url;
  });
  Reflect.set(URL, 'revokeObjectURL', () => undefined);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    clickSpy.mockRestore();
    for (const [key, original] of [
      ['createObjectURL', originalCreate],
      ['revokeObjectURL', originalRevoke],
    ] as const) {
      if (original === undefined) Reflect.deleteProperty(URL, key);
      else Reflect.set(URL, key, original);
    }
  };
  onTestFinished(restore);

  return { names, blobs, texts: () => Promise.all(blobs.map(readText)), restore };
}

/** Moj račun s prijavljeno Ano, API-jem profila (001) in API-jem 012; vrne tudi zabeležene zahtevke. */
export function renderAccountApp(
  handlers: Parameters<typeof mockMyDataApi>[0] = {},
  options: { gateway?: AuthFake; path?: string } = {},
) {
  const profile = mockProfileApi();
  const myDataApi = mockMyDataApi(handlers);
  const gateway = options.gateway ?? createAuthFake({ user: ANA });
  const view = renderApp(options.path ?? '/account', { gateway });
  return { ...view, profile, api: myDataApi, gateway };
}

/** Regija razdelka na strani Moj račun (po imenu iz plan.md). */
export const accountRegion = (name: string) => screen.findByRole('region', { name });

/** Odpre dialog *Izbrišem račun?* (počaka na gumb v razdelku in nanj klikne) in vrne dialog. */
export async function openDeleteDialog(user: UserEvent): Promise<HTMLElement> {
  const region = await accountRegion('Izbris računa');
  await user.click(await within(region).findByRole('button', { name: 'Izbriši račun' }));
  return screen.findByRole('dialog', { name: 'Izbrišem račun?' });
}

/** V odprtem dialogu vpiše e-naslov in potrdi z »Izbriši račun«. */
export async function confirmDeletion(
  user: UserEvent,
  dialog: HTMLElement,
  email = 'ana@primer.si',
): Promise<void> {
  const field = within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši svoj e-naslov' });
  await user.clear(field);
  if (email) await user.type(field, email);
  await user.click(within(dialog).getByRole('button', { name: 'Izbriši račun' }));
}
