import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { CONTACT_ID, contactDetail, GROUP_ID, renderContactsApp } from '../../test/contactsApi';

// Pogled kontakta na ločeni strani (< 1280 px; FR-004-08, FR-004-14, FR-004-16; design.md 9.4).

const PATH = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;

const FULL = contactDetail({
  firstName: 'Janez',
  lastName: 'Novak',
  displayName: 'Janez Novak',
  address: 'Ulica 1\n1000 Ljubljana',
  email: 'janez@primer.si',
  phone: '+386 1 234 56 78',
  attributes: [
    { key: 'kompetenca', value: 'web dev' },
    { key: 'Oddelek', value: 'IT' },
  ],
  tags: ['ne_obveščaj', 'konferenca2025', 'vip'],
});

describe('ContactView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-08: bralec vidi ime, naslov, povezavi mailto in tel, atribute in vse značke', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: FULL }) },
    });

    const main = await screen.findByRole('main');
    expect(
      await within(main).findByRole('heading', { level: 2, name: 'Janez Novak' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Janez Novak – Projekt FERI – Kontakti'));
    const terms = within(main)
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(terms).toEqual(['Naslov', 'E-naslov', 'Telefon', 'kompetenca', 'Oddelek']);
    const values = within(main).getAllByRole('definition');
    expect(values).toHaveLength(5);
    expect(values[0]).toHaveTextContent('Ulica 1');
    expect(values[0]).toHaveTextContent('1000 Ljubljana');
    expect(values.slice(1).map((value) => value.textContent)).toEqual([
      'janez@primer.si',
      '+386 1 234 56 78',
      'web dev',
      'IT',
    ]);
    expect(within(main).getByRole('link', { name: 'janez@primer.si' })).toHaveAttribute(
      'href',
      'mailto:janez@primer.si',
    );
    expect(within(main).getByRole('link', { name: '+386 1 234 56 78' })).toHaveAttribute(
      'href',
      'tel:+38612345678',
    );
    expect(within(main).getByRole('heading', { level: 3, name: 'Dodatni atributi' })).toBeVisible();
    expect(within(main).getByRole('heading', { level: 3, name: 'Značke' })).toBeVisible();
    // Značke: elementi seznama v pogledu, brez morebitnih elementov navigacije glave skupine.
    const sections = screen.getByRole('navigation', { name: 'Razdelki skupine' });
    expect(
      within(main)
        .getAllByRole('listitem')
        .filter((item) => !sections.contains(item))
        .map((tag) => tag.textContent),
    ).toEqual(['ne_obveščaj', 'konferenca2025', 'vip']);
  });

  it('FR-004-08: polja brez vrednosti in prazni razdelki se ne izrišejo', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        get: () => ({
          status: 200,
          body: contactDetail({ address: null, phone: null, attributes: [], tags: [] }),
        }),
      },
    });

    const main = await screen.findByRole('main');
    await within(main).findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(
      within(main)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['E-naslov']);
    expect(
      within(main).queryByRole('heading', { name: 'Dodatni atributi' }),
    ).not.toBeInTheDocument();
    expect(within(main).queryByRole('heading', { name: 'Značke' })).not.toBeInTheDocument();
  });

  it('FR-004-08: bralec nima akcij Uredi kontakt in Izbriši kontakt', async () => {
    renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: FULL }) },
    });

    const main = await screen.findByRole('main');
    await within(main).findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(within(main).queryByRole('link', { name: 'Uredi kontakt' })).not.toBeInTheDocument();
    expect(within(main).queryByRole('button', { name: 'Izbriši kontakt' })).not.toBeInTheDocument();
  });

  it('FR-004-09: povezava nazaj ohrani stran in velikost seznama', async () => {
    renderContactsApp(`${PATH}?page=2&size=50`, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: FULL }) },
    });

    const main = await screen.findByRole('main');
    const back = await within(main).findByRole('link', { name: 'Nazaj na seznam kontaktov' });
    const href = new URL(back.getAttribute('href') ?? '', 'http://localhost');
    expect(href.pathname).toBe(`/groups/${GROUP_ID}/contacts`);
    expect(Object.fromEntries(href.searchParams)).toEqual({ page: '2', size: '50' });
    expect(within(main).queryByRole('table')).not.toBeInTheDocument();
  });

  it('FR-004-14: kontakt, ki ga strežnik ne najde, pokaže »Te strani ni« brez podatkov', async () => {
    const { api } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 404 }) },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
    expect(api.of('GET', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Na seznam skupin' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Janez Novak' })).not.toBeInTheDocument();
  });

  it('FR-004-16: napaka nalaganja je trajno sporočilo z gumbom Poskusi znova', async () => {
    let fail = true;
    const { user } = renderContactsApp(PATH, {
      role: 'VIEWER',
      contacts: {
        get: () =>
          fail ? { status: 500, body: { code: 'INTERNAL' } } : { status: 200, body: FULL },
      },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kontakta ni bilo mogoče naložiti. Poskusi znova.');
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Janez Novak' }),
    ).toBeInTheDocument();
  });

  it('FR-004-08: brez kršitev axe (sl in en)', async () => {
    const { container } = renderContactsApp(PATH, {
      role: 'EDITOR',
      contacts: { get: () => ({ status: 200, body: FULL }) },
    });
    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Additional attributes' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Edit contact' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to contacts' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
