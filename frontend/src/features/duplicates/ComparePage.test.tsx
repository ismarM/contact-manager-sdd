import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  compareContact,
  compareReply,
  compareSet,
  compareTrio,
  GROUP_ID,
  renderDuplicatesApp,
} from '../../test/duplicatesApi';
import type { CompareContact } from './types';

// Stran primerjave: stolpci, vrstice z izbiro vrednosti, enaka polja, značke, predogled, izločitev in razlaga o prvih 10
// kontaktih (FR-011-08 … 12, 21; specs/011-dvojniki/plan.md – Key elements).

const PAGE = `/groups/${GROUP_ID}/duplicates`;
const COMPARE = `${PAGE}/compare`;

const [A, B, C] = compareTrio();

const SHOWING =
  'Prikazanih je prvih 10 od 14 kontaktov. Ostali ostanejo nespremenjeni in jih lahko združiš v naslednjem koraku.';

function comparePath(contacts: CompareContact[], total = contacts.length, extra = '') {
  const ids = contacts.map((contact) => contact.id).join(',');
  return `${COMPARE}?category=email&page=1&size=25${extra}&ids=${ids}&total=${total}`;
}

function app(
  contacts: CompareContact[],
  total = contacts.length,
  role: 'EDITOR' | 'OWNER' = 'EDITOR',
) {
  return renderDuplicatesApp(comparePath(contacts, total), {
    role,
    duplicates: {
      compare: (ids) => compareReply(contacts.filter((contact) => ids.includes(contact.id))),
    },
  });
}

const group = async (name: string) => within(await screen.findByRole('group', { name }));
const columnIds = () => new URLSearchParams(window.location.search).get('ids')?.split(',');

/** Deset kontaktov z različnimi imeni (Ime1 Novak … Ime10 Novak). */
const TEN = compareSet(10);

