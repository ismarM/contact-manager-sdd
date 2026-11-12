import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RunOptions } from 'axe-core';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  compareContact,
  compareReply,
  duplicateGroup,
  duplicatesReply,
  GROUP_ID,
  renderDuplicatesApp,
} from '../../test/duplicatesApi';
import type { CompareContact } from './types';

// Dostopnost primerjave: tipkovnica, dostopna imena, axe WCAG 2.1 A in AA (FR-011-08,
// FR-011-12, FR-011-21; specs/011-dvojniki/plan.md – Key elements; design.md 8.11, 9.5).

const PAGE = `/groups/${GROUP_ID}/duplicates`;
const WCAG: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

/** 10 kontaktov z 12 vrsticami (5 polj, 6 atributov, značke); vse vrednosti se razlikujejo. */
const TEN: CompareContact[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return compareContact({
    n,
    version: n,
    firstName: `Ime${n}`,
    lastName: `Priimek${n}`,
    address: `Ulica ${n}`,
    email: `oseba${n}@primer.si`,
    phone: `041 000 ${String(n).padStart(3, '0')}`,
    attributes: Array.from({ length: 6 }, (_unused, k) => ({
      key: `Atribut${k + 1}`,
      value: `vrednost ${n}`,
    })),
    tags: ['vip', `znacka${n}`],
  });
});

const NAME_PAIR = [
  compareContact({ n: 1, version: 1, firstName: 'Janez', lastName: null }),
  compareContact({ n: 2, version: 2, firstName: null, lastName: 'Novak' }),
];

function app(contacts: CompareContact[] = TEN, total = contacts.length) {
  const ids = contacts.map((contact) => contact.id).join(',');
  return renderDuplicatesApp(
    `${PAGE}/compare?category=email&page=1&size=25&ids=${ids}&total=${total}`,
    {
      role: 'EDITOR',
      duplicates: {
        compare: () => compareReply(contacts),
        search: () =>
          duplicatesReply([duplicateGroup('email', 'ana@primer.si', [{ n: 11 }, { n: 12 }])]),
      },
    },
  );
}

const ready = () => screen.findByRole('region', { name: 'Predogled združenega kontakta' });
const mergeButton = () => screen.getByRole('button', { name: 'Združi kontakte' });

/** Mesto elementa v pričakovanem vrstnem redu fokusa: glava in povezave (0), vrstice (1), predogled (2), združi (3). */
function rank(element: Element): number {
  if (element === mergeButton()) return 3;
  if (screen.getByRole('region', { name: 'Predogled združenega kontakta' }).contains(element))
    return 2;
  const input = element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type);
  return input ? 1 : 0;
}

/** Vsi elementi, ki jih doseže Tab od začetka strani do gumba »Združi kontakte« (vključno z njim). */
async function tabToMerge(user: ReturnType<typeof app>['user']) {
  const visited: Element[] = [];
  for (let i = 0; i < 200; i += 1) {
    await user.tab();
    const active = document.activeElement;
    if (!active || active === document.body) break;
    visited.push(active);
    if (active === mergeButton()) break;
  }
  return visited;
}

