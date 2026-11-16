import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { CONTACT_ID, contactDetail, GROUP_ID, renderContactsApp } from '../../test/contactsApi';
import { server } from '../../test/msw';
import { tr } from '../../test/smartAttributes';
import type { AddressLocation } from './api';

// Zemljevid za naslove (FR-016-20 … FR-016-22, FR-016-27). MSW samo za naš `/api` (`onUnhandledFrame: 'error'`):
// vsak zahtevek na tuj izvor je napaka testa; poleg tega test preveri, da noben `fetch` ali `<img>` ne gre drugam.

const PATH = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const LOCATION = `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}/address-location`;

const CONTACT = contactDetail({
  firstName: 'Ana',
  lastName: 'Novak',
  displayName: 'Ana Novak',
  addressParts: {
    street: 'Slovenska cesta 1',
    postalCode: '1000',
    city: 'Ljubljana',
    country: 'SI',
  },
  attributes: [
    {
      key: 'Dostava',
      type: 'ADDRESS',
      value: null,
      parts: { street: 'Dunajska cesta 5', postalCode: '1000', city: 'Ljubljana', country: 'SI' },
    },
    { key: 'Služba', type: 'EMAIL', value: 'ana@primer.si' },
    { key: 'Prazen naslov', type: 'ADDRESS', value: '' },
  ],
});

/** Rokovalnik lokacije; zabeleži parametre zahtevkov. */
function locations(...replies: (() => Response)[]) {
  const seen: Record<string, string>[] = [];
  server.use(
    http.get(LOCATION, ({ request }) => {
      seen.push(Object.fromEntries(new URL(request.url).searchParams));
      const reply = replies[Math.min(seen.length, replies.length) - 1];
      if (!reply) throw new Error('ni odgovora');
      return reply();
    }),
  );
  return seen;
}

const found = (body: AddressLocation) => () => HttpResponse.json(body);

async function openContact() {
  const view = renderContactsApp(PATH, {
    role: 'VIEWER',
    archived: true,
    contacts: { get: () => ({ status: 200, body: CONTACT }) },
  });
  await screen.findByRole('heading', { level: 2, name: 'Ana Novak' });
  return view;
}

const mapButton = (name: string) => screen.getByRole('button', { name: tr('map.show', { name }) });

