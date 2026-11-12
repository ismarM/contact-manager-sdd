import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  contactDetail,
  contactId,
  contactIdsReply,
  contactPageReply,
  contactSummaries,
  filterOptionsReply,
  GROUP_ID,
  listQueries,
  renderContactsApp,
} from '../../../test/contactsApi';
import { currentLocation } from '../../../test/renderApp';
import {
  actionBar,
  displayName,
  expectCount,
  headerBox,
  JANEZ,
  LIST,
  listReady,
  noActionBar,
  pick,
  rowBox,
  rowBoxes,
} from '../../../test/selection';
import { groupId, listReply, summary } from '../../../test/groupsApi';
import { setViewport } from '../../../test/viewport';

// Izbor kontaktov v seznamu (FR-009-01, FR-009-02; specs/009-mnozicno-urejanje/plan.md – Key elements). Seznam podaja
// test (MSW), izbor živi samo v vmesniku.

const ALL = [JANEZ, ...contactSummaries(59, 2)];

function app(path = LIST, options: Parameters<typeof renderContactsApp>[1] = {}) {
  return renderContactsApp(path, {
    role: 'EDITOR',
    ...options,
    contacts: {
      list: (url) => contactPageReply(ALL)(url),
      filters: () => filterOptionsReply([], ['vip', 'konferenca2025']),
      ...options.contacts,
    },
  });
}

