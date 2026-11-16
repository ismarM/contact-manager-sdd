import { http, HttpResponse, type JsonBodyType } from 'msw';

import type {
  AttributeKey,
  AttributeKeyPage,
  AttributeType,
  ChangeTypeRequest,
  TypeConflictContact,
} from '../features/attributes/types';
import { typeNameKey } from '../features/attributes/typeNames';
import { GROUP_ID } from './groupsApi';
import type { Reply } from './groupsApi';
import { server } from './msw';
import { tr } from './smartAttributes';

// Gradniki odgovorov in MSW rokovalniki za API ključev atributov
// (specs/016-tipizirani-atributi/contracts/openapi.yaml). Zunanjih storitev OSM test ne kliče.

export { GROUP_ID };

/** Ime tipa ključa v trenutnem jeziku vmesnika (dostopno ime v testih, constitution §3.3). */
export const typeName = (type: AttributeType): string => tr(typeNameKey(type));

/** Pot endpointov ključev skupine: `attribute-keys` ali `attribute-keys/change-type`. */
export function attributeKeysPath(endpoint: '' | 'change-type' = '', group = GROUP_ID): string {
  return `/api/groups/${group}/attribute-keys${endpoint === '' ? '' : `/${endpoint}`}`;
}

export function attributeKey(overrides: Partial<AttributeKey> = {}): AttributeKey {
  return { key: 'Mobilni', type: 'OTHER', contactCount: 1, version: 0, ...overrides };
}

/** `count` ključev »Ključ 001« … s tipom `OTHER`. */
export function attributeKeys(count: number, start = 1): AttributeKey[] {
  return Array.from({ length: count }, (_, i) =>
    attributeKey({ key: `Ključ ${(start + i).toString().padStart(3, '0')}` }),
  );
}

/** Strežnik seznama po pogodbi: `q` (brez razlike velikosti črk, natančno ujemanje prvo), `page` in `size`. */
export function attributeKeyPageReply(all: AttributeKey[]) {
  return (url: URL): Reply => {
    const size = Number(url.searchParams.get('size') ?? 25);
    const page = Number(url.searchParams.get('page') ?? 0);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const matching = all
      .filter((item) => item.key.toLowerCase().includes(q))
      .sort((a, b) => Number(b.key.toLowerCase() === q) - Number(a.key.toLowerCase() === q));
    const body: AttributeKeyPage = {
      items: matching.slice(page * size, page * size + size),
      page,
      size,
      total: matching.length,
    };
    return { status: 200, body: body as unknown as JsonBodyType };
  };
}

export function typeConflictReply(contacts: TypeConflictContact[], total = contacts.length): Reply {
  return {
    status: 409,
    body: { code: 'ATTRIBUTE_TYPE_CONFLICT', details: { contacts, total } } as JsonBodyType,
  };
}

export function keyVersionConflictReply(current: AttributeKey): Reply {
  return {
    status: 409,
    body: { code: 'VERSION_CONFLICT', details: { current } } as unknown as JsonBodyType,
  };
}

export interface RecordedAttributeRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Handler<A extends unknown[]> = (...args: A) => Reply | Promise<Reply>;

/**
 * MSW za `GET …/attribute-keys` in `POST …/attribute-keys/change-type`; zabeleži vse zahtevke. Privzeto: seznam prazen,
 * sprememba tipa `200` s ključem z novim tipom in `version + 1`.
 */
export function mockAttributesApi(
  handlers: {
    list?: Handler<[URL, string]>;
    changeType?: Handler<[ChangeTypeRequest, string]>;
  } = {},
) {
  const requests: RecordedAttributeRequest[] = [];
  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    const entry: RecordedAttributeRequest = {
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
    http.get('/api/groups/:groupId/attribute-keys', async ({ request, params }) => {
      await record(request);
      const url = new URL(request.url);
      const group = String(params.groupId);
      return respond(
        handlers.list ? await handlers.list(url, group) : attributeKeyPageReply([])(url),
      );
    }),
    http.post('/api/groups/:groupId/attribute-keys/change-type', async ({ request, params }) => {
      const { body } = await record(request);
      const change = body as ChangeTypeRequest;
      const group = String(params.groupId);
      if (handlers.changeType) return respond(await handlers.changeType(change, group));
      return respond({
        status: 200,
        body: attributeKey({
          key: change.key,
          type: change.type,
          version: change.version + 1,
        }) as unknown as JsonBodyType,
      });
    }),
  );

  return { requests };
}