describe('Zemljevid naslova', () => {
  let fetches: string[];

  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    server.use(
      http.get('/api/map-tiles/:z/:x/:y', () =>
        HttpResponse.arrayBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer, {
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );
    fetches = [];
    const original = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      fetches.push(input instanceof Request ? input.url : String(input));
      return original(input, init);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Vse zahteve brskalnika gredo na naš `/api` (FR-016-23, SC-006); slike so samo `blob:`. */
  function expectOnlyOwnOrigin() {
    for (const url of fetches) {
      expect(url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)).toBe(
        true,
      );
    }
    for (const img of document.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      expect(src === null || src.startsWith('blob:') || src.startsWith('data:')).toBe(true);
    }
  }

  it('FR-016-20: vsak neprazen naslov ima gumb z imenom naslova, drugi tipi ga nimajo (tudi bralec v arhivirani skupini)', async () => {
    await openContact();

    expect(mapButton(tr('contacts.view.address'))).toBeInTheDocument();
    expect(mapButton('Dostava')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: new RegExp(`^${tr('map.showShort')}`) }),
    ).toHaveLength(2);
  });

  it('FR-016-21 FR-016-27: dialog z zemljevidom, naslovom po shemi, opisom, pripisom in povezavo; Esc vrne fokus', async () => {
    const seen = locations(found({ status: 'EXACT', latitude: 46.0569, longitude: 14.5058 }));
    const { user } = await openContact();

    await user.click(mapButton('Dostava'));

    const dialog = await screen.findByRole('dialog', {
      name: tr('map.title', { name: 'Dostava' }),
    });
    expect(
      await within(dialog).findByRole('region', { name: tr('map.region', { name: 'Dostava' }) }),
    ).toBeInTheDocument();
    expect(seen).toEqual([{ language: 'sl', key: 'Dostava' }]);
    expect(dialog).toHaveTextContent('Dunajska cesta 5');
    expect(dialog).toHaveTextContent('1000 Ljubljana');
    expect(dialog).toHaveTextContent(
      tr('map.descriptionExact', { lat: '46,05690', lon: '14,50580' }),
    );
    expect(within(dialog).getByRole('link', { name: tr('map.attribution') })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    const external = within(dialog).getByRole('link', {
      name: `${tr('map.openExternal')} ${tr('map.newTab')}`,
    });
    expect(external.getAttribute('href')).toContain('mlat=46.0569&mlon=14.5058');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      within(dialog).queryByRole('link', { name: new RegExp(tr('map.searchExternal')) }),
    ).toBeNull();
    expect(within(dialog).getByRole('button', { name: tr('map.zoomIn') })).toBeInTheDocument();
    expect((await axe(dialog)).violations).toEqual([]);
    expectOnlyOwnOrigin();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mapButton('Dostava')).toHaveFocus();
  });

  it('FR-016-21: predefiniran naslov pošlje zahtevo brez ključa', async () => {
    const seen = locations(found({ status: 'EXACT', latitude: 46.05, longitude: 14.5 }));
    const { user } = await openContact();

    await user.click(mapButton(tr('contacts.view.address')));

    await screen.findByRole('region', {
      name: tr('map.region', { name: tr('contacts.view.address') }),
    });
    expect(seen).toEqual([{ language: 'sl' }]);
  });

  it('FR-016-22: nenajden naslov je sporočilo s povezavo za iskanje, brez zemljevida in brez napake', async () => {
    locations(found({ status: 'NOT_FOUND', latitude: null, longitude: null }));
    const { user } = await openContact();

    await user.click(mapButton('Dostava'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(tr('map.notFound'))).toBeInTheDocument();
    expect(within(dialog).queryByRole('region')).toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    const search = within(dialog).getByRole('link', {
      name: `${tr('map.searchExternal')} ${tr('map.newTab')}`,
    });
    expect(search.getAttribute('href')).toBe(
      `https://www.openstreetmap.org/search?query=${encodeURIComponent('Dunajska cesta 5, 1000 Ljubljana, Slovenija')}`,
    );
    expect((await axe(dialog)).violations).toEqual([]);
  });

  it('FR-016-22: približna lokacija pokaže zemljevid z opozorilom in povezavo za iskanje', async () => {
    locations(found({ status: 'APPROXIMATE', latitude: 46.55, longitude: 15.64 }));
    const { user } = await openContact();

    await user.click(mapButton('Dostava'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('region')).toBeInTheDocument();
    // getByText: opozorilo je golo besedilo v pogovornem oknu (brez vloge status/alert); okno je izbrano po vlogi.
    expect(within(dialog).getByText(tr('map.approximate'))).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      tr('map.descriptionApproximate', { lat: '46,55000', lon: '15,64000' }),
    );
    expect(
      within(dialog).getByRole('link', { name: `${tr('map.searchExternal')} ${tr('map.newTab')}` }),
    ).toBeInTheDocument();
  });

  it('FR-016-22: nedosegljiva storitev je trajno sporočilo s Poskusi znova; ponovni poskus uspe', async () => {
    const seen = locations(
      () => HttpResponse.json({ code: 'MAP_SERVICE_UNAVAILABLE' }, { status: 503 }),
      found({ status: 'EXACT', latitude: 46.05, longitude: 14.5 }),
    );
    const { user } = await openContact();

    await user.click(mapButton('Dostava'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('map.unavailable'));
    expect((await axe(screen.getByRole('dialog'))).violations).toEqual([]);
    await user.click(within(alert).getByRole('button', { name: tr('map.retry') }));

    expect(
      await screen.findByRole('region', { name: tr('map.region', { name: 'Dostava' }) }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(seen).toHaveLength(2);
    // Podatki kontakta ostanejo dostopni (po zaprtju modalnega dialoga).
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana Novak' })).toBeInTheDocument();
  });

  it('FR-016-27: angleški vmesnik', async () => {
    await i18n.changeLanguage('en');
    const seen = locations(found({ status: 'EXACT', latitude: 46.05, longitude: 14.5 }));
    const { user } = await openContact();

    await user.click(screen.getByRole('button', { name: 'Show on map: Dostava' }));

    expect(await screen.findByRole('dialog', { name: 'Map: Dostava' })).toBeInTheDocument();
    await screen.findByRole('region', { name: tr('map.region', { name: 'Dostava' }) });
    expect(seen).toEqual([{ language: 'en', key: 'Dostava' }]);
  });
});