describe('ContactSelection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('narrow');
  });

  it('FR-009-01: potrditveno polje »Izberi Janez Novak« izbere kontakt in pokaže akcijsko vrstico »Izbran: 1«', async () => {
    const { user } = app();
    await listReady();
    noActionBar();

    await user.click(rowBox('Janez Novak'));

    expect(rowBox('Janez Novak')).toBeChecked();
    const bar = await actionBar();
    expect(bar.getByRole('status')).toHaveTextContent('Izbran: 1');
  });

  it('FR-009-01: »Izberi vse na strani« izbere vseh 25 kontaktov strani, ponovna aktivacija jih odznači', async () => {
    const { user } = app();
    await listReady();

    await user.click(headerBox());

    expect(rowBoxes()).toHaveLength(25);
    expect(rowBoxes().every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(headerBox()).toBeChecked();
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbranih: 25');

    await user.click(headerBox());

    expect(rowBoxes().some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(headerBox()).not.toBeChecked();
    noActionBar();
  });

  it('FR-009-01: ko je izbranih 10 od 25, je »Izberi vse na strani« v mešanem stanju; aktivacija izbere vse', async () => {
    const { user } = app();
    await listReady();

    await pick(user, ...Array.from({ length: 10 }, (_, i) => displayName(i + 2)));

    expect(headerBox()).toBePartiallyChecked();
    await user.click(headerBox());

    expect(rowBoxes().every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(headerBox()).toBeChecked();
    expect(headerBox()).not.toBePartiallyChecked();
  });

  it('FR-009-02: izbor preživi stran, iskanje, filter in razvrstitev; ob vrnitvi so trije še označeni', async () => {
    const { user, api } = app();
    await listReady();
    await pick(user, 'Janez Novak', displayName(2), displayName(3));

    const pagination = screen.getByRole('navigation', { name: 'Strani rezultatov' });
    await user.click(within(pagination).getByRole('button', { name: 'Naslednja' }));
    await screen.findByRole('checkbox', { name: `Izberi ${displayName(26)}` });
    await pick(user, displayName(26), displayName(27));

    const search = within(await screen.findByRole('search', { name: 'Iskanje in filtri' }));
    await user.type(search.getByRole('searchbox', { name: 'Iskanje po kontaktih' }), 'novak');
    await waitFor(() => expect(listQueries(api).at(-1)?.q).toBe('novak'));
    await user.selectOptions(search.getByRole('combobox', { name: 'Razvrsti' }), 'E-naslov');
    await user.click(search.getByRole('button', { name: /^Filtri/ }));
    const panel = within(await screen.findByRole('group', { name: 'Filtri kontaktov' }));
    await user.click(
      within(panel.getByRole('group', { name: 'Značke' })).getByRole('checkbox', { name: 'vip' }),
    );
    await user.click(panel.getByRole('button', { name: 'Uporabi filtre' }));
    await waitFor(() => expect(listQueries(api).at(-1)?.tag).toEqual(['vip']));

    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbranih: 5');
    await screen.findByRole('checkbox', { name: 'Izberi Janez Novak' });
    expect(rowBox('Janez Novak')).toBeChecked();
    expect(rowBox(displayName(2))).toBeChecked();
    expect(rowBox(displayName(3))).toBeChecked();
    expect(rowBox(displayName(4))).not.toBeChecked();
    // Izbor ni del naslova (FR-009-02).
    expect(currentLocation()).not.toMatch(/select|izbor|ids/i);
  });

  it('FR-009-02: odprtje kontakta in vrnitev na seznam ohrani izbor', async () => {
    const { user } = app(LIST, {
      contacts: {
        get: (id) => ({
          status: 200,
          body: contactDetail({ id, displayName: displayName(2), firstName: 'Ime002' }),
        }),
      },
    });
    await listReady();
    await pick(user, 'Janez Novak', displayName(2));

    await user.click(await screen.findByRole('link', { name: displayName(2) }));
    await user.click(await screen.findByRole('link', { name: 'Nazaj na seznam kontaktov' }));

    await listReady();
    expect(rowBox('Janez Novak')).toBeChecked();
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbrana: 2');
    expect(currentLocation()).toBe(LIST);
  });

  it('FR-009-02: prehod v drugo skupino izbor izprazni; ob vrnitvi ni izbranih kontaktov', async () => {
    const other = summary(2, { id: groupId(2), title: 'Skupina 002' });
    const mine = summary(1, { id: GROUP_ID, title: 'Projekt FERI' });
    const { user } = app(LIST, { groups: { list: listReply({ OWNER: [mine, other] }) } });
    await listReady();
    await pick(user, 'Janez Novak');
    await actionBar();

    await user.click(await screen.findByRole('button', { name: 'Preklopi skupino' }));
    await user.click(await screen.findByRole('menuitem', { name: /Skupina 002/ }));
    await waitFor(() => expect(currentLocation()).toBe(`/groups/${groupId(2)}/contacts`));
    noActionBar();

    await user.click(await screen.findByRole('button', { name: 'Preklopi skupino' }));
    await user.click(await screen.findByRole('menuitem', { name: /Projekt FERI/ }));
    await listReady();
    expect(rowBox('Janez Novak')).not.toBeChecked();
    noActionBar();
  });

  it('FR-009-02: ponoven izris aplikacije (osvežitev strani) izbor izgubi in ga ne zapiše v naslov', async () => {
    const first = app();
    await listReady();
    await pick(first.user, 'Janez Novak', displayName(2));
    await actionBar();
    expect(currentLocation()).toBe(LIST);

    first.unmount();
    app();
    await listReady();

    expect(rowBox('Janez Novak')).not.toBeChecked();
    noActionBar();
    expect(currentLocation()).toBe(LIST);
  });

  it('FR-009-02: z izborom ni povezave »Nov kontakt«; »Počisti izbor« jo vrne in fokusira »Izberi vse na strani«', async () => {
    const { user } = app();
    await listReady();
    expect(screen.getByRole('link', { name: 'Nov kontakt' })).toBeInTheDocument();

    await pick(user, 'Janez Novak');
    const bar = await actionBar();
    expect(screen.queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
    // Iskanje in filtri so ves čas vidni (D-72).
    expect(screen.getByRole('search', { name: 'Iskanje in filtri' })).toBeInTheDocument();

    await user.click(bar.getByRole('button', { name: 'Počisti izbor' }));

    noActionBar();
    expect(screen.getByRole('link', { name: 'Nov kontakt' })).toBeInTheDocument();
    expect(rowBox('Janez Novak')).not.toBeChecked();
    expect(headerBox()).toHaveFocus();
  });

  it('FR-009-01: v angleščini imajo polja angleška imena in »1 selected«', async () => {
    await i18n.changeLanguage('en');
    const { user } = app();
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });

    await user.click(await screen.findByRole('checkbox', { name: 'Select Janez Novak' }));

    expect(screen.getByRole('checkbox', { name: 'Select all on page' })).toBeInTheDocument();
    const bar = within(await screen.findByRole('toolbar', { name: 'Selection actions' }));
    expect(bar.getByRole('status')).toHaveTextContent('1 selected');
  });

  it('FR-009-02: izbor ostane ob menjavi velikosti strani', async () => {
    const { user } = app();
    await listReady();
    await pick(user, 'Janez Novak', displayName(2));
    await actionBar();
    const pagination = () => screen.getByRole('navigation', { name: 'Strani rezultatov' });

    await user.selectOptions(
      within(pagination()).getByRole('combobox', { name: 'Velikost strani' }),
      '50',
    );

    await waitFor(() => expect(currentLocation()).toContain('size=50'));
    await listReady();
    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbrana: 2');
    expect(rowBox('Janez Novak')).toBeChecked();
  });

  it('FR-009-02: odjava izbriše izbor – po ponovni prijavi je izbor prazen', async () => {
    const { user, gateway } = app();
    await listReady();
    await pick(user, 'Janez Novak');
    await actionBar();

    gateway.emitSignedOut();
    await user.click(await screen.findByRole('button', { name: 'Prijava z Googlom' }));

    await listReady();
    noActionBar();
    expect(rowBox('Janez Novak')).not.toBeChecked();
  });

  it('FR-009-01: brez kršitev axe pri obkljukanih poljih (sl)', async () => {
    const { user, container } = app();
    await listReady();
    await pick(user, 'Janez Novak', displayName(2));
    await actionBar();

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-009-01: brez kršitev axe pri mešanem stanju glave (en)', async () => {
    await i18n.changeLanguage('en');
    const { user, container } = app();
    await screen.findByRole('table', { name: 'Contacts of group Projekt FERI' });
    await user.click(await screen.findByRole('checkbox', { name: 'Select Janez Novak' }));
    await screen.findByRole('toolbar', { name: 'Selection actions' });

    expect(screen.getByRole('checkbox', { name: 'Select all on page' })).toBePartiallyChecked();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-009-02: bralec izbira kontakte in vidi akcijsko vrstico izbora', async () => {
    const { user } = app(LIST, { role: 'VIEWER' });
    await listReady();

    await user.click(rowBox('Janez Novak'));

    expect((await actionBar()).getByRole('status')).toHaveTextContent('Izbran: 1');
  });
});

