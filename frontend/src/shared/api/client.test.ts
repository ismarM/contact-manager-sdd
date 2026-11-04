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
