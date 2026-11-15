import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  deferred,
  GROUP_ID,
  renderContactsApp,
  suggestionsReply,
  suggestionsServer,
} from '../../test/contactsApi';
import { server } from '../../test/msw';
import { name, optionTexts, tr } from '../../test/smartAttributes';

// Splošno kombinirano polje s predlogi (FR-013-09 … FR-013-12, FR-013-17, FR-013-18; design.md 8.3, 8.4): preizkušeno
// na poljih *Ključ*, *Vrednost* in *Podjetje* obrazca novega kontakta.

const NEW = `/groups/${GROUP_ID}/contacts/new`;
const SUGGESTIONS = `/api/groups/${GROUP_ID}/suggestions`;

const KEYS = [
  { text: 'Kompetenca', count: 12 },
  { text: 'Vloga', count: 5 },
  { text: 'Projekt', count: 2 },
  { text: 'Država', count: 4 },
];
const sources = {
  key: KEYS,
  value: {
    Kompetenca: [
      { text: 'web dev', count: 8 },
      { text: 'data', count: 3 },
    ],
  },
  company: [
    { text: 'Acme d.o.o.', count: 7 },
    { text: 'Beta', count: 2 },
  ],
};

async function openForm(handler = suggestionsServer(sources)) {
  const view = renderContactsApp(NEW, { role: 'EDITOR', contacts: { suggestions: handler } });
  await screen.findByRole('heading', { level: 2, name: tr('contacts.form.newHeading') });
  return view;
}

async function addRow(user: Awaited<ReturnType<typeof openForm>>['user']) {
  await user.click(screen.getByRole('button', { name: name.addAttribute() }));
  return screen.getAllByRole('combobox', { name: name.key() }).at(-1)!;
}

const requests = (api: Awaited<ReturnType<typeof openForm>>['api'], type: string) =>
  api.of('GET', SUGGESTIONS).filter((request) => request.search.get('type') === type);

