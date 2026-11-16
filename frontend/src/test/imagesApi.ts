import type { ParseKeys, TOptions } from 'i18next';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { onTestFinished, vi } from 'vitest';

import { i18n } from '../i18n';
import type { PhotoResult } from '../shared/images/photoTypes';
import { server } from './msw';

// MSW rokovalniki in pomočniki za slike (specs/018-slike/contracts/openapi.yaml). Imena in sporočila v testih pridejo
// iz prevodov (`imageText`), ne iz nizov, ponovljenih po datotekah (konstitucija §3.3).

/** Besedilo iz prevodov v trenutnem jeziku testa. */
export function imageText(key: ParseKeys, options?: TOptions): string {
  return String(i18n.t(key, options));
}

/** Najmanjša veljavna slika PNG (1 × 1), ki jo vrnejo rokovalniki. */
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

export type Reply = { status: number; body?: JsonBodyType } | 'network-error';

export const imageReplies = {
  result: (photoRevision: number | null, version?: number): Reply => ({
    status: 200,
    body: (version === undefined ? { photoRevision } : { photoRevision, version }) as PhotoResult,
  }),
  noContent: { status: 204 } satisfies Reply,
  notFound: { status: 404, body: { code: 'NOT_FOUND' } } satisfies Reply,
  forbidden: { status: 403, body: { code: 'FORBIDDEN' } } satisfies Reply,
  unauthenticated: { status: 401, body: { code: 'UNAUTHENTICATED' } } satisfies Reply,
  /** `400 VALIDATION_FAILED` s kodo napake polja `file`. */
  invalid: (code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'FILE_TOO_LARGE' | 'REQUIRED'): Reply => ({
    status: 400,
    body: { code: 'VALIDATION_FAILED', errors: [{ field: 'file', code }] },
  }),
  tooLarge: { status: 413 } satisfies Reply,
  rateLimited: { status: 429, body: { code: 'RATE_LIMITED' } } satisfies Reply,
  serverError: { status: 500, body: { code: 'INTERNAL' } } satisfies Reply,
  googleUnavailable: { status: 409, body: { code: 'GOOGLE_PHOTO_UNAVAILABLE' } } satisfies Reply,
  networkError: 'network-error' as const,
};

export interface RecordedImageRequest {
  method: string;
  path: string;
  search: URLSearchParams;
  authorization: string | null;
  /** Polja multipart: `file` (ime, vrsta, velikost) in `version`. */
  upload: { name: string; type: string; size: number; version: string | null } | null;
}

type Source = Reply | ((call: number) => Reply | Promise<Reply>);

const respond = (reply: Reply) =>
  reply === 'network-error'
    ? HttpResponse.error()
    : reply.body === undefined
      ? new HttpResponse(null, { status: reply.status })
      : HttpResponse.json(reply.body, { status: reply.status });

/**
 * MSW za vse poti slik; zabeleži zahtevke. Privzeto: branje `200 image/png`, nalaganje `200 { photoRevision: 1 }`
 * (skupina in kontakt tudi `version`), odstranitev lastne slike `204`, skupine in kontakta `200 { photoRevision: null }`.
 */
export function mockImagesApi(
  handlers: {
    /** Odgovor na vsako branje slike (me, član, skupina, kontakt). */
    read?: Source;
    /** Nalaganje (PUT) lastne slike, skupine in kontakta. */
    upload?: Source;
    /** Odstranitev (DELETE). */
    remove?: Source;
    /** Prevzem slike Google računa. */
    google?: Source;
  } = {},
) {
  const requests: RecordedImageRequest[] = [];
  const counts = { read: 0, upload: 0, remove: 0, google: 0 };

  // Telo multipart se v jsdom ne bere (kot pri uvozu), zato polja zabeleži opazovalec `FormData.append`.
  const appended = vi.spyOn(FormData.prototype, 'append');
  onTestFinished(() => appended.mockRestore());

  const takeUpload = (): RecordedImageRequest['upload'] => {
    let upload: RecordedImageRequest['upload'] = null;
    for (const [name, value, fileName] of appended.mock.calls) {
      if (typeof value === 'string') {
        if (name === 'version' && upload) upload.version = value;
      } else {
        upload = { name: fileName ?? '', type: value.type, size: value.size, version: null };
      }
    }
    appended.mockClear();
    return upload;
  };

  const record = (request: Request): void => {
    const url = new URL(request.url);
    requests.push({
      method: request.method,
      path: url.pathname,
      search: url.searchParams,
      authorization: request.headers.get('Authorization'),
      upload: request.method === 'PUT' ? takeUpload() : null,
    });
  };
  const resolve = async (source: Source | undefined, fallback: Reply, call: number) =>
    source === undefined ? fallback : typeof source === 'function' ? await source(call) : source;

  const read = async ({ request }: { request: Request }) => {
    record(request);
    counts.read += 1;
    const reply = await resolve(handlers.read, { status: 200 }, counts.read);
    if (reply !== 'network-error' && reply.status === 200) {
      return new HttpResponse(PNG_BYTES, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          ETag: '"1-96"',
          'Cache-Control': 'private, no-cache',
        },
      });
    }
    return respond(reply);
  };
  const upload =
    (fallback: Reply) =>
    async ({ request }: { request: Request }) => {
      record(request);
      counts.upload += 1;
      return respond(await resolve(handlers.upload, fallback, counts.upload));
    };
  const remove =
    (fallback: Reply) =>
    async ({ request }: { request: Request }) => {
      record(request);
      counts.remove += 1;
      return respond(await resolve(handlers.remove, fallback, counts.remove));
    };

  server.use(
    http.get('/api/me/photo', read),
    http.put('/api/me/photo', upload(imageReplies.result(1))),
    http.delete('/api/me/photo', remove(imageReplies.noContent)),
    http.post('/api/me/photo/google', async ({ request }) => {
      record(request);
      counts.google += 1;
      return respond(await resolve(handlers.google, imageReplies.result(1), counts.google));
    }),
    http.get('/api/groups/:groupId/members/:memberId/photo', read),
    http.get('/api/groups/:groupId/photo', read),
    http.put('/api/groups/:groupId/photo', upload(imageReplies.result(1, 4))),
    http.delete('/api/groups/:groupId/photo', remove(imageReplies.result(null, 4))),
    http.get('/api/groups/:groupId/contacts/:contactId/photo', read),
    http.put('/api/groups/:groupId/contacts/:contactId/photo', upload(imageReplies.result(1, 2))),
    http.delete(
      '/api/groups/:groupId/contacts/:contactId/photo',
      remove(imageReplies.result(null, 2)),
    ),
  );

  return {
    requests,
    reads: () => requests.filter((r) => r.method === 'GET'),
    uploads: () => requests.filter((r) => r.method === 'PUT'),
    removals: () => requests.filter((r) => r.method === 'DELETE'),
  };
}

