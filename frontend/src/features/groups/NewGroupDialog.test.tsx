import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { groupDetail, groupId, listReply, renderGroupsApp, summary } from '../../test/groupsApi';
import { currentLocation } from '../../test/renderApp';

// Dialog *Nova skupina* na zaslonu *Skupine* (FR-002-01, -02, -03, -13; plan.md – Key elements, design.md 8.10, 8.13).

const COLORS_SL = ['Tinta', 'Mah', 'Opeka', 'Oker', 'Sliva', 'Morje', 'Grafit', 'Rja'];
const CREATED = groupId(999);

/** Zaslon *Skupine* z odgovorom na branje nove skupine (po ustvarjanju se odpre). */
function renderGroupsScreen(handlers: Parameters<typeof renderGroupsApp>[1] = {}) {
  return renderGroupsApp('/', {
    get: (id) =>
      id === CREATED
        ? {
            status: 200,
            body: groupDetail({ id, title: 'Projekt FERI', role: 'OWNER', version: 0 }),
          }
        : { status: 404 },
    ...handlers,
  });
}

async function openDialog(user: ReturnType<typeof renderGroupsScreen>['user']) {
  const main = await screen.findByRole('main');
  await user.click(await within(main).findByRole('button', { name: 'Nova skupina' }));
  return screen.findByRole('dialog', { name: 'Nova skupina' });
}

