import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactDetail,
  GROUP_ID,
  renderContactsApp,
  suggestionsServer,
} from '../../test/contactsApi';
import { chooseCountry, country, name, optionTexts, tr } from '../../test/smartAttributes';

// Izbirno polje *Država* brez prostega besedila (FR-013-12, FR-013-13, FR-013-17; design.md 8.4).

// Država kontakta je pri novem kontaktu skrita (nov kontakt je poenostavljen), zato se polje preizkuša pri urejanju.
const EDIT = `/groups/${GROUP_ID}/contacts/${contactDetail().id}/edit`;
const UPDATE = `/api/groups/${GROUP_ID}/contacts/${contactDetail().id}`;

const POPULAR = [
  { text: 'AT', count: 9 },
  { text: 'DE', count: 2 },
];

async function openForm(options: Parameters<typeof renderContactsApp>[1] = {}) {
  const view = renderContactsApp(EDIT, {
    role: 'EDITOR',
    ...options,
    contacts: {
      get: () => ({ status: 200, body: contactDetail() }),
      update: () => ({ status: 200, body: contactDetail({ version: 3 }) }),
      suggestions: suggestionsServer({ country: POPULAR }),
      ...options.contacts,
    },
  });
  await screen.findByRole('heading', { level: 2, name: tr('contacts.form.editHeading') });
  return { ...view, field: await screen.findByRole('combobox', { name: name.country() }) };
}

function sentBody(api: Awaited<ReturnType<typeof openForm>>['api']) {
  return api.of('PUT', UPDATE)[0]?.body as Record<string, unknown>;
}

describe('CountryField', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-013-13: vpis »avs« ponudi Avstrijo; izbira s tipkovnico shrani kodo AT', async () => {
    const { user, field, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');

    await user.click(field);
    await user.type(field, 'avstri');
    const listbox = await screen.findByRole('listbox', { name: tr('contacts.form.countryList') });
    expect(optionTexts(listbox)).toEqual([country('AT')]);
    await user.keyboard('{Enter}');

    expect(field).toHaveValue('Avstrija');
    await user.click(screen.getByRole('button', { name: name.save() }));
    await waitFor(() => expect(sentBody(api)).toBeDefined());
    expect(sentBody(api)).toMatchObject({ country: 'AT' });
  });

  it('FR-013-13: iskanje po kodi – »at« ima Avstrijo na prvem mestu', async () => {
    const { user, field } = await openForm();

    await user.click(field);
    await user.type(field, 'at');

    const listbox = await screen.findByRole('listbox');
    expect(optionTexts(listbox)[0]).toBe('Avstrija');
    expect(field).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
  });

  it('FR-013-13: polje ne sprejme besedila, ki ni država – po zapustitvi se vrne prejšnja izbira', async () => {
    const { user, field, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    await chooseCountry(user, field, 'avstri', country('AT'));

    await user.clear(field);
    await user.type(field, 'xyzzy');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(sentBody(api)).toBeDefined());

    // Enter v polju brez zadetkov odda obrazec s prejšnjo izbiro (besedilo ni bilo sprejeto kot država).
    expect(sentBody(api)).toMatchObject({ country: 'AT' });
  });

  it('FR-013-13: besedilo, ki ni država, ob zapustitvi izgine in vrne ime izbrane države', async () => {
    const { user, field } = await openForm();
    await chooseCountry(user, field, 'avstri', country('AT'));

    await user.clear(field);
    await user.type(field, 'xyzzy');
    await user.tab();

    expect(field).toHaveValue(country('AT'));
  });

  it('FR-013-13: izbris besedila počisti državo (null v zahtevku)', async () => {
    const { user, field, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    await chooseCountry(user, field, 'avstri', country('AT'));

    await user.clear(field);
    await user.tab();
    expect(field).toHaveValue('');
    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(sentBody(api)).toBeDefined());
    expect([null, undefined, '']).toContain(sentBody(api).country);
  });

  it('FR-013-12: prazen fokus – najprej države skupine po pogostosti, nato ostale po abecedi', async () => {
    const { user, field } = await openForm();

    await user.click(field);

    const listbox = await screen.findByRole('listbox');
    await waitFor(() =>
      expect(optionTexts(listbox).slice(0, 2)).toEqual([country('AT'), country('DE')]),
    );
    const rest = optionTexts(listbox).slice(2);
    expect(rest).toHaveLength(247);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'sl')));
    expect(rest).not.toContain(country('AT'));
  });

  it('FR-013-17: če klic predlogov odpove, seznam še vedno deluje', async () => {
    const { user, field } = await openForm({
      contacts: { suggestions: () => ({ status: 500, body: { code: 'INTERNAL' } }) },
    });

    await user.click(field);

    const listbox = await screen.findByRole('listbox');
    expect(optionTexts(listbox)).toHaveLength(249);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(field, 'avstri');
    await user.keyboard('{Enter}');
    expect(field).toHaveValue('Avstrija');
  });

  it('FR-013-13: v angleškem vmesniku so imena v angleščini; iskanje po angleškem imenu', async () => {
    await i18n.changeLanguage('en');
    const { user, api } = await openForm();
    const field = screen.getByRole('combobox', { name: 'Country' });
    await user.type(screen.getByRole('textbox', { name: 'First name' }), 'Janez');

    await chooseCountry(user, field, 'austri', 'Austria');
    await user.click(screen.getByRole('button', { name: 'Save contact' }));

    await waitFor(() => expect(sentBody(api)).toMatchObject({ country: 'AT' }));
  });

  it('FR-013-13: urejanje – polje pokaže ime države iz shranjene kode', async () => {
    renderContactsApp(`/groups/${GROUP_ID}/contacts/${contactDetail().id}/edit`, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: contactDetail({ country: 'DE' }) }) },
    });

    const field = await screen.findByRole('combobox', { name: name.country() });

    await waitFor(() => expect(field).toHaveValue('Nemčija'));
  });

  it('FR-013-13: axe brez kršitev z odprtim seznamom držav', async () => {
    const { user, field, container } = await openForm();
    await user.click(field);
    await screen.findByRole('listbox');

    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect((await axe(container)).violations).toEqual([]);
  });
});
