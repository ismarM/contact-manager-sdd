import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  conflictReply,
  contactDetail,
  GROUP_ID,
  renderContactsApp,
  daysAgoAt,
  todayAt,
} from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';

// Razrešitev konflikta verzij pri urejanju (FR-004-11; design.md 8.12, 9.5).

const VIEW = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const MINE = contactDetail({
  version: 3,
  phone: '01 234 5678',
  attributes: [{ key: 'kompetenca', value: 'web dev' }],
  tags: ['vip'],
});
const CURRENT = contactDetail({
  version: 4,
  phone: '031 999 888',
  attributes: [{ key: 'kompetenca', value: 'backend' }],
  tags: ['vip', 'konferenca2025'],
  updatedAt: todayAt(14, 32),
  updatedBy: { name: 'Bojan Kovač', email: 'bojan@primer.si' },
});

/** Čas današnje spremembe v zapisu jezika (feature-map §2.9; design.md 8.14: »… ob 14.32.«; pravilo kot 002). */
const clock = (iso: string, language: 'sl' | 'en') =>
  new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

async function conflictedForm(
  update: Parameters<typeof renderContactsApp>[1] extends infer O
    ? O extends { contacts?: infer C }
      ? C extends { update?: infer U }
        ? U
        : never
      : never
    : never = () => conflictReply(CURRENT),
) {
  let gets = 0;
  const view = renderContactsApp(`${VIEW}/edit`, {
    role: 'EDITOR',
    contacts: {
      get: () => ({ status: 200, body: gets++ === 0 ? MINE : CURRENT }),
      update,
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
  const name = screen.getByRole('textbox', { name: 'Priimek' });
  await view.user.clear(name);
  await view.user.type(name, 'Horvat');
  await view.user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));
  const alert = await screen.findByRole('alert');
  return { ...view, alert };
}

describe('ContactConflict', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-004-11: 409 – opozorilo z imenom in časom, obrazec ostane z vnesenimi vrednostmi', async () => {
    const { alert } = await conflictedForm();

    expect(alert).toHaveTextContent(
      `Kontakt je medtem spremenil(a) Bojan Kovač ob ${clock(CURRENT.updatedAt, 'sl')}.`,
    );
    expect(within(alert).getByRole('button', { name: 'Prikaži razlike' })).toBeInTheDocument();
    expect(
      within(alert).getByRole('button', { name: 'Uporabi trenutno različico' }),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole('button', { name: 'Shrani moje spremembe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Priimek' })).toHaveValue('Horvat');
    expect(currentLocation()).toBe(`${VIEW}/edit`);
  });

  it('FR-004-11: izbrisan uporabnik – »izbrisan uporabnik«', async () => {
    const { alert } = await conflictedForm(() => conflictReply({ ...CURRENT, updatedBy: null }));

    expect(alert).toHaveTextContent(
      `Kontakt je medtem spremenil(a) izbrisan uporabnik ob ${clock(CURRENT.updatedAt, 'sl')}.`,
    );
  });

  it('FR-004-11: sprememba z drugega dne – pred uro je še datum (pravilo kot 002)', async () => {
    const yesterday = daysAgoAt(1, 9, 5);
    const { alert } = await conflictedForm(() =>
      conflictReply({ ...CURRENT, updatedAt: yesterday }),
    );

    const date = new Intl.DateTimeFormat('sl', { dateStyle: 'medium' }).format(new Date(yesterday));
    expect(alert).toHaveTextContent(
      `Kontakt je medtem spremenil(a) Bojan Kovač ob ${date} ${clock(yesterday, 'sl')}.`,
    );
  });

  it('FR-004-11: Prikaži razlike – preglednica samo za polja, ki se razlikujejo', async () => {
    const { user, alert } = await conflictedForm();

    await user.click(within(alert).getByRole('button', { name: 'Prikaži razlike' }));

    const table = await screen.findByRole('table', {
      name: 'Razlike med tvojimi in trenutnimi vrednostmi',
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Polje', 'Tvoja vrednost', 'Trenutna vrednost']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual([
      'Priimek',
      'Telefon',
      'Dodatni atributi',
      'Značke',
    ]);
    const cells = (index: number) =>
      within(rows[index]!)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    expect(cells(0)).toEqual(['Horvat', 'Novak']);
    expect(cells(1)).toEqual(['01 234 5678', '031 999 888']);
    const [myAttributes, currentAttributes] = cells(2);
    expect(myAttributes).toContain('kompetenca');
    expect(myAttributes).toContain('web dev');
    expect(myAttributes).not.toContain('backend');
    expect(currentAttributes).toContain('backend');
    expect(currentAttributes).not.toContain('web dev');
    const [myTags, currentTags] = cells(3);
    expect(myTags).toContain('vip');
    expect(myTags).not.toContain('konferenca2025');
    expect(currentTags).toContain('vip');
    expect(currentTags).toContain('konferenca2025');
  });

  it('FR-004-11: Uporabi trenutno različico naloži trenutne vrednosti in verzijo; opozorilo izgine', async () => {
    const { user, alert, api } = await conflictedForm();

    await user.click(within(alert).getByRole('button', { name: 'Uporabi trenutno različico' }));

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Priimek' })).toHaveValue('Novak'),
    );
    expect(screen.getByRole('textbox', { name: 'Telefon' })).toHaveValue('031 999 888');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));
    await waitFor(() =>
      expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)).toHaveLength(2),
    );
    expect(api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`)[1]?.body).toMatchObject({
      version: 4,
      phone: '031 999 888',
    });
  });

  it('FR-004-11: Shrani moje spremembe pošlje moje vrednosti s trenutno verzijo', async () => {
    let calls = 0;
    const { user, alert, api } = await conflictedForm((id, body) =>
      calls++ === 0
        ? conflictReply(CURRENT)
        : { status: 200, body: contactDetail({ ...(body as object), id, version: 5 }) },
    );

    await user.click(within(alert).getByRole('button', { name: 'Shrani moje spremembe' }));

    await waitFor(() => expect(currentLocation()).toBe(VIEW));
    const puts = api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`);
    expect(puts).toHaveLength(2);
    expect(puts[1]?.body).toMatchObject({ lastName: 'Horvat', phone: '01 234 5678', version: 4 });
  });

  it('FR-004-11: če se kontakt vmes spet spremeni, se opozorilo ponovi', async () => {
    const AGAIN = {
      ...CURRENT,
      version: 5,
      updatedAt: todayAt(15, 5),
      updatedBy: { name: 'Cene Zupan', email: 'c@primer.si' },
    };
    let puts = 0;
    const { user, alert, api } = await conflictedForm(() =>
      conflictReply(puts++ === 0 ? CURRENT : AGAIN),
    );
    expect(alert).toHaveTextContent('Bojan Kovač');

    await user.click(within(alert).getByRole('button', { name: 'Shrani moje spremembe' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        `Kontakt je medtem spremenil(a) Cene Zupan ob ${clock(AGAIN.updatedAt, 'sl')}.`,
      ),
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Bojan Kovač');
    const sent = api.of('PUT', `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body).toMatchObject({ lastName: 'Horvat', version: 4 });
    expect(screen.getByRole('textbox', { name: 'Priimek' })).toHaveValue('Horvat');
    expect(currentLocation()).toBe(`${VIEW}/edit`);
  });

  it('FR-004-11: brez kršitev axe z opozorilom in preglednico razlik (sl in en)', async () => {
    const { user, alert, container } = await conflictedForm();
    await user.click(within(alert).getByRole('button', { name: 'Prikaži razlike' }));
    await screen.findByRole('table', { name: 'Razlike med tvojimi in trenutnimi vrednostmi' });
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    expect(
      await screen.findByRole('table', { name: 'Differences between your and the current values' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      `The contact was changed by Bojan Kovač at ${clock(CURRENT.updatedAt, 'en')} in the meantime.`,
    );
    expect(screen.getByRole('button', { name: 'Use current version' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
