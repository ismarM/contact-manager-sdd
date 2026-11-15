import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, renderContactsApp, suggestionsServer } from '../../test/contactsApi';
import { server } from '../../test/msw';

// Kombinirano polje za značke (FR-004-02, FR-004-04; design.md 8.4).

const NEW = `/groups/${GROUP_ID}/contacts/new`;

// 013: predlogi značk prek `GET …/suggestions?type=tag` (po pogostosti, z vsebovanjem; nadomesti `GET …/tags`).
const KNOWN = [
  { text: 'vip', count: 20 },
  { text: 'VIP2', count: 3 },
  { text: 'ne_obveščaj', count: 5 },
  { text: 'konferenca2025', count: 1 },
];
const suggestions = suggestionsServer({ tag: KNOWN });

async function openForm() {
  const view = renderContactsApp(NEW, { role: 'EDITOR', contacts: { suggestions } });
  await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
  return { ...view, combobox: screen.getByRole('combobox', { name: 'Dodaj značko' }) };
}

function addedTags() {
  const list = screen.queryByRole('list', { name: 'Dodane značke' });
  if (!list) return [];
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => {
      // Besedilo značke brez gumba za odstranitev (ime gumba je lahko aria-label ali vizualno skrito besedilo).
      const button = within(item).queryByRole('button')?.textContent ?? '';
      return (item.textContent ?? '').replace(button, '').trim();
    });
}

describe('ContactTags', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-04: vpis predloge zahteva predloge te skupine in jih pokaže v listbox', async () => {
    const { user, combobox, api } = await openForm();

    await user.type(combobox, 'vi');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['vip20', 'VIP23']);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);
    const last = api.of('GET', `/api/groups/${GROUP_ID}/suggestions`).at(-1);
    expect(last?.search.get('type')).toBe('tag');
    expect(last?.search.get('q')).toBe('vi');
  });

  it('FR-004-04: puščica dol in Enter dodata predlog; polje se izprazni', async () => {
    const { user, combobox } = await openForm();
    await user.type(combobox, 'vi');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}');
    expect(combobox).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
    await user.keyboard('{Enter}');

    expect(addedTags()).toEqual(['vip']);
    expect(combobox).toHaveValue('');
  });

  it('FR-004-04: klik na predlog ga doda', async () => {
    const { user, combobox } = await openForm();
    await user.type(combobox, 'ne');

    await user.click(await screen.findByRole('option', { name: /^ne_obveščaj/ }));

    expect(addedTags()).toEqual(['ne_obveščaj']);
  });

  it('FR-004-04: Enter in vejica dodata vpisano značko; vrstni red je vrstni red vnosa', async () => {
    const { user, combobox } = await openForm();

    await user.type(combobox, 'konferenca2025{Enter}');
    await user.type(combobox, 'moja,');
    await user.type(combobox, 'alfa{Enter}');

    expect(addedTags()).toEqual(['konferenca2025', 'moja', 'alfa']);
  });

  it('FR-004-04: Odstrani značko vip odstrani značko; Backspace v praznem polju je ne odstrani', async () => {
    const { user, combobox } = await openForm();
    await user.type(combobox, 'vip{Enter}');
    await user.type(combobox, 'alfa{Enter}');

    await user.keyboard('{Backspace}');
    expect(addedTags()).toEqual(['vip', 'alfa']);
    await user.click(screen.getByRole('button', { name: 'Odstrani značko vip' }));

    expect(addedTags()).toEqual(['alfa']);
    expect(screen.queryByRole('button', { name: 'Odstrani značko vip' })).not.toBeInTheDocument();
  });

  it('FR-004-02: značka s presledkom, podvojena in predolga niso dodane; napaka ob polju', async () => {
    const { user, combobox } = await openForm();

    await user.type(combobox, 'moja znacka{Enter}');
    expect(addedTags()).toEqual([]);
    expect(combobox).toHaveAccessibleDescription('Značka ne sme vsebovati presledkov.');
    expect(combobox).toHaveAttribute('aria-invalid', 'true');

    await user.clear(combobox);
    await user.type(combobox, 'vip{Enter}');
    await user.type(combobox, 'VIP{Enter}');
    expect(addedTags()).toEqual(['vip']);
    expect(combobox).toHaveAccessibleDescription('Ta značka je že dodana.');

    await user.clear(combobox);
    fireEvent.change(combobox, { target: { value: 'x'.repeat(51) } });
    await user.type(combobox, '{Enter}');
    expect(addedTags()).toEqual(['vip']);
    expect(combobox).toHaveAccessibleDescription('Značka je predolga (največ 50 znakov).');
  });

  it('FR-004-02: 31. značka ni dodana – največ 30 značk', async () => {
    const { user, combobox } = await openForm();
    for (let i = 0; i < 30; i += 1) {
      fireEvent.change(combobox, { target: { value: `t${i}` } });
      fireEvent.keyDown(combobox, { key: 'Enter' });
    }
    await waitFor(() => expect(addedTags()).toHaveLength(30));

    await user.type(combobox, 'ena-preveč{Enter}');

    expect(addedTags()).toHaveLength(30);
    expect(combobox).toHaveAccessibleDescription('Dodaš lahko največ 30 značk.');
  });

  it('FR-013-14: fokus brez vpisa pokaže predloge po pogostosti s številom uporab', async () => {
    const { user, combobox, api } = await openForm();

    await user.click(combobox);

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'vip20',
      'ne_obveščaj5',
      'VIP23',
      'konferenca20251',
    ]);
    const request = api.of('GET', `/api/groups/${GROUP_ID}/suggestions`).at(-1);
    expect(request?.search.get('type')).toBe('tag');
    expect(request?.search.get('q')).toBeNull();
  });

  it('FR-013-14: že dodane značke niso med predlogi', async () => {
    const { user, combobox } = await openForm();
    await user.type(combobox, 'vip{Enter}');
    await screen.findByRole('list', { name: 'Dodane značke' });

    await user.click(combobox);

    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).not.toContain('vip20');
    expect(options).toHaveLength(3);
  });

  it('FR-013-10: vpisana značka se zamenja s kanoničnim zapisom skupine že ob dodajanju', async () => {
    const { user, combobox } = await openForm();

    await user.type(combobox, 'VIP{Enter}');

    await waitFor(() => expect(addedTags()).toEqual(['vip']));
    expect(combobox).toHaveValue('');
  });

  it('FR-013-14: napaka predlogov je tiha, značko je še vedno mogoče dodati', async () => {
    const { user, combobox } = await openForm();
    server.use(
      http.get('/api/groups/:groupId/suggestions', () => HttpResponse.json({}, { status: 500 })),
    );

    await user.type(combobox, 'nova{Enter}');

    await waitFor(() => expect(addedTags()).toEqual(['nova']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('FR-004-04: brez kršitev axe z odprtim listbox in dodanimi značkami (sl in en)', async () => {
    const { user, combobox, container } = await openForm();
    await user.type(combobox, 'vip{Enter}');
    await user.type(combobox, 'v');
    await screen.findByRole('listbox');
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(await screen.findByRole('combobox', { name: 'Add tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tag vip' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