function isVisible(element: HTMLElement): boolean {
  try {
    expect(element).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

/** Besedila vseh trenutnih obvestil `status`. */
const statusTexts = () => screen.queryAllByRole('status').map((element) => element.textContent);

describe('ComparePage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-011-08: pot …/compare naloži kontakte z GET compare in ids ter pokaže naslov in stolpec za vsak kontakt', async () => {
    const { duplicatesApi } = app([A, B, C]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Primerjava dvojnikov' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Jan Novak' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Janko Novak' })).toBeInTheDocument();
    expect(duplicatesApi.gets('compare').at(0)?.search.get('ids')?.split(',')).toEqual([
      A.id,
      B.id,
      C.id,
    ]);
  });

  it('FR-011-11: prvi kontakt ima oznako »Ostane«, drugi in tretji ne', async () => {
    app([A, B, C]);

    expect(await screen.findByRole('group', { name: 'Janez Novak' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Janez Novak' })).toHaveTextContent('Ostane');
    expect(screen.getByRole('group', { name: 'Jan Novak' })).not.toHaveTextContent('Ostane');
    expect(screen.getByRole('group', { name: 'Janko Novak' })).not.toHaveTextContent('Ostane');
  });

  it('FR-011-08: vrstice »Ime«, »Naslov«, »Telefon«, »Kompetenca« in »Značke« so skupine (fieldset), enaki vrstici sta strnjeni', async () => {
    app([A, B, C]);

    for (const name of ['Ime', 'Naslov', 'Telefon', 'Kompetenca', 'Značke']) {
      expect(await screen.findByRole('group', { name })).toBeVisible();
    }
    expect(screen.queryAllByRole('group', { name: 'Priimek' }).filter(isVisible)).toHaveLength(0);
    expect(screen.queryAllByRole('group', { name: 'E-naslov' }).filter(isVisible)).toHaveLength(0);
  });

  it('FR-011-09: vrstica »Telefon« ima radio (prazno), 041 111 222, 041 333 444, privzeto je izbran 041 111 222', async () => {
    app([A, B, C]);

    const phone = await group('Telefon');
    expect(phone.getByRole('radio', { name: '(prazno)' })).not.toBeChecked();
    expect(phone.getByRole('radio', { name: '041 111 222' })).toBeChecked();
    expect(phone.getByRole('radio', { name: '041 333 444' })).not.toBeChecked();
    expect(phone.getAllByRole('radio')).toHaveLength(3);
  });

  it('FR-011-09: »Enaka polja (2)« razkrije vrstici »Priimek« in »E-naslov«', async () => {
    const { user } = app([A, B, C]);

    const summary = await screen.findByRole('button', { name: 'Enaka polja (2)' });
    await user.click(summary);

    expect(screen.getByRole('group', { name: 'Priimek' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'E-naslov' })).toBeVisible();
  });

  it('FR-011-09: vrstica z enakimi praznimi vrednostmi (naslov) je pod »Enaka polja (3)« skupaj s priimkom in e-naslovom', async () => {
    const first = compareContact({
      n: 1,
      firstName: 'Janez',
      lastName: 'Novak',
      email: 'janez@primer.si',
      phone: '041 111 222',
    });
    const second = compareContact({
      n: 2,
      firstName: 'Ana',
      lastName: 'Novak',
      email: 'janez@primer.si',
      phone: '041 333 444',
    });
    const { user } = app([first, second]);

    const summary = await screen.findByRole('button', { name: 'Enaka polja (3)' });
    expect(screen.queryAllByRole('group', { name: 'Naslov' }).filter(isVisible)).toHaveLength(0);
    await user.click(summary);

    expect(screen.getByRole('group', { name: 'Naslov' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Priimek' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'E-naslov' })).toBeVisible();
  });

  it('FR-011-09: atribut Kompetenca in kompetenca je ena vrstica z možnostma web dev, java in (prazno)', async () => {
    app([A, B, C]);

    const attribute = await group('Kompetenca');
    expect(screen.getAllByRole('group', { name: 'Kompetenca' })).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'kompetenca' })).not.toBeInTheDocument();
    expect(attribute.getAllByRole('radio')).toHaveLength(3);
    expect(attribute.getByRole('radio', { name: 'web dev' })).toBeChecked();
    expect(attribute.getByRole('radio', { name: 'java' })).not.toBeChecked();
    expect(attribute.getByRole('radio', { name: '(prazno)' })).not.toBeChecked();
  });

  it('FR-011-10: značke vip, konferenca2025 in alumni so privzeto obkljukane (VIP ni ponovno)', async () => {
    app([A, B, C]);

    const tags = await group('Značke');
    expect(tags.getAllByRole('checkbox')).toHaveLength(3);
    for (const name of ['vip', 'konferenca2025', 'alumni']) {
      expect(tags.getByRole('checkbox', { name })).toBeChecked();
    }
  });

  it('FR-011-12: predogled prikazuje ime, priimek, naslov, e-naslov, telefon, atribut in značke po privzetih izbirah', async () => {
    app([A, B, C]);

    const preview = await screen.findByRole('region', { name: 'Predogled združenega kontakta' });
    for (const text of [
      'Janez',
      'Novak',
      'Cesta 1',
      'janez@primer.si',
      '041 111 222',
      'Kompetenca',
      'web dev',
      'vip',
      'konferenca2025',
      'alumni',
    ]) {
      expect(preview).toHaveTextContent(text);
    }
  });

  it('FR-011-12: sprememba izbire telefona takoj posodobi predogled', async () => {
    const { user } = app([A, B, C]);
    const phone = await group('Telefon');

    await user.click(phone.getByRole('radio', { name: '041 333 444' }));

    const preview = screen.getByRole('region', { name: 'Predogled združenega kontakta' });
    expect(phone.getByRole('radio', { name: '041 333 444' })).toBeChecked();
    expect(preview).toHaveTextContent('041 333 444');
    expect(preview).not.toHaveTextContent('041 111 222');
  });

  it('FR-011-10: odkljukanje značke spremeni predogled, ponovno obkljukanje jo vrne', async () => {
    const { user } = app([A, B, C]);
    const tags = await group('Značke');
    const preview = screen.getByRole('region', { name: 'Predogled združenega kontakta' });

    await user.click(tags.getByRole('checkbox', { name: 'vip' }));
    expect(tags.getByRole('checkbox', { name: 'vip' })).not.toBeChecked();
    expect(preview).not.toHaveTextContent('vip');
    expect(preview).toHaveTextContent('konferenca2025');

    await user.click(tags.getByRole('checkbox', { name: 'vip' }));
    expect(preview).toHaveTextContent('vip');
  });

  it('FR-011-12: izbira (prazno) pri atributu odstrani atribut iz predogleda', async () => {
    const { user } = app([A, B, C]);
    const attribute = await group('Kompetenca');

    await user.click(attribute.getByRole('radio', { name: '(prazno)' }));

    const preview = screen.getByRole('region', { name: 'Predogled združenega kontakta' });
    expect(preview).not.toHaveTextContent('web dev');
    expect(preview).not.toHaveTextContent('Kompetenca');
  });

  it('FR-011-11: »Izloči iz združevanja« pri C odstrani stolpec C in izbire nanj, ids v naslovu izgubi C', async () => {
    const { user } = app([A, B, C]);
    const phone = await group('Telefon');
    await user.click(phone.getByRole('radio', { name: '041 333 444' }));

    await user.click(
      within(screen.getByRole('group', { name: 'Janko Novak' })).getByRole('button', {
        name: 'Izloči iz združevanja',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Janko Novak' })).toBeNull());
    expect(screen.queryByRole('radio', { name: '041 333 444' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '041 111 222' })).toBeChecked();
    expect(columnIds()).toEqual([A.id, B.id]);
    expect(screen.getByRole('region', { name: 'Predogled združenega kontakta' })).toHaveTextContent(
      '041 111 222',
    );
  });

  it('FR-011-11: pri dveh kontaktih gumba ni, namesto njega je razlaga »Združiti je treba vsaj 2 kontakta.«', async () => {
    app([A, B]);

    expect(await screen.findByRole('note')).toHaveTextContent('Združiti je treba vsaj 2 kontakta.');
    expect(screen.queryByRole('button', { name: 'Izloči iz združevanja' })).not.toBeInTheDocument();
  });

  it('FR-011-11: izločitev A – oznaka »Ostane« preide na B', async () => {
    const { user } = app([A, B, C]);

    await user.click(
      within(await screen.findByRole('group', { name: 'Janez Novak' })).getByRole('button', {
        name: 'Izloči iz združevanja',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Janez Novak' })).toBeNull());
    expect(screen.getByRole('group', { name: 'Jan Novak' })).toHaveTextContent('Ostane');
    expect(screen.getByRole('group', { name: 'Janko Novak' })).not.toHaveTextContent('Ostane');
  });

  it('FR-011-21: total=14 z 10 kontakti – status »Prikazanih je prvih 10 od 14 kontaktov. …«', async () => {
    app(TEN, 14);

    await screen.findAllByRole('button', { name: 'Izloči iz združevanja' });
    expect(statusTexts()).toContain(SHOWING);
  });

  it.each([10, 3])('FR-011-21: total=%i – statusa o prvih 10 ni', async (total) => {
    app(TEN.slice(0, total), total);

    await screen.findAllByRole('button', { name: 'Izloči iz združevanja' });
    expect(statusTexts().filter((text) => text?.startsWith('Prikazanih je prvih'))).toEqual([]);
  });

  it('FR-011-21: total=10 z 10 kontakti – po izločitvi dveh (8 kontaktov) statusa še vedno ni', async () => {
    const { user } = app(TEN, 10);

    for (let i = 0; i < 2; i += 1) {
      const buttons = await screen.findAllByRole('button', { name: 'Izloči iz združevanja' });
      await user.click(buttons[buttons.length - 1] as HTMLElement);
    }

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Izloči iz združevanja' })).toHaveLength(8),
    );
    expect(columnIds()).toHaveLength(8);
    expect(statusTexts().filter((text) => text?.startsWith('Prikazanih je prvih'))).toEqual([]);
  });

  it('FR-011-21: total=14 z 10 kontakti – po izločitvi dveh (8 kontaktov) je status »Prikazanih je prvih 10 od 14 …« še vedno prikazan', async () => {
    const { user } = app(TEN, 14);

    for (let i = 0; i < 2; i += 1) {
      const buttons = await screen.findAllByRole('button', { name: 'Izloči iz združevanja' });
      await user.click(buttons[buttons.length - 1] as HTMLElement);
    }

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Izloči iz združevanja' })).toHaveLength(8),
    );
    expect(statusTexts()).toContain(SHOWING);
  });

  it('FR-011-16: odgovor compare z enim kontaktom – preusmeritev na rezultate z »Te skupine dvojnikov ni več.«', async () => {
    renderDuplicatesApp(comparePath([A, B]), {
      role: 'EDITOR',
      duplicates: { compare: () => compareReply([A]) },
    });

    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    await waitFor(() => expect(statusTexts()).toContain('Te skupine dvojnikov ni več.'));
  });

  it('FR-011-08: ids z manj kot 2 kontaktoma – preusmeritev na rezultate brez klica compare', async () => {
    const { duplicatesApi } = renderDuplicatesApp(
      `${COMPARE}?category=email&page=1&size=25&ids=${A.id}&total=1`,
      { role: 'EDITOR' },
    );

    await waitFor(() => expect(window.location.pathname).toBe(PAGE));
    expect(duplicatesApi.gets('compare')).toHaveLength(0);
  });

  it('FR-011-18: »Nazaj na rezultate« vodi na rezultate z istimi category, page in size', async () => {
    renderDuplicatesApp(
      `${COMPARE}?category=phone&page=3&size=50&ids=${A.id},${B.id},${C.id}&total=3`,
      {
        role: 'EDITOR',
        duplicates: { compare: () => compareReply([A, B, C]) },
      },
    );

    const back = await screen.findByRole('link', { name: 'Nazaj na rezultate' });
    const href = new URL(back.getAttribute('href') ?? '', 'http://localhost');
    expect(href.pathname).toBe(PAGE);
    expect(href.searchParams.get('category')).toBe('phone');
    expect(href.searchParams.get('page')).toBe('3');
    expect(href.searchParams.get('size')).toBe('50');
  });

  it('FR-011-08: primerjava v angleščini – naslov, povezava, oznaka Kept, vrstice, predogled', async () => {
    await i18n.changeLanguage('en');
    app([A, B, C]);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Compare duplicates' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to results' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Janez Novak' })).toHaveTextContent('Kept');
    expect(screen.getAllByRole('button', { name: 'Exclude from merge' })).toHaveLength(3);
    for (const name of ['First name', 'Address', 'Phone', 'Tags']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Identical fields (2)' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Phone' })).getByRole('radio', { name: '(empty)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Merged contact preview' })).toBeInTheDocument();
  });

  it('FR-011-12: axe brez kršitev (primerjava s tremi kontakti, pri 2 kontaktih in z razlago o prvih 10)', async () => {
    const three = app([A, B, C]);
    await screen.findByRole('region', { name: 'Predogled združenega kontakta' });
    expect((await axe(three.container)).violations).toEqual([]);
    three.unmount();

    const many = app(TEN, 14);
    await screen.findAllByRole('button', { name: 'Izloči iz združevanja' });
    expect((await axe(many.container)).violations).toEqual([]);
    many.unmount();

    const two = app([A, B]);
    await screen.findByRole('note');
    expect((await axe(two.container)).violations).toEqual([]);
  });
});
