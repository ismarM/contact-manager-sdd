import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';

import { App } from '../app/App';
import { type AuthFake, createAuthFake } from './authFake';
import { server } from './msw';

// Izris celotne aplikacije (usmerjevalnik, AuthProvider, ogrodje) na dani poti s testno prijavo in MSW.

export interface Profile {
  name: string | null;
  email: string;
  language: 'sl' | 'en' | null;
  theme: 'light' | 'dark' | null;
}

export const ANA_PROFILE: Profile = {
  name: 'Ana Novak',
  email: 'ana@primer.si',
  language: null,
  theme: null,
};

export interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

/** Zabeleži vse zahtevke na /api in odgovori na PUT /api/me ter PUT /api/me/preferences. */
export function mockProfileApi(
  options: {
    profile?: Profile;
    meStatus?: number;
    /** Status odgovora ali 'network-error' (zahtevek ne dobi odgovora – brez povezave). */
    preferencesStatus?: number | 'network-error';
  } = {},
) {
  const requests: RecordedRequest[] = [];
  let profile: Profile = options.profile ?? ANA_PROFILE;
  const record = async (request: Request) => {
    const text = await request.clone().text();
    requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      authorization: request.headers.get('Authorization'),
      body: text ? (JSON.parse(text) as unknown) : null,
    });
  };
  const respond = (status: number, body: JsonBodyType) => HttpResponse.json(body, { status });

  server.use(
    http.put('/api/me', async ({ request }) => {
      await record(request);
      if (options.meStatus && options.meStatus >= 400) {
        return respond(options.meStatus, { code: 'INTERNAL' });
      }
      const device = (requests.at(-1)?.body ?? null) as Pick<Profile, 'language' | 'theme'> | null;
      profile = {
        ...profile,
        language: profile.language ?? device?.language ?? null,
        theme: profile.theme ?? device?.theme ?? null,
      };
      return respond(options.meStatus ?? 200, { ...profile });
    }),
    http.put('/api/me/preferences', async ({ request }) => {
      await record(request);
      const status = options.preferencesStatus ?? 200;
      if (status === 'network-error') return HttpResponse.error();
      if (status === 401) return respond(401, { code: 'UNAUTHENTICATED' });
      if (status >= 400) return respond(status, { code: 'INTERNAL' });
      profile = { ...profile, ...((requests.at(-1)?.body ?? {}) as Partial<Profile>) };
      return respond(200, { ...profile });
    }),
  );

  return {
    requests,
    get profile() {
      return profile;
    },
  };
}

export function renderApp(path: string, options: { gateway?: AuthFake } = {}) {
  window.history.replaceState({}, '', path);
  const gateway = options.gateway ?? createAuthFake();
  const user = userEvent.setup();
  const view = render(<App gateway={gateway} />);
  return { ...view, gateway, user };
}

/** Trenutna pot s poizvedbo, kot jo vidi brskalnik. */
export function currentLocation() {
  return window.location.pathname + window.location.search;
}
