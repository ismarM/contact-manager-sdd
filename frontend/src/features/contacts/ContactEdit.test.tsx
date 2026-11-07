import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { CONTACT_ID, contactDetail, GROUP_ID, renderContactsApp } from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';

// Urejanje kontakta (FR-004-10, FR-004-13; design.md 8.3).

const VIEW = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const EDIT = `${VIEW}/edit`;
const LOADED = contactDetail({
  version: 3,
  phone: '01 234 5678',
  tags: ['vip', 'stara'],
  attributes: [{ key: 'kompetenca', value: 'web dev' }],
});

async function openEdit(contacts: Parameters<typeof renderContactsApp>[1] = {}) {
  const view = renderContactsApp(EDIT, {
    role: 'EDITOR',
    ...contacts,
    contacts: { get: () => ({ status: 200, body: LOADED }), ...contacts.contacts },
  });
  await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
  // Obrazec je napolnjen s kontaktom, šele nato test vnaša (naslov se sme izrisati že med nalaganjem).
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
  return view;
}

describe('ContactEdit', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-10: obrazec je predizpolnjen z vrednostmi kontakta; naslov strani', async () => {
    await openEdit();

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
    expect(screen.getByRole('textbox', { name: 'Priimek' })).toHaveValue('Novak');
    expect(screen.getByRole('textbox', { name: 'Telefon' })).toHaveValue('01 234 5678');
    expect(screen.getByRole('textbox', { name: 'Ključ' })).toHaveValue('kompetenca');
    expect(screen.getByRole('textbox', { name: 'Vrednost' })).toHaveValue('web dev');
    expect(screen.getByRole('button', { name: 'Odstrani značko vip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Odstrani značko stara' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Uredi kontakt – Projekt FERI – Kontakti'));
  });

  it('FR-004-10: sprememba telefona in odstranitev značke pošljeta PUT z verzijo; obvestilo in pogled', async () => {
    // Posnetek strežnika s stanjem: po uspešnem PUT branje vrne shranjeni kontakt.
    let stored = LOADED;
    const { user, api } = await openEdit({
      contacts: {
        get: () => ({ status: 200, body: stored }),
        update: (id, body) => {
          stored = contactDetail({
            ...(body as object),
            id,
            version: 4,
            phone: '040 111 222',
            tags: ['vip'],
          });
          return { status: 200, body: stored };
        },
      },
    });
    const phone = screen.getByRole('textbox', { name: 'Telefon' });
    await user.clear(phone);
    await user.type(phone, '040 111 222');
    await user.click(screen.getByRole('button', { name: 'Odstrani značko stara' }));
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(VIEW));
    // Pogodba: prazno polje je `null`, izpuščeno ali prazen niz (R-06).
    const sent = api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)[0]?.body as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({
      firstName: 'Janez',
      lastName: 'Novak',
      email: 'janez@primer.si',
      phone: '040 111 222',
      attributes: [{ key: 'kompetenca', value: 'web dev' }],
      tags: ['vip'],
      version: 3,
    });
    expect([null, undefined, '']).toContain(sent.address);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Janez Novak je shranjen.',
      ),
    );
    expect(await screen.findByRole('link', { name: '040 111 222' })).toBeInTheDocument();
  });

  it('FR-004-10: shranjevanje brez sprememb uspe (PUT z isto verzijo)', async () => {
    const { user, api } = await openEdit();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() =>
      expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)).toHaveLength(1),
    );
    expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)[0]?.body).toMatchObject({
      version: 3,
    });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Janez Novak je shranjen.',
      ),
    );
  });

  it('FR-004-13: kontakt je medtem izbrisan – sporočilo in povezava na seznam, podatki ostanejo', async () => {
    const { user, api } = await openEdit({
      contacts: { update: () => ({ status: 404 }) },
    });
    const phone = screen.getByRole('textbox', { name: 'Telefon' });
    await user.clear(phone);
    await user.type(phone, '040 111 222');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tega kontakta ni več – medtem ga je nekdo izbrisal.');
    expect(screen.getByRole('link', { name: 'Nazaj na seznam kontaktov' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts`,
    );
    expect(screen.getByRole('textbox', { name: 'Telefon' })).toHaveValue('040 111 222');
    // Brez ponovnega ustvarjanja izbrisanega kontakta (tasks.md T022).
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('FR-004-15: 409 GROUP_ARCHIVED pri urejanju – sporočilo, obrazec in podatki ostanejo', async () => {
    const { user } = await openEdit({
      contacts: { update: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }) },
    });
    await user.type(screen.getByRole('textbox', { name: 'Ime' }), 'x');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana – kontaktov ni mogoče spreminjati.',
    );
    expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janezx');
  });

  it('FR-004-14: kontakt, ki ga ni, na poti urejanja pokaže »Te strani ni«', async () => {
    const { api } = renderContactsApp(EDIT, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 404 }) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(api.of('GET', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)).toHaveLength(1);
  });

  it('FR-004-10: brez kršitev axe (sl in en)', async () => {
    const { container } = await openEdit();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Edit contact' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