export interface BlobUrlTracker {
  /** Število klicev `URL.createObjectURL` in `URL.revokeObjectURL`. */
  readonly created: number;
  readonly revoked: number;
  /** Naslovi, ki so bili ustvarjeni in še niso preklicani. */
  active(): string[];
}

/**
 * Šteje `URL.createObjectURL`/`revokeObjectURL` (jsdom ju nima): izenačeno število in prazen `active()` pomenita, da
 * noben blob URL ne uhaja (plan.md dopolnitev 4). Obnovi se ob koncu testa.
 */
export function trackBlobUrls(): BlobUrlTracker {
  const active = new Set<string>();
  let created = 0;
  let revoked = 0;
  const original = {
    create: Reflect.get(URL, 'createObjectURL') as unknown,
    revoke: Reflect.get(URL, 'revokeObjectURL') as unknown,
  };
  Reflect.set(URL, 'createObjectURL', () => {
    created += 1;
    const url = `blob:http://localhost/slika-${created}`;
    active.add(url);
    return url;
  });
  Reflect.set(URL, 'revokeObjectURL', (url: string) => {
    revoked += 1;
    active.delete(url);
  });
  onTestFinished(() => {
    for (const [key, value] of [
      ['createObjectURL', original.create],
      ['revokeObjectURL', original.revoke],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(URL, key);
      else Reflect.set(URL, key, value);
    }
  });
  return {
    get created() {
      return created;
    },
    get revoked() {
      return revoked;
    },
    active: () => [...active],
  };
}

export interface ImageDecoding {
  /** Vrste in kakovosti izvozov (`toBlob`). */
  exports: { type: string; quality: number | undefined }[];
  /** Argumenti zadnjega `drawImage` pri izvozu. */
  draws: number[][];
}

/**
 * Ponaredek dekodiranja in platna (jsdom nima `createImageBitmap` ne risanja): slika je `width` × `height`, `alpha`
 * pove, ali je izrez prosojen (izvoz PNG). Obnovi se ob koncu testa.
 */
export function stubImageDecoding(
  options: { width?: number; height?: number; alpha?: boolean; failDecode?: boolean } = {},
): ImageDecoding {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const state: ImageDecoding = { exports: [], draws: [] };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn((_file: Blob, init?: ImageBitmapOptions) => {
      if (options.failDecode || init?.imageOrientation !== 'from-image') {
        return Promise.reject(new Error('dekodiranje ni uspelo'));
      }
      return Promise.resolve({ width, height, close: vi.fn() });
    }),
  );
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    imageSmoothingQuality: 'low',
    drawImage: vi.fn((...args: unknown[]) => {
      state.draws.push(args.slice(1) as number[]);
    }),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(options.alpha ? 0 : 255),
    })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => context) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback: BlobCallback, type?: string, quality?: unknown) => {
      state.exports.push({ type: type ?? 'image/png', quality: quality as number | undefined });
      callback(new Blob(['x'], { type: type ?? 'image/png' }));
    },
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  return state;
}

/** Slika za izbiro datoteke v testu. */
export function imageFile(name = 'portret.png', type = 'image/png'): File {
  return new File([PNG_BYTES], name, { type });
}