const LIMIT_MESSAGE = 'Izbereš lahko največ 10 000 kontaktov. Zoži iskanje s filtri.';

/** 10 000 izbranih: Janez Novak in 9 999 drugih zadetkov (identitete zunaj prve strani). */
async function selectTenThousand() {
  const others = Array.from({ length: 9_999 }, (_, i) => contactId(100_000 + i));
  const { user } = app(LIST, {
    contacts: { contactIds: () => contactIdsReply(others, 9_999) },
  });
  await listReady();
  await pick(user, 'Janez Novak');
  await user.click((await actionBar()).getByRole('button', { name: /^Izberi vse zadetke/ }));
  await expectCount(/: 10[\s.]?000$/);
  return user;
}

describe('ContactSelection – meja 10 000', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('narrow');
  });

  it('FR-009-04: ročni izbor 10 001. kontakta pokaže sporočilo o meji, polje ostane neobkljukano, izbor nespremenjen', async () => {
    const user = await selectTenThousand();

    await user.click(rowBox(displayName(2)));

    expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT_MESSAGE);
    expect(rowBox(displayName(2))).not.toBeChecked();
    expect((await actionBar()).getByRole('status')).toHaveTextContent(/: 10[\s.]?000$/);
  }, 60_000);

  it('FR-009-04: »Izberi vse na strani«, ki bi presegla mejo, pokaže sporočilo o meji in ne spremeni stanja polj', async () => {
    const user = await selectTenThousand();
    expect(headerBox()).toBePartiallyChecked();

    await user.click(headerBox());

    expect(await screen.findByRole('alert')).toHaveTextContent(LIMIT_MESSAGE);
    expect(headerBox()).toBePartiallyChecked();
    expect(rowBox('Janez Novak')).toBeChecked();
    expect(rowBox(displayName(2))).not.toBeChecked();
    expect(rowBoxes().filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1);
    expect((await actionBar()).getByRole('status')).toHaveTextContent(/: 10[\s.]?000$/);
  }, 60_000);
});
