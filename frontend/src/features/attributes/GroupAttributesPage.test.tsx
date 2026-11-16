import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { groupDetail, renderGroupsApp, type Reply } from '../../test/groupsApi';
import {
  attributeKey,
  attributeKeyPageReply,
  attributeKeys,
  attributeKeysPath,
  GROUP_ID,
  keyVersionConflictReply,
  mockAttributesApi,
  type RecordedAttributeRequest,
  typeConflictReply,
  typeName,
} from '../../test/typedAttributesApi';

// Razdelek Atributi skupine: seznam ključev s tipom, iskanje, paginacija, sprememba tipa (FR-016-05, FR-016-27).

const PATH = `/groups/${GROUP_ID}/attributes`;

const group = (overrides: Parameters<typeof groupDetail>[0] = {}): Reply => ({
  status: 200,
  body: groupDetail({ role: 'EDITOR', ...overrides }),
});

const KEYS = [
  attributeKey({ key: 'Mobilni', type: 'PHONE', contactCount: 12 }),
  attributeKey({ key: 'Oddelek', type: 'OTHER', contactCount: 3 }),
];

function render(
  handlers: Parameters<typeof mockAttributesApi>[0] = {},
  detail: Parameters<typeof groupDetail>[0] = {},
) {
  const api = mockAttributesApi({ list: (url) => attributeKeyPageReply(KEYS)(url), ...handlers });
  const view = renderGroupsApp(PATH, { get: () => group(detail) });
  return { ...view, attributes: api };
}

const posts = (requests: RecordedAttributeRequest[]) =>
  requests.filter((request) => request.method === 'POST');

