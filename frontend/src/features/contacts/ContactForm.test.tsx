import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactDetail,
  contactId,
  GROUP_ID,
  renderContactsApp,
  validationFailedReply,
} from '../../test/contactsApi';
import { chooseCountry, country, name, tr } from '../../test/smartAttributes';
import { currentLocation } from '../../test/renderApp';

// Nov kontakt: obrazec, preverjanje, povzetek napak, napake strežnika (FR-004-01, -02, -03, -16; design.md 8.2, 8.3).

const LIST = `/groups/${GROUP_ID}/contacts`;
const NEW = `${LIST}/new`;
const CREATED = contactId(999);

async function openForm(options: Parameters<typeof renderContactsApp>[1] = {}) {
  const view = renderContactsApp(NEW, { role: 'EDITOR', ...options });
  await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
  return view;
}

/** Država kontakta je pri novem kontaktu skrita (poenostavljen obrazec), zato se polje preizkuša pri urejanju. */
async function openEditForm(options: Parameters<typeof renderContactsApp>[1] = {}) {
  const view = renderContactsApp(`${LIST}/${contactDetail().id}/edit`, {
    role: 'EDITOR',
    ...options,
    contacts: {
      get: () => ({ status: 200, body: contactDetail() }),
      update: () => ({ status: 200, body: contactDetail({ version: 3 }) }),
      ...options.contacts,
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
  await screen.findByRole('textbox', { name: 'Ime' });
  return view;
}

describe('ContactForm', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-01: obrazec ima tri skupine polj in polja z vidnimi oznakami; naslov strani', async () => {
    await openForm();

    const form = screen.getByRole('form', { name: 'Nov kontakt' });
    expect(within(form).getByRole('group', { name: 'Osnovni podatki' })).toBeInTheDocument();
    expect(within(form).getByRole('group', { name: 'Dodatni atributi' })).toBeInTheDocument();
    expect(within(form).getByRole('group', { name: 'Značke' })).toBeInTheDocument();
    for (const label of ['Ime', 'Priimek', 'E-naslov', 'Telefon']) {
      expect(within(form).getByRole('textbox', { name: label })).toBeInTheDocument();
    }
    // 016 (FR-016-12): naslov je skupina delov, ulica in kraj sta kombinirani polji s predlogi naslova.
    const address = within(form).getByRole('group', { name: 'Naslov' });
    expect(
      within(address).getByRole('combobox', { name: 'Ulica in hišna številka' }),
    ).toBeInTheDocument();
    expect(within(address).getByRole('combobox', { name: 'Kraj' })).toBeInTheDocument();
    expect(within(address).getByRole('textbox', { name: 'Poštna številka' })).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'E-naslov' })).toHaveAttribute(
      'type',
      'email',
    );
    expect(within(form).getByRole('textbox', { name: 'Telefon' })).toHaveAttribute('type', 'tel');
    expect(within(form).getByRole('combobox', { name: 'Dodaj značko' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Shrani kontakt' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Prekliči' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Nov kontakt – Projekt FERI – Kontakti'));
  });

  it('FR-004-01 FR-004-03: urednik ustvari kontakt z atributom in značkama; obvestilo in pogled novega kontakta', async () => {
    const { user, api } = await openForm({
      contacts: {
        create: () => ({
          status: 201,
          body: contactDetail({
            id: CREATED,
            version: 0,
            attributes: [{ key: 'kompetenca', value: 'web dev' }],
            tags: ['ne_obveščaj', 'konferenca2025'],
          }),
        }),
        get: () => ({
          status: 200,
          body: contactDetail({
            id: CREATED,
            version: 0,
            attributes: [{ key: 'kompetenca', value: 'web dev' }],
            tags: ['ne_obveščaj', 'konferenca2025'],
          }),
        }),
      },
    });

    await user.type(screen.getByRole('textbox', { name: 'Ime' }), '  Janez ');
    await user.type(screen.getByRole('textbox', { name: 'Priimek' }), 'Novak');
    await user.type(screen.getByRole('textbox', { name: 'E-naslov' }), 'janez@primer.si');
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    const key = screen.getByRole('combobox', { name: 'Ključ' });
    expect(key).toHaveFocus();
    await user.type(key, 'kompetenca');
    await user.type(screen.getByRole('combobox', { name: 'Vrednost' }), 'web dev');
    const tags = screen.getByRole('combobox', { name: 'Dodaj značko' });
    await user.type(tags, 'ne_obveščaj{Enter}');
    await user.type(tags, 'konferenca2025{Enter}');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CREATED}`));
    // Pogodba: prazno polje je `null`, izpuščeno ali prazen niz; strežnik obreže vrednosti (R-06).
    const sent = api.of('POST', `/api/groups/${GROUP_ID}/contacts`)[0]?.body as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({
      lastName: 'Novak',
      email: 'janez@primer.si',
      attributes: [{ key: 'kompetenca', value: 'web dev' }],
      tags: ['ne_obveščaj', 'konferenca2025'],
    });
    expect(String(sent.firstName).trim()).toBe('Janez');
    expect([null, undefined, '']).toContain(sent.address);
    expect([null, undefined, '']).toContain(sent.phone);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Janez Novak je shranjen.',
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Janez Novak' }),
    ).toBeInTheDocument();
  });

  it('FR-004-02 FR-004-03: brez imena in priimka – povzetek z napako, fokus nanj, brez zahtevka', async () => {
    const { user, api } = await openForm();

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Obrazec vsebuje napake.');
    expect(summary).toHaveFocus();
    const link = within(summary).getAllByRole('link', { name: 'Vpiši vsaj ime ali priimek.' })[0]!;
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Priimek' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveAccessibleDescription(
      'Vpiši vsaj ime ali priimek.',
    );
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    await user.click(link);
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveFocus();
  });

  it('FR-004-03: neveljaven e-naslov – napaka šele ob zapustitvi polja in izgine med popravljanjem', async () => {
    const { user } = await openForm();
    const email = screen.getByRole('textbox', { name: 'E-naslov' });

    await user.type(email, 'janez@');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
    expect(email).not.toHaveAccessibleDescription('Vpiši veljaven e-naslov.');
    await user.tab();

    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveAccessibleDescription('Vpiši veljaven e-naslov.');
    await user.click(email);
    await user.type(email, 'p');
    expect(email).not.toHaveAccessibleDescription('Vpiši veljaven e-naslov.');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('FR-004-02: neveljaven telefon in predolgo ime sta zavrnjena ob zapustitvi polja', async () => {
    const { user } = await openForm();

    await user.type(screen.getByRole('textbox', { name: 'Telefon' }), '01 234 abc');
    await user.tab();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ime' }), {
      target: { value: 'a'.repeat(101) },
    });
    await user.click(screen.getByRole('textbox', { name: 'Ime' }));
    await user.tab();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Telefon' })).toHaveAccessibleDescription(
        'Vpiši veljaven telefon, npr. 041 123 456 ali +386 41 123 456.',
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveAccessibleDescription(
        'Ime je predolgo (največ 100 znakov).',
      ),
    );
  });

  it('FR-004-02: podvojen ključ in rezerviran ključ sta napaki ob polju Ključ', async () => {
    const { user, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    for (const [index, key] of ['Kompetenca', 'kompetenca', 'Telefon'].entries()) {
      await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
      await user.type(screen.getAllByRole('combobox', { name: 'Ključ' })[index]!, key);
      await user.type(screen.getAllByRole('combobox', { name: 'Vrednost' })[index]!, 'x');
    }

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const keys = screen.getAllByRole('combobox', { name: 'Ključ' });
    await waitFor(() =>
      expect(keys[1]).toHaveAccessibleDescription('Ključ že obstaja v tem kontaktu.'),
    );
    expect(keys[0]).not.toHaveAttribute('aria-invalid', 'true');
    expect(keys[2]).toHaveAccessibleDescription('Ključ je rezerviran za predefinirano polje.');
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('FR-004-02: vrstica z enim praznim poljem je napaka, popolnoma prazna vrstica se ne pošlje', async () => {
    const { user, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await user.type(screen.getAllByRole('combobox', { name: 'Ključ' })[1]!, 'kompetenca');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() =>
      expect(screen.getAllByRole('combobox', { name: 'Vrednost' })[1]).toHaveAccessibleDescription(
        'Vpiši vrednost.',
      ),
    );
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);

    await user.type(screen.getAllByRole('combobox', { name: 'Vrednost' })[1]!, 'web dev');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(api.of('POST', `/api/groups/${GROUP_ID}/contacts`)).toHaveLength(1));
    expect(api.of('POST', `/api/groups/${GROUP_ID}/contacts`)[0]?.body).toMatchObject({
      attributes: [{ key: 'kompetenca', value: 'web dev' }],
    });
  });

  it('FR-004-03: Odstrani atribut odstrani vrstico in fokus ostane v obrazcu', async () => {
    const { user } = await openForm();
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'kompetenca');
    expect(screen.getByRole('button', { name: 'Odstrani atribut kompetenca' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Odstrani atribut kompetenca' }));

    expect(screen.queryByRole('combobox', { name: 'Ključ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Odstrani atribut/ })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Nov kontakt' }).contains(document.activeElement)).toBe(
      true,
    );
  });

  it('FR-004-02: pri 50 atributih Dodaj atribut pokaže napako in ne doda vrstice', async () => {
    const { user } = await openForm();
    const add = screen.getByRole('button', { name: 'Dodaj atribut' });
    for (let i = 0; i < 50; i += 1) fireEvent.click(add);
    expect(screen.getAllByRole('combobox', { name: 'Ključ' })).toHaveLength(50);

    await user.click(add);

    expect(screen.getAllByRole('combobox', { name: 'Ključ' })).toHaveLength(50);
    expect(add).toHaveAccessibleDescription('Dodaš lahko največ 50 atributov.');
  });

  it('FR-004-02: napake strežnika (400) se prikažejo ob poljih', async () => {
    const { user } = await openForm({
      contacts: {
        create: () => ({
          status: 400,
          body: {
            code: 'VALIDATION_FAILED',
            errors: [
              { field: 'email', code: 'INVALID_VALUE' },
              { field: 'attributes[0].key', code: 'DUPLICATE' },
            ],
          },
        }),
      },
    });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.type(screen.getByRole('textbox', { name: 'E-naslov' }), 'janez@primer.si');
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'kompetenca');
    await user.type(screen.getByRole('combobox', { name: 'Vrednost' }), 'x');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'E-naslov' })).toHaveAccessibleDescription(
        'Vpiši veljaven e-naslov.',
      ),
    );
    expect(screen.getByRole('combobox', { name: 'Ključ' })).toHaveAccessibleDescription(
      'Ključ že obstaja v tem kontaktu.',
    );
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
  });

  it('FR-004-16: strežnik vrne napako – trajno sporočilo, podatki ostanejo, Poskusi znova pošlje isto telo', async () => {
    let fail = true;
    const { user, api } = await openForm({
      contacts: {
        create: () =>
          fail
            ? { status: 500, body: { code: 'INTERNAL' } }
            : { status: 201, body: contactDetail({ id: CREATED, version: 0 }) },
        get: () => ({ status: 200, body: contactDetail({ id: CREATED, version: 0 }) }),
      },
    });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kontakta ni bilo mogoče shraniti. Poskusi znova.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CREATED}`));
    const posts = api.of('POST', `/api/groups/${GROUP_ID}/contacts`);
    expect(posts).toHaveLength(2);
    expect(posts[1]?.body).toEqual(posts[0]?.body);
  });

  it('FR-004-16: strežnik ni dosegljiv – sporočilo o povezavi in Poskusi znova, obrazec ostane odprt', async () => {
    const { user } = await openForm({ contacts: { create: () => 'network-error' } });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ni povezave. Preveri povezavo in poskusi znova.');
    expect(within(alert).getByRole('button', { name: 'Poskusi znova' })).toBeInTheDocument();
    expect(currentLocation()).toBe(NEW);
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
  });

  it('FR-004-16: 403 pri shranjevanju – sporočilo o pravicah', async () => {
    const { user } = await openForm({
      contacts: { create: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) },
    });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Za to dejanje nimaš več pravic.');
  });

  it('FR-004-15: 409 GROUP_ARCHIVED pri shranjevanju – sporočilo, obrazec in podatki ostanejo', async () => {
    const { user } = await openForm({
      contacts: { create: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }) },
    });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Janez');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana – kontaktov ni mogoče spreminjati.',
    );
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez');
  });

  it('FR-004-16: angleški vmesnik – napake brez tehničnih kod (strežnik, brez povezave)', async () => {
    await i18n.changeLanguage('en');
    let reply: 'server' | 'offline' = 'server';
    const view = renderContactsApp(NEW, {
      role: 'EDITOR',
      contacts: {
        create: () =>
          reply === 'server' ? { status: 500, body: { code: 'INTERNAL' } } : 'network-error',
      },
    });
    await screen.findByRole('heading', { level: 2, name: 'New contact' });
    await view.user.type(screen.getByRole('textbox', { name: 'First name' }), 'Janez');

    await view.user.click(screen.getByRole('button', { name: 'Save contact' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The contact could not be saved. Please try again.');
    expect(alert).not.toHaveTextContent('INTERNAL');
    reply = 'offline';
    await view.user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "You're offline. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole('textbox', { name: 'First name' })).toHaveValue('Janez');
  });

  it('FR-004-03: brez kršitev axe (sl in en, s povzetkom napak in napako ob polju)', async () => {
    const { user, container } = await openForm();
    await user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));
    await screen.findByRole('alert');
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'New contact' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'First name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save contact' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('nov kontakt nima polj Dodatna vrstica in Država; urejanje ju ima', async () => {
    const { unmount } = await openForm();
    const group = screen.getByRole('group', { name: tr('address.legend') });
    expect(within(group).queryByRole('textbox', { name: tr('address.parts.extra') })).toBeNull();
    expect(screen.queryByRole('combobox', { name: name.country() })).toBeNull();
    expect(
      within(group).getByRole('combobox', { name: tr('address.parts.country') }),
    ).toBeVisible();
    unmount();

    await openEditForm();
    const editGroup = screen.getByRole('group', { name: tr('address.legend') });
    expect(
      within(editGroup).getByRole('textbox', { name: tr('address.parts.extra') }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: name.country() })).toBeVisible();
  });

  it('FR-013-01: Podjetje je po Priimku, Država po Naslovu; obe sta v obrazcu vidni z oznakama', async () => {
    await openEditForm();
    const last = screen.getByRole('textbox', { name: tr('contacts.form.lastName') });
    const company = screen.getByRole('combobox', { name: name.company() });
    // 016: naslov je skupina delov (FR-016-12).
    const address = screen.getByRole('group', { name: tr('address.legend') });
    const countryField = screen.getByRole('combobox', { name: name.country() });
    const email = screen.getByRole('textbox', { name: tr('contacts.form.email') });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(last, company)).toBe(true);
    expect(follows(company, address)).toBe(true);
    expect(follows(address, countryField)).toBe(true);
    expect(follows(countryField, email)).toBe(true);
  });

  it('FR-013-01: podjetje in država (koda) gresta v telo zahtevka; prazni polji sta null', async () => {
    const { user, api } = await openEditForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    await user.type(screen.getByRole('combobox', { name: name.company() }), 'Acme d.o.o.');
    await chooseCountry(
      user,
      screen.getByRole('combobox', { name: name.country() }),
      'slov',
      country('SI'),
    );

    await user.click(screen.getByRole('button', { name: name.save() }));

    const update = `/api/groups/${GROUP_ID}/contacts/${contactDetail().id}`;
    await waitFor(() => expect(api.of('PUT', update)).toHaveLength(1));
    expect(api.of('PUT', update)[0]?.body).toMatchObject({
      company: 'Acme d.o.o.',
      country: 'SI',
    });
  });

  it('FR-013-01: podjetje z 201 znaki je napaka ob polju brez zahtevka', async () => {
    const { user, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    const company = screen.getByRole('combobox', { name: name.company() });
    fireEvent.change(company, { target: { value: 'x'.repeat(201) } });

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() =>
      expect(company).toHaveAccessibleDescription(tr('contacts.errors.companyTooLong')),
    );
    expect(company).toHaveAttribute('aria-invalid', 'true');
    expect(api.of('POST', `/api/groups/${GROUP_ID}/contacts`)).toHaveLength(0);
  });

  it('FR-013-13: napaka strežnika za državo (INVALID_VALUE) se pokaže ob polju Država', async () => {
    const { user } = await openEditForm({
      contacts: {
        update: () => validationFailedReply({ field: 'country', code: 'INVALID_VALUE' }),
      },
    });
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.country() })).toHaveAccessibleDescription(
        tr('contacts.errors.countryInvalid'),
      ),
    );
  });

  it.each([
    ['Country', 'contacts.errors.keyReservedCountry'],
    ['država', 'contacts.errors.keyReservedCountry'],
    ['COMPANY', 'contacts.errors.keyReservedCompany'],
    ['Podjetje', 'contacts.errors.keyReservedCompany'],
  ])('FR-013-08: nov ključ »%s« je napaka ob ključu, ki napoti na polje', async (key, message) => {
    const { user, api } = await openForm();
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    await user.click(screen.getByRole('button', { name: name.addAttribute() }));
    await user.type(screen.getByRole('combobox', { name: name.key() }), key);
    await user.type(screen.getByRole('combobox', { name: name.value() }), 'x');

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.key() })).toHaveAccessibleDescription(
        tr(message),
      ),
    );
    expect(api.of('POST', `/api/groups/${GROUP_ID}/contacts`)).toHaveLength(0);
  });

  it('FR-013-08: RESERVED_KEY iz strežnika pokaže sporočilo o polju Država ob ključu', async () => {
    const { user } = await openForm({
      contacts: {
        create: () => validationFailedReply({ field: 'attributes[0].key', code: 'RESERVED_KEY' }),
      },
    });
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.firstName') }), 'Janez');
    await user.click(screen.getByRole('button', { name: name.addAttribute() }));
    // Strežnik ima lahko strožja pravila od vmesnika: ključ, ki ga vmesnik ne pozna kot rezerviranega.
    await user.type(screen.getByRole('combobox', { name: name.key() }), 'Hobi');
    await user.type(screen.getByRole('combobox', { name: name.value() }), 'x');

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.key() })).toHaveAccessibleDescription(
        tr('contacts.errors.keyReserved'),
      ),
    );
  });

  it('FR-013-08: obstoječ atribut z rezerviranim imenom se ob shranjevanju pošlje nespremenjen', async () => {
    const loaded = contactDetail({
      version: 3,
      attributes: [{ key: 'Država', value: 'Slovenija' }],
    });
    const { user, api } = renderContactsApp(`${LIST}/${loaded.id}/edit`, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: loaded }) },
    });
    await screen.findByRole('heading', { level: 2, name: tr('contacts.form.editHeading') });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: tr('contacts.form.firstName') })).toHaveValue(
        'Janez',
      ),
    );
    await user.type(screen.getByRole('textbox', { name: tr('contacts.form.phone') }), '1');

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() =>
      expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${loaded.id}`)).toHaveLength(1),
    );
    expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${loaded.id}`)[0]?.body).toMatchObject({
      attributes: [{ key: 'Država', value: 'Slovenija' }],
      country: null,
    });
  });

  it('FR-013-01: axe brez kršitev z novima poljema (sl in en)', async () => {
    const { container } = await openEditForm();
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(await screen.findByRole('combobox', { name: 'Company' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
