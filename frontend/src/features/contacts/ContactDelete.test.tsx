import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  conflictReply,
  contactDetail,
  contactId,
  contactPageReply,
  contactSummaries,
  contactSummary,
  GROUP_ID,
  renderContactsApp,
  todayAt,
} from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';

// Izbris kontakta iz pogleda in iz vrstice seznama (FR-004-12, FR-004-13; design.md 8.11, 9.7).

const LIST = `/groups/${GROUP_ID}/contacts`;
const VIEW = `${LIST}/${CONTACT_ID}`;
const DETAIL = contactDetail({ version: 2 });
/** Preglednica seznama, poiskana znova ob vsaki uporabi (po ponovnem branju je lahko nov element). */
const contactsTable = () => screen.getByRole('table', { name: 'Kontakti skupine Projekt FERI' });
const DELETE_PATH = `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;

/** Čas današnje spremembe v zapisu jezika (design.md 8.14: »… ob 14.32.«; pravilo kot 002). */
const clock = (iso: string, language: 'sl' | 'en' = 'sl') =>
  new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function renderView(
  contacts: NonNullable<Parameters<typeof renderContactsApp>[1]>['contacts'] = {},
) {
  return renderContactsApp(VIEW, {
    role: 'EDITOR',
    contacts: {
      get: () => ({ status: 200, body: DETAIL }),
      list: contactPageReply([]),
      ...contacts,
    },
  });
}

describe('ContactDelete', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-12: dialog ima naslov s kontaktom, posledico, fokus na Prekliči', async () => {
    const { user } = renderView();
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));

    const dialog = await screen.findByRole('dialog', { name: 'Izbrišem kontakt Janez Novak?' });
    expect(dialog).toHaveTextContent('Kontakt bo odstranjen iz skupine Projekt FERI.');
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Izbriši kontakt' })).toBeInTheDocument();
  });

  it('FR-004-12: Prekliči in Esc zapreta dialog brez zahtevka; fokus nazaj na gumb', async () => {
    const { user, api } = renderView();
    const trigger = await screen.findByRole('button', { name: 'Izbriši kontakt' });

    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(api.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
  });

  it('FR-004-12: potrditev pošlje DELETE z verzijo, pokaže obvestilo in vrne na seznam brez kontakta', async () => {
    const janez = contactSummary(1, {
      id: CONTACT_ID,
      firstName: 'Janez',
      lastName: 'Novak',
      displayName: 'Janez Novak',
      version: 2,
    });
    let summaries = [janez, contactSummary(2)];
    const { user, api } = renderView({
      list: (url) => contactPageReply(summaries)(url),
      remove: (id) => {
        summaries = summaries.filter((s) => s.id !== id);
        return { status: 204 };
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(LIST));
    const request = api.of('DELETE', DELETE_PATH)[0];
    expect(request?.search.get('version')).toBe('2');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Janez Novak je izbrisan.',
      ),
    );
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await waitFor(() =>
      expect(
        within(contactsTable()).getByRole('link', { name: 'Ime002 Priimek002' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(contactsTable()).queryByRole('link', { name: 'Janez Novak' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-004-16: brez pravic pri izbrisu (403) – sporočilo v dialogu, kontakt ostane', async () => {
    const { user } = renderView({ remove: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Za to dejanje nimaš več pravic.',
    );
    expect(currentLocation()).toBe(VIEW);
  });

  it('FR-004-15 FR-004-16: skupina je medtem arhivirana (409 GROUP_ARCHIVED) – sporočilo v dialogu', async () => {
    const { user } = renderView({
      remove: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
    });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Skupina je arhivirana – kontaktov ni mogoče spreminjati.',
    );
    expect(currentLocation()).toBe(VIEW);
  });

  it('FR-004-13: 404 pri izbrisu iz menija vrstice – opozorilo v seznamu in ponovno prebran seznam', async () => {
    let summaries = contactSummaries(3);
    const { user, api } = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: {
        list: (url) => contactPageReply(summaries)(url),
        remove: () => {
          // Kontakt je medtem izbrisal nekdo drug.
          summaries = summaries.filter((s) => s.id !== contactId(2));
          return { status: 404 };
        },
      },
    });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    const listReadsBefore = api.of('GET', `/api/groups/${GROUP_ID}/contacts`).length;
    await user.click(
      within(contactsTable()).getByRole('button', { name: 'Dejanja za Ime002 Priimek002' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Izbriši kontakt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tega kontakta ni več – medtem ga je nekdo izbrisal.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.of('GET', `/api/groups/${GROUP_ID}/contacts`).length).toBeGreaterThan(
        listReadsBefore,
      ),
    );
    await waitFor(() =>
      expect(
        within(contactsTable()).queryByRole('link', { name: 'Ime002 Priimek002' }),
      ).not.toBeInTheDocument(),
    );
    expect(currentLocation()).toBe(LIST);
  });

  it('FR-004-12: konflikt pri izbrisu – dialog se zapre, opozorilo, ponoven GET; izbris se lahko ponovno potrdi', async () => {
    const current = contactDetail({
      version: 3,
      phone: '031 999 888',
      updatedAt: todayAt(14, 32),
      updatedBy: { name: 'Bojan Kovač', email: 'bojan@primer.si' },
    });
    let deletes = 0;
    let reads = 0;
    const { user, api } = renderView({
      get: () => ({ status: 200, body: reads++ === 0 ? DETAIL : current }),
      remove: () => (deletes++ === 0 ? conflictReply(current) : { status: 204 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      `Kontakt je medtem spremenil(a) Bojan Kovač ob ${clock(current.updatedAt)}.`,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(currentLocation()).toBe(VIEW);
    expect(await screen.findByRole('link', { name: '031 999 888' })).toBeInTheDocument();
    expect(api.of('GET', DELETE_PATH).length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole('button', { name: 'Izbriši kontakt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    await waitFor(() => expect(currentLocation()).toBe(LIST));
    expect(api.of('DELETE', DELETE_PATH).map((r) => r.search.get('version'))).toEqual(['2', '3']);
  });

  it('FR-004-13: 404 pri izbrisu – opozorilo in ponovno prebran seznam brez kontakta', async () => {
    // Kontakt je drug član izbrisal po tem, ko je bil pogled odprt: strežnik ga v seznamu ne vrne več.
    const summaries = [contactSummary(2)];
    const { user } = renderView({
      list: (url) => contactPageReply(summaries)(url),
      remove: () => ({ status: 404 }),
    });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    await waitFor(() => expect(currentLocation()).toBe(LIST));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tega kontakta ni več – medtem ga je nekdo izbrisal.',
    );
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await waitFor(() =>
      expect(
        within(contactsTable()).getByRole('link', { name: 'Ime002 Priimek002' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(contactsTable()).queryByRole('link', { name: 'Janez Novak' }),
    ).not.toBeInTheDocument();
  });

  it('FR-004-16: brez povezave pri izbrisu – isto sporočilo kot pri shranjevanju, dialog ostane', async () => {
    const { user } = renderView({ remove: () => 'network-error' });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ni povezave. Preveri povezavo in poskusi znova.',
    );
    expect(currentLocation()).toBe(VIEW);
  });

  it('FR-004-16: napaka strežnika pri izbrisu – sporočilo v dialogu, dialog ostane odprt', async () => {
    const { user } = renderView({ remove: () => ({ status: 500, body: { code: 'INTERNAL' } }) });
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Kontakta ni bilo mogoče izbrisati. Poskusi znova.',
    );
    expect(currentLocation()).toBe(VIEW);
  });

  it('FR-004-12: izbris iz menija vrstice uporabi verzijo vrstice', async () => {
    let summaries = contactSummaries(3).map((s, i) => ({ ...s, version: i + 5 }));
    const { user, api } = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: {
        list: (url) => contactPageReply(summaries)(url),
        remove: (id) => {
          summaries = summaries.filter((s) => s.id !== id);
          return { status: 204 };
        },
      },
    });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await user.click(
      within(contactsTable()).getByRole('button', { name: 'Dejanja za Ime002 Priimek002' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Izbriši kontakt' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Izbrišem kontakt Ime002 Priimek002?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Izbriši kontakt' }));

    await waitFor(() =>
      expect(api.of('DELETE', `/api/groups/${GROUP_ID}/contacts/${contactId(2)}`)).toHaveLength(1),
    );
    expect(
      api
        .of('DELETE', `/api/groups/${GROUP_ID}/contacts/${contactId(2)}`)[0]
        ?.search.get('version'),
    ).toBe('6');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Ime002 Priimek002 je izbrisan.',
      ),
    );
    await waitFor(() =>
      expect(
        within(contactsTable()).queryByRole('link', { name: 'Ime002 Priimek002' }),
      ).not.toBeInTheDocument(),
    );
    expect(within(contactsTable()).getAllByRole('row')).toHaveLength(3);
  });

  it('FR-004-12: konflikt pri izbrisu iz vrstice – opozorilo v seznamu, seznam osvežen, ponovni izbris s trenutno verzijo', async () => {
    // Posnetek strežnika s stanjem: drug član je kontakt 1 spremenil (verzija 9), preden je izbris prišel do strežnika;
    // seznam od takrat vrača verzijo 9, izbris uspe samo s trenutno verzijo.
    let changed = false;
    let contacts = contactSummaries(3);
    const { user, api } = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: {
        list: (url) =>
          contactPageReply(
            contacts.map((contact) =>
              changed && contact.id === contactId(1)
                ? { ...contact, version: 9, phone: '031 999 888' }
                : contact,
            ),
          )(url),
        remove: (id, url) => {
          if (url.searchParams.get('version') !== '9') {
            changed = true;
            return conflictReply(
              contactDetail({
                id: contactId(1),
                version: 9,
                updatedAt: todayAt(10, 5),
                updatedBy: { name: 'Cene Zupan', email: 'cene@primer.si' },
              }),
            );
          }
          contacts = contacts.filter((contact) => contact.id !== id);
          return { status: 204 };
        },
      },
    });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    const lists = () => api.of('GET', `/api/groups/${GROUP_ID}/contacts`).length;
    const before = lists();
    await user.click(
      within(contactsTable()).getByRole('button', { name: 'Dejanja za Ime001 Priimek001' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Izbriši kontakt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Kontakt je medtem spremenil(a) Cene Zupan ob ${clock(todayAt(10, 5))}.`,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      api
        .of('DELETE', `/api/groups/${GROUP_ID}/contacts/${contactId(1)}`)[0]
        ?.search.get('version'),
    ).toBe('0');
    await waitFor(() => expect(lists()).toBeGreaterThan(before));
    // Osvežen seznam je izrisan: vrstica kaže vrednost, ki jo je vmes shranil drug član.
    await waitFor(() =>
      expect(
        within(contactsTable()).getByRole('row', { name: /Ime001 Priimek001/ }),
      ).toHaveTextContent('031 999 888'),
    );

    await user.click(
      within(await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' })).getByRole(
        'button',
        { name: 'Dejanja za Ime001 Priimek001' },
      ),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Izbriši kontakt' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
        'Kontakt Ime001 Priimek001 je izbrisan.',
      ),
    );
    expect(
      api
        .of('DELETE', `/api/groups/${GROUP_ID}/contacts/${contactId(1)}`)[1]
        ?.search.get('version'),
    ).toBe('9');
  });

  it('FR-004-12: izbris edinega kontakta na zadnji strani – prikaže se zadnja obstoječa stran', async () => {
    // 51 kontaktov: na ?page=3 (velikost 25) je samo Ime051 Priimek051; po izbrisu ostane 50 kontaktov in 2 strani.
    let summaries = contactSummaries(51);
    const { user } = renderContactsApp(`${LIST}?page=3`, {
      role: 'EDITOR',
      contacts: {
        list: (url) => contactPageReply(summaries)(url),
        remove: (id) => {
          summaries = summaries.filter((s) => s.id !== id);
          return { status: 204 };
        },
      },
    });
    await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await within(contactsTable()).findByRole('link', { name: 'Ime051 Priimek051' });
    await user.click(
      within(contactsTable()).getByRole('button', { name: 'Dejanja za Ime051 Priimek051' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Izbriši kontakt' }));

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Izbriši kontakt' }),
    );

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}?page=2`));
    // Med ponovnim branjem sme vmesnik paginacijo in preglednico zamenjati, zato ju iščemo znova.
    await waitFor(() =>
      expect(
        within(screen.getByRole('navigation', { name: 'Strani rezultatov' })).getByRole('status'),
      ).toHaveTextContent('26–50 od 50'),
    );
    await waitFor(() =>
      expect(
        within(contactsTable()).getByRole('link', { name: 'Ime050 Priimek050' }),
      ).toBeInTheDocument(),
    );
    expect(
      within(contactsTable()).getByRole('link', { name: 'Ime050 Priimek050' }),
    ).toBeInTheDocument();
  });

  it('FR-004-12: brez kršitev axe z odprtim dialogom (sl in en)', async () => {
    const { user } = renderView();
    await user.click(await screen.findByRole('button', { name: 'Izbriši kontakt' }));
    await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(
      await screen.findByRole('dialog', { name: 'Delete contact Janez Novak?' }),
    ).toBeInTheDocument();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