describe('NewGroupDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-01: dialog ima Naslov (obvezno), Opis, 8 barv s privzeto Tinto ter Prekliči in Ustvari skupino', async () => {
    const { user } = renderGroupsScreen();

    const dialog = await openDialog(user);

    const title = within(dialog).getByRole('textbox', { name: 'Naslov' });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-required', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Opis' })).toBeInTheDocument();
    const colors = within(dialog).getByRole('radiogroup', { name: 'Barva' });
    const radios = within(colors).getAllByRole('radio');
    expect(radios).toHaveLength(8);
    COLORS_SL.forEach((name, index) => {
      expect(radios[index]).toBe(within(colors).getByRole('radio', { name }));
    });
    expect(within(colors).getByRole('radio', { name: 'Tinta' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ustvari skupino' })).toBeInTheDocument();
  });

  it('FR-002-01: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
    const { user, api } = renderGroupsScreen();

    let dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Prekliči' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const trigger = within(screen.getByRole('main')).getByRole('button', { name: 'Nova skupina' });
    expect(trigger).toHaveFocus();

    dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'X');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(api.of('POST', '/api/groups')).toHaveLength(0);
  });

  it('FR-002-02: prazen naslov ali samo presledki – brez zahtevka, napaka ob polju, vnosi ostanejo', async () => {
    const { user, api } = renderGroupsScreen();
    const dialog = await openDialog(user);
    const title = within(dialog).getByRole('textbox', { name: 'Naslov' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Opis' }), 'Moj opis');

    for (const value of ['', '   ']) {
      await user.clear(title);
      if (value) await user.type(title, value);
      await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

      expect(title).toHaveAttribute('aria-invalid', 'true');
      expect(title).toHaveAccessibleDescription('Vpiši naslov.');
    }
    expect(screen.getByRole('dialog', { name: 'Nova skupina' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Opis' })).toHaveValue('Moj opis');
    expect(api.of('POST', '/api/groups')).toHaveLength(0);
  });

  it('FR-002-02: naslov s 101 znakom in opis s 1001 znakom sta zavrnjena ob ustreznem polju', async () => {
    const { user, api } = renderGroupsScreen();
    const dialog = await openDialog(user);
    const title = within(dialog).getByRole('textbox', { name: 'Naslov' });
    const description = within(dialog).getByRole('textbox', { name: 'Opis' });
    await user.click(title);
    await user.paste('a'.repeat(101));
    await user.click(description);
    await user.paste('b'.repeat(1001));

    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

    expect(title).toHaveAccessibleDescription('Naslov je lahko dolg največ 100 znakov.');
    expect(description).toHaveAccessibleDescription('Opis je lahko dolg največ 1000 znakov.');
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(api.of('POST', '/api/groups')).toHaveLength(0);
  });

  it('FR-002-02: napaka barve s strežnika (400) je prikazana ob izbiri barve', async () => {
    const { user } = renderGroupsScreen({
      create: () => ({
        status: 400,
        body: { code: 'VALIDATION_FAILED', errors: [{ field: 'color', code: 'INVALID_VALUE' }] },
      }),
    });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Projekt FERI');

    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('radiogroup', { name: 'Barva' })).toHaveAccessibleDescription(
        'Izberi eno od ponujenih barv.',
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Nova skupina' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Projekt FERI');
  });

  it.each([
    [500, 'Skupine ni bilo mogoče ustvariti. Poskusi znova.'],
    ['network-error', 'Ni povezave. Preveri povezavo in poskusi znova.'],
  ] as const)(
    'FR-002-13: neuspeh (%s) – sporočilo nad obrazcem brez kod, vnosi ostanejo, ponoven poskus uspe',
    async (failure, message) => {
      let attempts = 0;
      const { user } = renderGroupsScreen({
        create: (body) => {
          attempts += 1;
          if (attempts === 1) {
            return failure === 'network-error'
              ? 'network-error'
              : { status: failure, body: { code: 'INTERNAL' } };
          }
          return {
            status: 201,
            body: groupDetail({
              id: CREATED,
              title: (body as { title: string }).title,
              version: 0,
            }),
          };
        },
      });
      const dialog = await openDialog(user);
      await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Projekt FERI');
      await user.type(within(dialog).getByRole('textbox', { name: 'Opis' }), 'Opis');

      await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert.textContent).not.toMatch(/INTERNAL|500/);
      expect(within(dialog).getByRole('textbox', { name: 'Naslov' })).toHaveValue('Projekt FERI');
      expect(within(dialog).getByRole('textbox', { name: 'Opis' })).toHaveValue('Opis');

      await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));
      await waitFor(() => expect(currentLocation()).toBe(`/groups/${CREATED}/settings`));
    },
  );

  it('FR-002-01 FR-002-03: uspeh – zahtevek s podatki, obvestilo, odprta nova skupina, fokus na naslovu, osvežen povzetek', async () => {
    const { user, api, listRequests } = renderGroupsScreen();
    const dialog = await openDialog(user);
    await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(0));
    const summariesBefore = listRequests(10).length;
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Projekt FERI');
    await user.type(within(dialog).getByRole('textbox', { name: 'Opis' }), 'Kontakti projekta');
    await user.click(within(dialog).getByRole('radio', { name: 'Mah' }));

    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

    await waitFor(() => expect(currentLocation()).toBe(`/groups/${CREATED}/settings`));
    expect(api.of('POST', '/api/groups')[0]?.body).toEqual({
      title: 'Projekt FERI',
      description: 'Kontakti projekta',
      color: 'mah',
    });
    const notifications = screen.getByRole('region', { name: 'Obvestila' });
    expect(within(notifications).getByText('Skupina je ustvarjena.')).toBeInTheDocument();
    const heading = await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(summariesBefore));

    await user.click(within(notifications).getByRole('button', { name: 'Zapri obvestilo' }));
    await waitFor(() =>
      expect(within(notifications).queryByText('Skupina je ustvarjena.')).not.toBeInTheDocument(),
    );
  });

  it('FR-002-03: zakasnjeno nalaganje nove skupine ne ukrade fokusa, ki ga je uporabnik medtem premaknil', async () => {
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user } = renderGroupsScreen({
      list: listReply({ OWNER: [summary(1)] }),
      get: async (id) => {
        await loaded;
        return {
          status: 200,
          body: groupDetail({ id, title: 'Projekt FERI', role: 'OWNER', version: 0 }),
        };
      },
    });
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Projekt FERI');
    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));
    await waitFor(() => expect(currentLocation()).toBe(`/groups/${CREATED}/settings`));

    // Skupina se še nalaga; uporabnik s tipkovnico fokusira gumb za preklop skupine (design.md 7.1).
    const switcher = await screen.findByRole('button', { name: 'Preklopi skupino' });
    switcher.focus();
    expect(switcher).toHaveFocus();
    release();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });
    expect(heading).not.toHaveFocus();
    expect(switcher).toHaveFocus();
  });

  it('FR-002-03: brez izbire barve je v zahtevku privzeta tinta', async () => {
    const { user, api } = renderGroupsScreen();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Naslov' }), 'Brez barve');

    await user.click(within(dialog).getByRole('button', { name: 'Ustvari skupino' }));

    await waitFor(() => expect(api.of('POST', '/api/groups')).toHaveLength(1));
    expect(api.of('POST', '/api/groups')[0]?.body).toEqual({
      title: 'Brez barve',
      description: null,
      color: 'tinta',
    });
  });

  it.each(['sl', 'en'] as const)(
    'FR-002-01 FR-002-02: odprt dialog z napakami nima kršitev axe (%s)',
    async (language) => {
      await i18n.changeLanguage(language);
      const { user, baseElement } = renderGroupsScreen();
      const main = await screen.findByRole('main');
      const newGroup = language === 'sl' ? 'Nova skupina' : 'New group';
      await user.click(await within(main).findByRole('button', { name: newGroup }));
      const dialog = await screen.findByRole('dialog', { name: newGroup });
      if (language === 'en') {
        expect(within(dialog).getByRole('radiogroup', { name: 'Color' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
      }
      expect((await axe(baseElement)).violations).toEqual([]);

      await user.click(
        within(dialog).getByRole('button', {
          name: language === 'sl' ? 'Ustvari skupino' : 'Create group',
        }),
      );
      expect(
        within(dialog).getByRole('textbox', { name: language === 'sl' ? 'Naslov' : 'Title' }),
      ).toHaveAttribute('aria-invalid', 'true');
      expect((await axe(baseElement)).violations).toEqual([]);
    },
  );
});
