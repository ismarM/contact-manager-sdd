import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ANA, createAuthFake } from '../../test/authFake';
import { server } from '../../test/msw';
import { createAuthFetch } from './authFetch';
import { ApiError } from './client';

describe('authFetch', () => {
  it('FR-001-07: zahtevek nosi žeton prijavljenega uporabnika', async () => {
    const gateway = createAuthFake({ user: ANA });
    const onSessionLost = vi.fn();
    let authorization: string | null = null;
    server.use(
      http.put('/api/me', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    const body = await createAuthFetch(gateway, onSessionLost)<{ ok: boolean }>('/me', {
      method: 'PUT',
    });

    expect(body).toEqual({ ok: true });
    expect(authorization).toBe('Bearer token-uid-ana');
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('FR-001-10: brez prijavljenega uporabnika (odjava v drugem zavihku) se zahtevek ne pošlje', async () => {
    const gateway = createAuthFake({ user: ANA });
    gateway.dropUserSilently();
    const onSessionLost = vi.fn();
    const received = vi.fn();
    server.use(
      http.put('/api/me/preferences', () => {
        received();
        return HttpResponse.json({});
      }),
    );

    await expect(
      createAuthFetch(gateway, onSessionLost)('/me/preferences', { method: 'PUT' }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });

    expect(received).not.toHaveBeenCalled();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('FR-001-10: žetona ni mogoče podaljšati → zahtevek se ne pošlje, seja je izgubljena', async () => {
    const gateway = createAuthFake({ user: ANA });
    gateway.failTokenRefresh();
    const onSessionLost = vi.fn();
    const received = vi.fn();
    server.use(
      http.put('/api/me/preferences', () => {
        received();
        return HttpResponse.json({});
      }),
    );

    await expect(
      createAuthFetch(gateway, onSessionLost)('/me/preferences', { method: 'PUT' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(received).not.toHaveBeenCalled();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('FR-001-10: odgovor 401 sproži izgubo seje', async () => {
    const gateway = createAuthFake({ user: ANA });
    const onSessionLost = vi.fn();
    server.use(
      http.put('/api/me', () => HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })),
    );

    await expect(
      createAuthFetch(gateway, onSessionLost)('/me', { method: 'PUT' }),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });

    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('FR-001-19: omrežna napaka (brez povezave) vrže napako in ne konča seje', async () => {
    const gateway = createAuthFake({ user: ANA });
    const onSessionLost = vi.fn();
    server.use(http.put('/api/me/preferences', () => HttpResponse.error()));

    await expect(
      createAuthFetch(gateway, onSessionLost)('/me/preferences', { method: 'PUT' }),
    ).rejects.toThrow();

    expect(onSessionLost).not.toHaveBeenCalled();
    expect(gateway.currentUser).toEqual(ANA);
  });

  it('FR-001-07: druge napake vržejo ApiError s kodo in ne končajo seje', async () => {
    const gateway = createAuthFake({ user: ANA });
    const onSessionLost = vi.fn();
    server.use(
      http.put('/api/me/preferences', () =>
        HttpResponse.json({ code: 'VALIDATION_FAILED', errors: [] }, { status: 400 }),
      ),
    );

    await expect(
      createAuthFetch(gateway, onSessionLost)('/me/preferences', { method: 'PUT' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });

    expect(onSessionLost).not.toHaveBeenCalled();
  });
});
