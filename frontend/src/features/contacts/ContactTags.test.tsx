import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, renderContactsApp } from '../../test/contactsApi';

// Kombinirano polje za značke (FR-004-02, FR-004-04; design.md 8.4).

const NEW = `/groups/${GROUP_ID}/contacts/new`;

const KNOWN = ['vip', 'VIP2', 'ne_obveščaj', 'konferenca2025'];
const tagsReply = (url: URL) => {
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  return {
    status: 200,
    body: { tags: KNOWN.filter((tag) => tag.toLowerCase().startsWith(q)) },
  };
};

async function openForm() {
  const view = renderContactsApp(NEW, { role: 'EDITOR', contacts: { tags: tagsReply } });
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

    await user.type(combobox, 'v');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['vip', 'VIP2']);
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', listbox.id);
    expect(api.of('GET', `/api/groups/${GROUP_ID}/tags`).at(-1)?.search.get('q')).toBe('v');
  });

  it('FR-004-04: puščica dol in Enter dodata predlog; polje se izprazni', async () => {
    const { user, combobox } = await openForm();
    await user.type(combobox, 'v');
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

    await user.click(await screen.findByRole('option', { name: 'ne_obveščaj' }));

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
