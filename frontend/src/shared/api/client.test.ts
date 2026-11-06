import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/msw';
import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  it('FR-000-10: kliče pot pod /api in vrne JSON odgovora', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json({ status: 'UP' })));

    await expect(apiFetch<{ status: string }>('/health')).resolves.toEqual({ status: 'UP' });
  });

  it('FR-000-10: odgovor 401 UNAUTHENTICATED postane ApiError s kodo', async () => {
    server.use(
      http.get('/api/anything', () =>
        HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );

    const error = await apiFetch('/anything').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('FR-000-10: napaka brez JSON telesa dobi kodo UNKNOWN', async () => {
    server.use(http.get('/api/broken', () => new HttpResponse('Bad Gateway', { status: 502 })));

    const error = await apiFetch('/broken').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' });
  });
});

describe('ApiError.body (002)', () => {
  it('FR-002-12: telo 400 z napakami po poljih je na voljo v body', async () => {
    const body = { code: 'VALIDATION_FAILED', errors: [{ field: 'title', code: 'REQUIRED' }] };
    server.use(http.put('/api/groups/g', () => HttpResponse.json(body, { status: 400 })));

    const error = await apiFetch('/groups/g', { method: 'PUT' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', body });
  });

  it('FR-002-12: telo 409 VERSION_CONFLICT nosi trenutno stanje (current)', async () => {
    const body = { code: 'VERSION_CONFLICT', current: { title: 'Novejši', version: 5 } };
    server.use(http.put('/api/groups/g', () => HttpResponse.json(body, { status: 409 })));

    const error = await apiFetch('/groups/g', { method: 'PUT' }).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, code: 'VERSION_CONFLICT', body });
  });

  it('FR-002-13: prazno telo (404) in telo, ki ni JSON, dasta body null', async () => {
    server.use(
      http.get('/api/groups/missing', () => new HttpResponse(null, { status: 404 })),
      http.get('/api/broken', () => new HttpResponse('Bad Gateway', { status: 502 })),
    );

    const missing = await apiFetch('/groups/missing').catch((e: unknown) => e);
    const broken = await apiFetch('/broken').catch((e: unknown) => e);

    expect(missing).toMatchObject({ status: 404, code: 'UNKNOWN', body: null });
    expect(broken).toMatchObject({ status: 502, code: 'UNKNOWN', body: null });
  });
});
