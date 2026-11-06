import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, type Reply, renderGroupsApp } from '../../test/groupsApi';
import type { GroupDetail } from './types';

// *Nastavitve → Podatki skupine*: branje za vse člane, urejanje za lastnika in admina nearhivirane skupine, konflikt
// verzij (FR-002-02, -10, -11, -12, -13; plan.md – Key elements; design.md 8.13, 8.14, 9.7).

const PATH = `/groups/${GROUP_ID}/settings`;

function renderDetails(
  detail: Partial<GroupDetail>,
  update?: (id: string, body: unknown) => Reply | Promise<Reply>,
) {
  return renderGroupsApp(PATH, {
    get: () => ({ status: 200, body: groupDetail(detail) }),
    update,
  });
}

async function findForm() {
  return screen.findByRole('form', { name: 'Podatki skupine' });
}

const time = (date: Date) =>
  new Intl.DateTimeFormat('sl', { hour: 'numeric', minute: '2-digit' }).format(date);

describe('GroupDetailsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(['VIEWER', 'EDITOR'] as const)(
    'FR-002-10: %s vidi naslov, opis in ime barve brez obrazca',
    async (role) => {
      renderDetails({ role });

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
        'Naslov',
        'Opis',
        'Barva',
      ]);
      expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
        'Projekt FERI',
        'Kontakti projekta',
        'Mah',
      ]);
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Shrani spremembe' })).not.toBeInTheDocument();
    },
  );

  it('FR-002-10: skupina brez opisa – »Brez opisa«', async () => {
    renderDetails({ role: 'VIEWER', description: null });

    await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
    expect(screen.getAllByRole('definition')[1]).toHaveTextContent('Brez opisa');
  });

  it.each(['ADMIN', 'OWNER'] as const)(
    'FR-002-11: %s arhivirane skupine vidi podatke brez obrazca',
    async (role) => {
      renderDetails({ role, archived: true });

      await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
      expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual([
        'Projekt FERI',
        'Kontakti projekta',
        'Mah',
      ]);
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    },
  );

  it('FR-002-11: admin spremeni naslov in barvo – zahtevek z verzijo, obvestilo, nov naslov v glavi in naslovu strani, osvežen povzetek', async () => {
    const { user, api, listRequests } = renderDetails({ role: 'ADMIN' });
    const form = await findForm();
    expect(within(form).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Projekt FERI');
    expect(within(form).getByRole('textbox', { name: 'Opis' })).toHaveValue('Kontakti projekta');
    expect(within(form).getByRole('radio', { name: 'Mah' })).toBeChecked();
    await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(0));
    const summariesBefore = listRequests(10).length;

    const title = within(form).getByRole('textbox', { name: 'Naslov' });
    await user.clear(title);
    await user.type(title, 'Projekt FERI 2');
    await user.click(within(form).getByRole('radio', { name: 'Rja' }));
    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    await waitFor(() => expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(1));
    expect(api.of('PUT', `/api/groups/${GROUP_ID}`)[0]?.body).toEqual({
      title: 'Projekt FERI 2',
      description: 'Kontakti projekta',
      color: 'rja',
      version: 3,
    });
    const notifications = screen.getByRole('region', { name: 'Obvestila' });
    expect(
      await within(notifications).findByText('Podatki skupine so shranjeni.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Projekt FERI 2' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Nastavitve – Projekt FERI 2 – Kontakti'));
    await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(summariesBefore));
  });

  it('FR-002-11: lastnik pobriše opis – zahtevek nosi description: null', async () => {
    const { user, api } = renderDetails({ role: 'OWNER' });
    const form = await findForm();

    await user.clear(within(form).getByRole('textbox', { name: 'Opis' }));
    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    await waitFor(() => expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(1));
    expect(api.of('PUT', `/api/groups/${GROUP_ID}`)[0]?.body).toMatchObject({ description: null });
  });

  it('FR-002-02: prazen naslov – brez zahtevka, napaka ob polju', async () => {
    const { user, api } = renderDetails({ role: 'ADMIN' });
    const form = await findForm();
    const title = within(form).getByRole('textbox', { name: 'Naslov' });

    await user.clear(title);
    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('Vpiši naslov.');
    expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(0);
  });

  it('FR-002-02: naslov s 101 znakom in opis s 1001 znakom – brez zahtevka, napaki ob poljih', async () => {
    const { user, api } = renderDetails({ role: 'ADMIN' });
    const form = await findForm();
    const title = within(form).getByRole('textbox', { name: 'Naslov' });
    const description = within(form).getByRole('textbox', { name: 'Opis' });
    await user.clear(title);
    await user.click(title);
    await user.paste('a'.repeat(101));
    await user.clear(description);
    await user.click(description);
    await user.paste('b'.repeat(1001));

    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    expect(title).toHaveAccessibleDescription('Naslov je lahko dolg največ 100 znakov.');
    expect(description).toHaveAccessibleDescription('Opis je lahko dolg največ 1000 znakov.');
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(0);
  });

  it('FR-002-02: 400 VALIDATION_FAILED s strežnika – napaka ob polju (ne splošno sporočilo), vnosi ostanejo', async () => {
    const { user } = renderDetails({ role: 'ADMIN' }, () => ({
      status: 400,
      body: { code: 'VALIDATION_FAILED', errors: [{ field: 'title', code: 'TOO_LONG' }] },
    }));
    const form = await findForm();
    const title = within(form).getByRole('textbox', { name: 'Naslov' });
    await user.clear(title);
    await user.type(title, 'Moj naslov');

    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    await waitFor(() =>
      expect(title).toHaveAccessibleDescription('Naslov je lahko dolg največ 100 znakov.'),
    );
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveValue('Moj naslov');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('konflikt verzij (FR-002-12)', () => {
    const changedAt = new Date();
    const current = groupDetail({
      role: 'ADMIN',
      title: 'Novejši',
      version: 5,
      updatedAt: changedAt.toISOString(),
      updatedBy: { name: 'Bojan Kos', email: 'bojan@primer.si' },
    });

    function renderConflict(updatedBy: GroupDetail['updatedBy'] = current.updatedBy) {
      let calls = 0;
      return renderDetails({ role: 'ADMIN' }, (_id, body) => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 409,
            body: { code: 'VERSION_CONFLICT', current: { ...current, updatedBy } },
          };
        }
        return {
          status: 200,
          body: groupDetail({ ...(body as GroupDetail), role: 'ADMIN', version: 6 }),
        };
      });
    }

    async function saveMyTitle(user: ReturnType<typeof renderConflict>['user']) {
      const form = await findForm();
      const title = within(form).getByRole('textbox', { name: 'Naslov' });
      await user.clear(title);
      await user.type(title, 'Moj naslov');
      await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));
      return form;
    }

    it('FR-002-12: obrazec ostane z vnosi, opozorilo pove kdo in kdaj', async () => {
      const { user } = renderConflict();

      const form = await saveMyTitle(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        `Skupino je medtem spremenil(a) Bojan Kos ob ${time(changedAt)}.`,
      );
      expect(within(form).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Moj naslov');
    });

    it('FR-002-12: izvajalec brez računa je »izbrisan uporabnik«', async () => {
      const { user } = renderConflict(null);

      await saveMyTitle(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Skupino je medtem spremenil(a) izbrisan uporabnik ob',
      );
    });

    it('FR-002-12: Prikaži razlike razkrije tabelo samo z različnimi polji', async () => {
      const { user } = renderConflict();
      await saveMyTitle(user);
      const alert = await screen.findByRole('alert');
      const show = within(alert).getByRole('button', { name: 'Prikaži razlike' });
      expect(show).toHaveAttribute('aria-expanded', 'false');

      await user.click(show);

      expect(show).toHaveAttribute('aria-expanded', 'true');
      const table = screen.getByRole('table', {
        name: 'Razlike med tvojimi in trenutnimi vrednostmi',
      });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((cell) => cell.textContent),
      ).toEqual(['Polje', 'Tvoja vrednost', 'Trenutna vrednost']);
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(1);
      // Ime polja je lahko `cell` ali `rowheader` (<th scope="row">) – oboje ustreza planu.
      const row = within(rows[0] as HTMLElement);
      expect(
        [...row.queryAllByRole('rowheader'), ...row.queryAllByRole('cell')].map(
          (cell) => cell.textContent,
        ),
      ).toEqual(['Naslov', 'Moj naslov', 'Novejši']);
    });

    it('FR-002-12: Uporabi trenutno različico prikaže trenutne podatke brez zahtevka', async () => {
      const { user, api } = renderConflict();
      const form = await saveMyTitle(user);
      const alert = await screen.findByRole('alert');

      await user.click(within(alert).getByRole('button', { name: 'Uporabi trenutno različico' }));

      expect(within(form).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Novejši');
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(1);

      // Obrazec prevzame tudi trenutno verzijo: naslednje shranjevanje pošlje version 5.
      await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));
      await waitFor(() => expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(2));
      expect(api.of('PUT', `/api/groups/${GROUP_ID}`)[1]?.body).toMatchObject({
        title: 'Novejši',
        version: 5,
      });
    });

    it('FR-002-12: Shrani moje spremembe pošlje moje vrednosti s trenutno verzijo', async () => {
      const { user, api } = renderConflict();
      await saveMyTitle(user);
      const alert = await screen.findByRole('alert');

      await user.click(within(alert).getByRole('button', { name: 'Shrani moje spremembe' }));

      await waitFor(() => expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(2));
      expect(api.of('PUT', `/api/groups/${GROUP_ID}`)[1]?.body).toEqual({
        title: 'Moj naslov',
        description: 'Kontakti projekta',
        color: 'mah',
        version: 5,
      });
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Moj naslov' }),
      ).toBeInTheDocument();
    });
  });

  it.each([
    [
      { status: 409, body: { code: 'GROUP_ARCHIVED' } },
      'Skupina je medtem postala arhivirana, zato je ni več mogoče urejati.',
    ],
    [{ status: 403, body: { code: 'FORBIDDEN' } }, 'Za to dejanje nimaš več pravic.'],
    [
      { status: 500, body: { code: 'INTERNAL' } },
      'Sprememb ni bilo mogoče shraniti. Poskusi znova.',
    ],
    ['network-error', 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ] as const)(
    'FR-002-13: neuspeh %j – razumljivo sporočilo brez kod, vnosi ostanejo',
    async (reply, message) => {
      const { user } = renderDetails({ role: 'ADMIN' }, () => reply);
      const form = await findForm();
      const title = within(form).getByRole('textbox', { name: 'Naslov' });
      await user.clear(title);
      await user.type(title, 'Moj naslov');

      await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert.textContent).not.toMatch(/GROUP_ARCHIVED|FORBIDDEN|INTERNAL|40\d|50\d/);
      expect(within(form).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Moj naslov');
    },
  );

  it('FR-002-13: 404 ob shranjevanju (izguba članstva) prikaže »Te strani ni«', async () => {
    const { user } = renderDetails({ role: 'ADMIN' }, () => ({ status: 404 }));
    const form = await findForm();

    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['sl', 'branje'],
    ['en', 'branje'],
    ['sl', 'obrazec'],
    ['en', 'obrazec'],
    ['sl', 'konflikt'],
    ['en', 'konflikt'],
    ['sl', 'napaka'],
    ['en', 'napaka'],
  ] as const)(
    'FR-002-10 FR-002-11 FR-002-12: Podatki skupine nimajo kršitev axe (%s, %s)',
    async (language, state) => {
      await i18n.changeLanguage(language);
      const conflict: Reply = {
        status: 409,
        body: {
          code: 'VERSION_CONFLICT',
          current: groupDetail({ role: 'ADMIN', title: 'Novejši', version: 5 }),
        },
      };
      const { user, container } = renderDetails(
        { role: state === 'branje' ? 'VIEWER' : 'ADMIN' },
        () => (state === 'konflikt' ? conflict : { status: 500, body: { code: 'INTERNAL' } }),
      );
      await screen.findByRole('heading', {
        level: 2,
        name: language === 'sl' ? 'Podatki skupine' : 'Group details',
      });
      if (state === 'konflikt' || state === 'napaka') {
        const form = await screen.findByRole('form', {
          name: language === 'sl' ? 'Podatki skupine' : 'Group details',
        });
        const title = within(form).getByRole('textbox', {
          name: language === 'sl' ? 'Naslov' : 'Title',
        });
        await user.clear(title);
        await user.type(title, 'Moj naslov');
        await user.click(
          within(form).getByRole('button', {
            name: language === 'sl' ? 'Shrani spremembe' : 'Save changes',
          }),
        );
        const alert = await screen.findByRole('alert');
        if (state === 'konflikt') {
          await user.click(
            within(alert).getByRole('button', {
              name: language === 'sl' ? 'Prikaži razlike' : 'Show differences',
            }),
          );
        }
      }

      expect((await axe(container)).violations).toEqual([]);
    },
  );
});
