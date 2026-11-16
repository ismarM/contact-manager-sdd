import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  deferred,
  GROUP_ID,
  renderContactsApp,
  validationFailedReply,
} from '../../../test/contactsApi';
import { server } from '../../../test/msw';
import { currentLocation } from '../../../test/renderApp';
import { chooseCountry, country, name, tr } from '../../../test/smartAttributes';
import { typeName } from '../../../test/typedAttributesApi';
import type { AddressSuggestion } from '../../attributes/types';

// Naslov po delih s samodokončanjem prek našega zaledja (FR-016-12 … FR-016-15, FR-016-19). MSW samo za naš `/api`:
// vsak drug zahtevek (tuj izvor) je napaka testa (`onUnhandledRequest: 'error'`).

const LIST = `/groups/${GROUP_ID}/contacts`;
const CREATE = `/api/groups/${GROUP_ID}/contacts`;
const UPDATE = `${CREATE}/${CONTACT_ID}`;
const SUGGEST = `/api/groups/${GROUP_ID}/address-suggestions`;
const CREATED = contactDetail({ id: CONTACT_ID, version: 0 });

const part = (key: string) => tr(`address.parts.${key}`);

const SLOVENSKA: AddressSuggestion = {
  label: 'Slovenska cesta 1, 1000 Ljubljana, Slovenija',
  street: 'Slovenska cesta 1',
  postalCode: '1000',
  city: 'Ljubljana',
  country: 'SI',
};

/** Rokovalnik predlogov naslova; zabeleži parametre zahtevkov. */
function suggestions(reply: (q: string) => Promise<Response> | Response) {
  const seen: URLSearchParams[] = [];
  server.use(
    http.get(SUGGEST, async ({ request }) => {
      const url = new URL(request.url);
      seen.push(url.searchParams);
      return reply(url.searchParams.get('q') ?? '');
    }),
  );
  return seen;
}

async function openNew() {
  const view = renderContactsApp(`${LIST}/new`, {
    role: 'EDITOR',
    contacts: { create: () => ({ status: 201, body: CREATED }) },
  });
  await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
  await view.user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Ana');
  return view;
}

const addressGroup = () => screen.getByRole('group', { name: tr('address.legend') });