describe('GroupAttributesPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-05: urejevalec vidi ključe s tipom in številom kontaktov ter gumb Spremeni tip', async () => {
    render();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByRole('rowheader', { name: 'Mobilni' })).toBeInTheDocument();
    // getByText: vrednosti celic v vrstici so golo besedilo brez lastne vloge; vrstica je že izbrana po vlogi.
    expect(within(rows[1]!).getByText(typeName('PHONE'))).toBeInTheDocument();
    expect(within(rows[1]!).getByText('12')).toBeInTheDocument();
    expect(within(rows[2]!).getByText(typeName('OTHER'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spremeni tip ključa Mobilni' })).toBeInTheDocument();
    expect(document.title).toContain('Atributi skupine');
  });

  it('FR-016-27: bralec vidi seznam brez gumba Spremeni tip', async () => {
    render({}, { role: 'VIEWER' });

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Spremeni tip/ })).not.toBeInTheDocument();
  });

  it('FR-016-27: v arhivirani skupini urejevalec nima gumba Spremeni tip', async () => {
    render({}, { archived: true });

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Spremeni tip/ })).not.toBeInTheDocument();
  });

  it('FR-016-05: prazen seznam in iskanje brez zadetkov', async () => {
    const { user } = render({ list: (url) => attributeKeyPageReply([])(url) });

    expect(await screen.findByText('V skupini še ni dodatnih atributov.')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Iskanje ključev' }), 'xyz');
    expect(await screen.findByText('Noben ključ ne ustreza iskanju.')).toBeInTheDocument();
  });

  it('FR-016-05: iskanje pošlje q in se vrne na prvo stran', async () => {
    const { user, attributes } = render();
    await screen.findByRole('table');

    await user.type(screen.getByRole('searchbox', { name: 'Iskanje ključev' }), 'mob');

    await waitFor(() =>
      expect(attributes.requests.some((request) => request.search.get('q') === 'mob')).toBe(true),
    );
    const last = attributes.requests.at(-1)!;
    expect(last.path).toBe(attributeKeysPath());
    expect(last.search.get('page')).toBe('0');
    expect(await screen.findByRole('rowheader', { name: 'Mobilni' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Oddelek' })).not.toBeInTheDocument();
  });

  it('FR-016-05: paginacija zahteva naslednjo stran in velikost strani', async () => {
    const { user, attributes } = render({
      list: (url) => attributeKeyPageReply(attributeKeys(60))(url),
    });
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Naslednja' }));
    await waitFor(() => expect(attributes.requests.at(-1)!.search.get('page')).toBe('1'));
    expect(await screen.findByRole('rowheader', { name: 'Ključ 026' })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Velikost strani' }), '50');
    await waitFor(() => expect(attributes.requests.at(-1)!.search.get('size')).toBe('50'));
    expect(attributes.requests.at(-1)!.search.get('page')).toBe('0');
  });

  it('FR-016-05: napaka nalaganja pokaže Poskusi znova', async () => {
    let fail = true;
    const { user } = render({
      list: (url) => (fail ? { status: 500 } : attributeKeyPageReply(KEYS)(url)),
    });

    expect(await screen.findByText('Ključev ni bilo mogoče naložiti.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Poskusi znova' }));
    expect(await screen.findByRole('rowheader', { name: 'Mobilni' })).toBeInTheDocument();
  });

  it('FR-016-05: sprememba tipa – fokus na Prekliči, zahtevek z verzijo in osvežen seznam', async () => {
    const { user, attributes } = render();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Spremeni tip ključa Oddelek' }));

    const dialog = await screen.findByRole('dialog', { name: 'Sprememba tipa ključa' });
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    expect((await axe(dialog)).violations).toEqual([]);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi tip' }),
      typeName('EMAIL'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Spremeni tip' }));

    await waitFor(() => expect(posts(attributes.requests)).toHaveLength(1));
    expect(posts(attributes.requests)[0]!.body).toEqual({
      key: 'Oddelek',
      type: 'EMAIL',
      version: 0,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Sprememba tipa ključa' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      attributes.requests.filter((request) => request.method === 'GET').length,
    ).toBeGreaterThan(1);
  });

  it('FR-016-05: konflikt prikaže seznam kontaktov do 100, »in še N« in Poskusi znova', async () => {
    const contacts = Array.from({ length: 3 }, (_, i) => ({
      contactId: `0193c4a2-0000-7000-8000-00000000000${i}`,
      displayName: `Kontakt ${i}`,
      value: `vrednost ${i}`,
    }));
    let calls = 0;
    const { user, attributes } = render({
      changeType: () => {
        calls += 1;
        return typeConflictReply(contacts, 150);
      },
    });
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Spremeni tip ključa Oddelek' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sprememba tipa ključa' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Novi tip' }),
      typeName('EMAIL'),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni tip' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Pri 150 kontaktih vrednost ne ustreza tipu E-naslov');
    expect(within(alert).getAllByRole('link')).toHaveLength(3);
    expect(within(alert).getByRole('link', { name: 'Odpri kontakt Kontakt 1' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${contacts[1]!.contactId}`,
    );
    expect(alert).toHaveTextContent('in še 147');
    expect((await axe(dialog)).violations).toEqual([]);

    await user.click(within(alert).getByRole('button', { name: 'Poskusi znova' }));
    await waitFor(() => expect(calls).toBe(2));
    expect(posts(attributes.requests)).toHaveLength(2);
  });

  it('FR-016-05: zastarela verzija pokaže sporočilo in trenutni tip', async () => {
    const { user } = render({
      changeType: () =>
        keyVersionConflictReply(attributeKey({ key: 'Oddelek', type: 'DATE', version: 4 })),
    });
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Spremeni tip ključa Oddelek' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sprememba tipa ključa' });

    await user.click(within(dialog).getByRole('button', { name: 'Spremeni tip' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tip ključa je medtem spremenil drug uporabnik.',
    );
    expect(within(dialog).getByRole('combobox', { name: 'Novi tip' })).toHaveValue('DATE');
  });

  it('FR-016-27: seznam v angleščini je dostopen (axe)', async () => {
    await i18n.changeLanguage('en');
    const { container } = render();

    await screen.findByRole('table');
    expect((await axe(container)).violations).toEqual([]);
  });
});