describe('SuggestInput', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-013-09: fokus na prazno polje Ključ pokaže predloge po pogostosti, brez rezerviranih imen', async () => {
    const { user, api } = await openForm();
    const key = await addRow(user);

    const listbox = await screen.findByRole('listbox', {
      name: tr('contacts.form.keySuggestions'),
    });

    expect(optionTexts(listbox)).toEqual(['Kompetenca', 'Vloga', 'Projekt']);
    expect(requests(api, 'key').at(-1)?.search.get('q')).toBeNull();
    expect(key).toHaveAttribute('aria-expanded', 'true');
    expect(key).toHaveAttribute('aria-controls', listbox.id);
    expect(key).toHaveAttribute('aria-autocomplete', 'list');
  });

  it('FR-013-09: število predlogov je sporočeno bralniku zaslona', async () => {
    const { user } = await openForm();
    await addRow(user);

    await screen.findByRole('listbox');

    expect(await screen.findByRole('status')).toHaveTextContent(name.summary(3));
  });

  it('FR-013-09: vpis zoži predloge (predpona pred ujemanjem v sredini); puščica in Enter izbereta, fokus gre v Vrednost', async () => {
    const { user, api } = await openForm();
    const key = await addRow(user);
    await screen.findByRole('listbox');

    await user.type(key, 'p');
    await waitFor(() => expect(requests(api, 'key').at(-1)?.search.get('q')).toBe('p'));
    await waitFor(() =>
      expect(optionTexts(screen.getByRole('listbox'))).toEqual(['Projekt', 'Kompetenca']),
    );

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(key).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id);
    await user.keyboard('{Enter}');

    expect(key).toHaveValue('Kompetenca');
    expect(screen.getByRole('combobox', { name: name.value() })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('FR-013-09: ključ, ki ga ima druga vrstica, ni med predlogi', async () => {
    const { user } = await openForm();
    const first = await addRow(user);
    await user.type(first, 'Vloga');
    const second = await addRow(user);

    await user.click(second);

    const listbox = await screen.findByRole('listbox');
    expect(optionTexts(listbox)).toEqual(['Kompetenca', 'Projekt']);
  });

  it('FR-013-17: Esc zapre seznam, puščica dol ga znova odpre', async () => {
    const { user } = await openForm();
    const key = await addRow(user);
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(key).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(key).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
  });

  it('FR-013-18: ciljna površina možnosti je ≥ 44 px (min-h-11)', async () => {
    const { user } = await openForm();
    await addRow(user);

    const options = await screen.findAllByRole('option');

    for (const option of options) expect(option.className).toContain('min-h-11');
  });

  it('FR-013-17: napaka predlogov je tiha – brez opozorila in seznama, vpis deluje', async () => {
    const { user } = await openForm(() => ({ status: 500, body: { code: 'INTERNAL' } }));
    const key = await addRow(user);

    await user.type(key, 'kompetenca');

    await waitFor(() => expect(key).toHaveValue('kompetenca'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(key).toHaveAttribute('aria-expanded', 'false');
  });

  it('FR-013-17: zastarel odgovor ne prepiše novejšega', async () => {
    const slow = deferred<void>();
    const { user } = await openForm(() => suggestionsReply([]));
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/groups/:groupId/suggestions', async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        asked.push(q);
        if (q === 'a') {
          await slow.promise;
          return HttpResponse.json({ items: [{ text: 'Zastarel', count: 1 }] });
        }
        return HttpResponse.json({ items: [{ text: 'Novejsi', count: 1 }] });
      }),
    );
    const key = await addRow(user);

    await user.type(key, 'a');
    await waitFor(() => expect(asked).toContain('a'));
    await user.type(key, 'b');
    await waitFor(() => expect(optionTexts(screen.getByRole('listbox'))).toEqual(['Novejsi']));

    await act(async () => {
      slow.resolve();
      await new Promise((done) => setTimeout(done, 50));
    });

    expect(optionTexts(screen.getByRole('listbox'))).toEqual(['Novejsi']);
  });

  it('FR-013-10: ob zapustitvi polja se vpis zamenja z zapisom, ki ga skupina že uporablja', async () => {
    const { user } = await openForm();
    const key = await addRow(user);

    await user.type(key, 'kompetenca');
    await user.tab();

    await waitFor(() => expect(key).toHaveValue('Kompetenca'));
  });

  it('FR-013-10: ključ, ki ga skupina nima, ostane takšen, kot je bil vpisan', async () => {
    const { user } = await openForm();
    const key = await addRow(user);

    await user.type(key, 'Nov ključ');
    await user.tab();

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(key).toHaveValue('Nov ključ');
  });

  it('FR-013-11: vrednosti so predlagane samo ob znanem ključu (type=value&key=)', async () => {
    const { user, api } = await openForm();
    await addRow(user);
    const value = screen.getByRole('combobox', { name: name.value() });

    await user.click(value);
    await new Promise((done) => setTimeout(done, 250));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(requests(api, 'value')).toHaveLength(0);

    await user.type(screen.getByRole('combobox', { name: name.key() }), 'Kompetenca');
    await user.click(value);

    const listbox = await screen.findByRole('listbox', {
      name: tr('contacts.form.valueSuggestions'),
    });
    expect(optionTexts(listbox)).toEqual(['web dev', 'data']);
    expect(requests(api, 'value').at(-1)?.search.get('key')).toBe('Kompetenca');

    await user.type(value, 'da');
    await waitFor(() => expect(optionTexts(screen.getByRole('listbox'))).toEqual(['data']));
  });

  it('FR-013-11: vrednost, ki ni med predlogi, je sprejeta (prosti vnos)', async () => {
    const { user } = await openForm();
    await addRow(user);
    await user.type(screen.getByRole('combobox', { name: name.key() }), 'Kompetenca');
    const value = screen.getByRole('combobox', { name: name.value() });

    await user.type(value, 'nekaj tretjega');

    expect(value).toHaveValue('nekaj tretjega');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('FR-013-12: polje Podjetje ponudi podjetja po pogostosti in jih zoži ob vpisu', async () => {
    const { user, api } = await openForm();
    const company = screen.getByRole('combobox', { name: name.company() });

    await user.click(company);
    let listbox = await screen.findByRole('listbox', {
      name: tr('contacts.form.companySuggestions'),
    });
    expect(optionTexts(listbox)).toEqual(['Acme d.o.o.', 'Beta']);

    await user.type(company, 'ac');
    await waitFor(() => expect(optionTexts(screen.getByRole('listbox'))).toEqual(['Acme d.o.o.']));
    expect(requests(api, 'company').at(-1)?.search.get('q')).toBe('ac');

    listbox = screen.getByRole('listbox');
    await user.click(within(listbox).getByRole('option'));
    expect(company).toHaveValue('Acme d.o.o.');
  });

  it('FR-013-18: v angleškem vmesniku so imena in sporočilo o številu predlogov angleška', async () => {
    await i18n.changeLanguage('en');
    const { user } = await openForm();
    await user.click(screen.getByRole('button', { name: 'Add attribute' }));

    await screen.findByRole('listbox', { name: 'Suggested keys' });

    expect(await screen.findByRole('status')).toHaveTextContent('Suggestions: 3');
  });

  it('FR-013-18: axe brez kršitev z odprtim seznamom predlogov', async () => {
    const { user, container } = await openForm();
    await addRow(user);
    await screen.findByRole('listbox');

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-013-09: miška – klik na predlog ga izbere in zapre seznam', async () => {
    const { user } = await openForm();
    const key = await addRow(user);

    await user.click(await screen.findByRole('option', { name: /^Vloga/ }));

    expect(key).toHaveValue('Vloga');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.blur(key);
  });
});