describe('Naslov po delih', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-12 FR-016-15: deli gredo v addressParts, država naslova je predizpolnjena z državo kontakta', async () => {
    suggestions(() => HttpResponse.json({ items: [] }));
    const { user, api } = await openNew();
    await chooseCountry(
      user,
      screen.getByRole('combobox', { name: name.country() }),
      'Avstr',
      country('AT'),
    );
    const group = addressGroup();

    await user.type(within(group).getByRole('combobox', { name: part('street') }), 'Hauptplatz  1');
    await user.type(within(group).getByRole('textbox', { name: part('postalCode') }), '8010');
    await user.type(within(group).getByRole('combobox', { name: part('city') }), 'Graz');
    expect(within(group).getByRole('combobox', { name: part('country') })).toHaveValue(
      country('AT'),
    );
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CONTACT_ID}`));
    const body = api.of('POST', CREATE)[0]?.body as Record<string, unknown>;
    expect(body.address).toBeNull();
    expect(body.addressParts).toEqual({
      street: 'Hauptplatz 1',
      postalCode: '8010',
      city: 'Graz',
      country: 'AT',
    });
  });

  it('FR-016-12: brez ulice in kraja je napaka ob polju in zahtevek ni poslan; prazen naslov ni poslan', async () => {
    const { user, api } = await openNew();
    const group = addressGroup();
    await user.type(within(group).getByRole('textbox', { name: part('postalCode') }), '1000');
    await user.click(screen.getByRole('button', { name: name.save() }));

    const street = within(group).getByRole('combobox', { name: part('street') });
    expect(street).toHaveAttribute('aria-invalid', 'true');
    expect(street).toHaveAccessibleDescription(tr('address.errors.REQUIRED'));
    expect(api.of('POST', CREATE)).toHaveLength(0);

    await user.clear(within(group).getByRole('textbox', { name: part('postalCode') }));
    await user.click(screen.getByRole('button', { name: name.save() }));
    await waitFor(() => expect(api.of('POST', CREATE)).toHaveLength(1));
    expect(api.of('POST', CREATE)[0]?.body).not.toHaveProperty('addressParts');
  });

  it('FR-016-13: po 3 znakih in zamiku do 5 predlogov prek našega strežnika; izbira s tipkovnico izpolni dele, ki ostanejo urejljivi', async () => {
    const seen = suggestions(() =>
      HttpResponse.json({
        items: [
          SLOVENSKA,
          ...Array.from({ length: 5 }, (_, i) => ({ label: `Kraj ${i}`, city: `Kraj ${i}` })),
        ],
      }),
    );
    const { user, api } = await openNew();
    const group = addressGroup();
    const street = within(group).getByRole('combobox', { name: part('street') });

    await user.type(street, 'Sl');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(seen).toHaveLength(0);
    await user.type(street, 'o');

    const list = await screen.findByRole('listbox', { name: tr('address.suggestions.label') });
    expect(within(list).getAllByRole('option')).toHaveLength(5);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.get('q')).toBe('Slo');
    expect(seen[0]?.get('language')).toBe('sl');
    expect(seen[0]?.has('country')).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(
      tr('address.suggestions.count', { total: 5 }),
    );

    await user.keyboard('{ArrowDown}');
    expect(street).toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(street).toHaveValue('Slovenska cesta 1');
    expect(within(group).getByRole('textbox', { name: part('postalCode') })).toHaveValue('1000');
    expect(within(group).getByRole('combobox', { name: part('city') })).toHaveValue('Ljubljana');
    expect(within(group).getByRole('combobox', { name: part('country') })).toHaveValue(
      country('SI'),
    );
    await user.type(street, 'a');
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('POST', CREATE)).toHaveLength(1));
    expect((api.of('POST', CREATE)[0]?.body as Record<string, unknown>).addressParts).toEqual({
      street: 'Slovenska cesta 1a',
      postalCode: '1000',
      city: 'Ljubljana',
      country: 'SI',
    });
  });

  it('FR-016-13: država kontakta gre v zahtevek predlogov; Esc zapre seznam', async () => {
    const seen = suggestions(() => HttpResponse.json({ items: [SLOVENSKA] }));
    const { user } = await openNew();
    await chooseCountry(
      user,
      screen.getByRole('combobox', { name: name.country() }),
      'Sloven',
      country('SI'),
    );
    const city = within(addressGroup()).getByRole('combobox', { name: part('city') });

    await user.type(city, 'Ljub');
    await screen.findByRole('listbox', { name: tr('address.suggestions.label') });
    expect(seen.at(-1)?.get('country')).toBe('SI');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(city).toHaveValue('Ljub');
  });

  it('FR-016-13: napaka predlogov ne prikaže napake in obrazec se shrani', async () => {
    const seen = suggestions(() => new HttpResponse(null, { status: 500 }));
    const { user, api } = await openNew();
    const street = within(addressGroup()).getByRole('combobox', { name: part('street') });

    await user.type(street, 'Slovenska cesta 1');
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(tr('address.suggestions.none')),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('POST', CREATE)).toHaveLength(1));
    expect((api.of('POST', CREATE)[0]?.body as Record<string, unknown>).addressParts).toEqual({
      street: 'Slovenska cesta 1',
    });
  });

  it('FR-016-13: zastarel odgovor ne prepiše novejšega', async () => {
    const slow = deferred<void>();
    suggestions(async (q) => {
      if (q === 'Mar') await slow.promise;
      return HttpResponse.json({ items: [{ label: `Zadetek ${q}`, city: q }] });
    });
    const { user } = await openNew();
    const city = within(addressGroup()).getByRole('combobox', { name: part('city') });

    await user.type(city, 'Mar');
    await new Promise((resolve) => setTimeout(resolve, 400));
    await user.type(city, 'ib');
    const list = await screen.findByRole('listbox', { name: tr('address.suggestions.label') });
    slow.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Zadetek Marib']);
  });

  it('FR-016-14: nerazčlenjen naslov je prikazan kot besedilo; Razčleni naslov predlaga dele, shrani pošlje dele', async () => {
    const legacy = contactDetail({
      id: CONTACT_ID,
      version: 4,
      address: 'Slovenska cesta 1\n1000 Ljubljana\n3. nadstropje',
      country: 'SI',
    });
    suggestions(() => HttpResponse.json({ items: [] }));
    const { user, api } = renderContactsApp(`${LIST}/${CONTACT_ID}/edit`, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: legacy }) },
    });
    await screen.findByText(tr('address.unstructured'));
    expect(screen.queryByRole('group', { name: tr('address.legend') })).not.toBeInTheDocument();
    expect(screen.getByText(/3\. nadstropje/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: tr('address.split') }));

    const group = addressGroup();
    const street = within(group).getByRole('combobox', { name: part('street') });
    expect(street).toHaveFocus();
    expect(street).toHaveValue('Slovenska cesta 1');
    expect(within(group).getByRole('textbox', { name: part('postalCode') })).toHaveValue('1000');
    expect(within(group).getByRole('combobox', { name: part('city') })).toHaveValue('Ljubljana');
    expect(within(group).getByRole('textbox', { name: part('extra') })).toHaveValue(
      '3. nadstropje',
    );
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('PUT', UPDATE)).toHaveLength(1));
    const body = api.of('PUT', UPDATE)[0]?.body as Record<string, unknown>;
    expect(body.address).toBeNull();
    expect(body.addressParts).toEqual({
      street: 'Slovenska cesta 1',
      extra: '3. nadstropje',
      postalCode: '1000',
      city: 'Ljubljana',
      country: 'SI',
    });
  });

  it('FR-016-14 FR-016-04: brez razčlenitve se nerazčlenjen naslov pošlje nespremenjen', async () => {
    const legacy = contactDetail({
      id: CONTACT_ID,
      version: 4,
      address: 'Ulica 1\n1000 Ljubljana',
    });
    const { user, api } = renderContactsApp(`${LIST}/${CONTACT_ID}/edit`, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: legacy }) },
    });
    const first = await screen.findByRole('textbox', { name: 'Ime' });
    await user.type(first, 'x');
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('PUT', UPDATE)).toHaveLength(1));
    const body = api.of('PUT', UPDATE)[0]?.body as Record<string, unknown>;
    expect(body.address).toBe('Ulica 1\n1000 Ljubljana');
    expect(body).not.toHaveProperty('addressParts');
  });

  it('FR-016-12: atribut tipa Naslov ima dele; zahtevek pošlje parts brez vrednosti', async () => {
    suggestions(() => HttpResponse.json({ items: [] }));
    const { user, api } = await openNew();
    await user.click(screen.getByRole('button', { name: name.addAttribute() }));
    await user.type(screen.getByRole('combobox', { name: name.key() }), 'Vikend');
    await user.tab();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('ADDRESS'),
    );

    const group = screen.getByRole('group', { name: 'Vikend' });
    await user.type(within(group).getByRole('combobox', { name: part('city') }), 'Bovec');
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('POST', CREATE)).toHaveLength(1));
    expect((api.of('POST', CREATE)[0]?.body as { attributes: unknown[] }).attributes).toEqual([
      { key: 'Vikend', type: 'ADDRESS', value: null, parts: { city: 'Bovec' } },
    ]);
  });

  it('FR-016-12: napake strežnika po delih se prikažejo ob delu naslova', async () => {
    suggestions(() => HttpResponse.json({ items: [] }));
    const { user } = renderContactsApp(`${LIST}/new`, {
      role: 'EDITOR',
      contacts: {
        create: () =>
          validationFailedReply(
            { field: 'addressParts.postalCode', code: 'TOO_LONG' },
            { field: 'addressParts.country', code: 'INVALID_VALUE' },
          ),
      },
    });
    await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Ana');
    const group = addressGroup();
    await user.type(within(group).getByRole('combobox', { name: part('city') }), 'Kranj');
    await user.type(within(group).getByRole('textbox', { name: part('postalCode') }), '4000');
    await user.click(screen.getByRole('button', { name: name.save() }));

    const postal = within(group).getByRole('textbox', { name: part('postalCode') });
    await waitFor(() => expect(postal).toHaveAttribute('aria-invalid', 'true'));
    expect(postal).toHaveAccessibleDescription(tr('address.errors.TOO_LONG'));
    expect(
      within(group).getByRole('combobox', { name: part('country') }),
    ).toHaveAccessibleDescription(tr('contacts.errors.countryInvalid'));
  });

  it('FR-016-13: obrazec z odprtim seznamom predlogov naslova je brez kršitev axe', async () => {
    suggestions(() => HttpResponse.json({ items: [SLOVENSKA] }));
    const { user, container } = await openNew();
    await user.type(within(addressGroup()).getByRole('combobox', { name: part('street') }), 'Slov');
    await screen.findByRole('listbox', { name: tr('address.suggestions.label') });

    expect((await axe(container)).violations).toEqual([]);
  });
});