describe('CompareA11y', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-011-08: Tab doseže vse vrstice in »Združi kontakte« po vrstnem redu glava stolpcev → vrstice → predogled → gumb', async () => {
    const view = app();
    await ready();

    const visited = await tabToMerge(view.user);

    expect(visited.at(-1)).toBe(mergeButton());
    const ranks = visited.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const headerButtons = visited.filter(
      (element) => element.textContent === 'Izloči iz združevanja',
    );
    expect(headerButtons.length).toBeGreaterThan(0);
    // Ena izbira na skupino izbirnih gumbov (puščice med ostalimi) in vsaka potrditvena značka.
    const radioGroups = screen
      .getAllByRole('group')
      .filter((group) => within(group).queryAllByRole('radio').length > 0);
    expect(radioGroups).toHaveLength(11);
    for (const group of radioGroups) {
      expect(
        within(group)
          .queryAllByRole('radio')
          .some((radio) => visited.includes(radio)),
      ).toBe(true);
    }
    for (const checkbox of within(screen.getByRole('group', { name: 'Značke' })).getAllByRole(
      'checkbox',
    )) {
      expect(visited).toContain(checkbox);
    }
  });

  it('FR-011-12: puščica dol/gor premika izbiro med radio gumbi vrstice, presledek preklopi potrditveno polje značke', async () => {
    const view = app();
    await ready();
    const phone = within(screen.getByRole('group', { name: 'Telefon' }));
    const radios = phone.getAllByRole('radio');
    const selected = radios.findIndex((radio) => (radio as HTMLInputElement).checked);
    expect(selected).toBe(0);
    act(() => radios[0]?.focus());

    await view.user.keyboard('{ArrowDown}');

    expect(radios[1]).toBeChecked();
    expect(radios[1]).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Predogled združenega kontakta' })).toHaveTextContent(
      '041 000 002',
    );
    await view.user.keyboard('{ArrowUp}');
    expect(radios[0]).toBeChecked();

    const tag = within(screen.getByRole('group', { name: 'Značke' })).getByRole('checkbox', {
      name: 'znacka1',
    });
    act(() => tag.focus());
    expect(tag).toBeChecked();
    await view.user.keyboard(' ');
    expect(tag).not.toBeChecked();
    await view.user.keyboard(' ');
    expect(tag).toBeChecked();
  });

  it('FR-011-12: Enter na »Združi kontakte« odpre potrditev, Esc jo zapre in fokus se vrne na sprožilec', async () => {
    const view = app();
    await ready();
    act(() => mergeButton().focus());

    await view.user.keyboard('{Enter}');

    const dialog = await screen.findByRole('alertdialog', { name: 'Združim 10 kontaktov?' });
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    await view.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(mergeButton()).toHaveFocus());
  });

  it('FR-011-12: vsak radio in checkbox ima dostopno ime, vsak fieldset legend (skupina z imenom)', async () => {
    app();
    await ready();

    const radios = screen.getAllByRole('radio');
    const checkboxes = screen.getAllByRole('checkbox');
    expect(radios.length).toBeGreaterThan(0);
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('radio', { name: /\S/ })).toHaveLength(radios.length);
    expect(screen.getAllByRole('checkbox', { name: /\S/ })).toHaveLength(checkboxes.length);
    const groups = screen.getAllByRole('group');
    expect(screen.getAllByRole('group', { name: /\S/ })).toHaveLength(groups.length);
    for (const name of [
      'Ime',
      'Priimek',
      'Naslov',
      'E-naslov',
      'Telefon',
      'Atribut1',
      'Atribut6',
      'Značke',
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  });

  it('FR-011-12: axe (WCAG 2.1 A in AA) brez kršitev na rezultatih iskanja', async () => {
    const view = renderDuplicatesApp(`${PAGE}?category=email`, {
      role: 'EDITOR',
      duplicates: {
        search: () =>
          duplicatesReply([
            duplicateGroup('email', 'janez@primer.si', [{ n: 1 }, { n: 2 }]),
            duplicateGroup('email', 'ana@primer.si', [{ n: 3 }, { n: 4 }]),
          ]),
      },
    });
    await screen.findByRole('list', { name: 'Skupine dvojnikov' });

    expect((await axe(view.container, WCAG)).violations).toEqual([]);
  });

  it('FR-011-12: axe (WCAG 2.1 A in AA) brez kršitev na primerjavi 10 kontaktov z razlago o prvih 10', async () => {
    const view = app(TEN, 14);
    await ready();

    expect((await axe(view.container, WCAG)).violations).toEqual([]);
  });

  it('FR-011-14: axe (WCAG 2.1 A in AA) brez kršitev z odprto potrditvijo', async () => {
    const view = app(TEN);
    await ready();
    await view.user.click(mergeButton());
    await screen.findByRole('alertdialog');

    expect((await axe(document.body, WCAG)).violations).toEqual([]);
  });

  it('FR-011-13: axe (WCAG 2.1 A in AA) brez kršitev z napako ob vrstici', async () => {
    const view = app(NAME_PAIR);
    await ready();
    await view.user.click(
      within(screen.getByRole('group', { name: 'Ime' })).getByRole('radio', { name: '(prazno)' }),
    );
    await view.user.click(
      within(screen.getByRole('group', { name: 'Priimek' })).getByRole('radio', {
        name: '(prazno)',
      }),
    );
    await view.user.click(mergeButton());
    await screen.findByRole('alert');

    expect((await axe(view.container, WCAG)).violations).toEqual([]);
  });
});
