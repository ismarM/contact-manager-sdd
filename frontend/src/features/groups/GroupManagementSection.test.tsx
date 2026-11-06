import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, renderGroupsApp } from '../../test/groupsApi';
import type { GroupDetail } from './types';

// *Nastavitve → Upravljanje skupine*: arhiviranje, odarhiviranje in izbris skupine z dialogoma (FR-003-01, -04, -06,
// -08 … -11; plan.md – Key elements; design.md 8.11, 9.7).

const PATH = `/groups/${GROUP_ID}/settings`;
const DELETE_INFO = 'Skupino lahko izbrišeš, ko si njen edini član.';

function render(
  detail: Partial<GroupDetail>,
  handlers: Parameters<typeof renderGroupsApp>[1] = {},
) {
  return renderGroupsApp(PATH, {
    get: () => ({ status: 200, body: groupDetail(detail) }),
    ...handlers,
  });
}

async function expectNotice(text: string) {
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(text),
  );
}

async function management() {
  return screen.findByRole('heading', { level: 2, name: 'Upravljanje skupine' });
}

describe('GroupManagementSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  describe('arhiviranje', () => {
    it('FR-003-01: lastnik nearhivirane skupine vidi Arhiviraj skupino z razlago, brez Odarhiviraj', async () => {
      render({ role: 'OWNER' });

      await management();
      expect(screen.getByRole('button', { name: 'Arhiviraj skupino' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Upravljanje skupine' })).toHaveTextContent(
        'Člani ohranijo dostop, skupina pa postane samo za branje.',
      );
      expect(screen.queryByRole('button', { name: 'Odarhiviraj skupino' })).not.toBeInTheDocument();
    });

    it('FR-003-01: dialog – vprašanje s predmetom, posledice, fokus na Prekliči', async () => {
      const { user } = render({ role: 'OWNER' });
      await management();

      await user.click(screen.getByRole('button', { name: 'Arhiviraj skupino' }));

      const dialog = await screen.findByRole('dialog', { name: 'Arhiviram skupino Projekt FERI?' });
      expect(dialog).toHaveTextContent(
        'Člani ohranijo dostop, skupina pa bo samo za branje. Odarhivirati jo lahko samo lastnik.',
      );
      expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
      expect(within(dialog).getByRole('button', { name: 'Arhiviraj skupino' })).toBeInTheDocument();
    });

    it('FR-003-01: Prekliči in Esc zapreta dialog brez zahtevka, fokus se vrne na sprožilec', async () => {
      const { user, api } = render({ role: 'OWNER' });
      await management();
      const trigger = screen.getByRole('button', { name: 'Arhiviraj skupino' });

      await user.click(trigger);
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Prekliči' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();

      await user.click(trigger);
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
      expect(api.of('POST', `/api/groups/${GROUP_ID}/archive`)).toHaveLength(0);
    });

    it('FR-003-01 FR-003-04 FR-003-05: potrditev – zahtevek, obvestilo, pasica in oznaka, brez obrazca', async () => {
      const { user, api } = render(
        { role: 'OWNER' },
        {
          archive: (id) => ({
            status: 200,
            body: groupDetail({ id, role: 'OWNER', archived: true }),
          }),
        },
      );
      await management();
      await screen.findByRole('form', { name: 'Podatki skupine' });

      await user.click(screen.getByRole('button', { name: 'Arhiviraj skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Arhiviraj skupino' }));

      expect(await screen.findByRole('region', { name: 'Stanje skupine' })).toBeInTheDocument();
      expect(api.of('POST', `/api/groups/${GROUP_ID}/archive`)).toHaveLength(1);
      await expectNotice('Skupina je arhivirana.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Arhiviraj skupino' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Odarhiviraj skupino' }).length).toBeGreaterThan(
        0,
      );
    });

    it.each([
      ['strežnik ne uspe', { status: 500 }, 'Skupine ni bilo mogoče arhivirati. Poskusi znova.'],
      ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
      [
        'vloga ni več dovolj',
        { status: 403, body: { code: 'FORBIDDEN' } },
        'Za to dejanje nimaš več pravic.',
      ],
    ])(
      'FR-003-01: %s – opozorilo brez kod, skupina ostane nearhivirana',
      async (_name, reply, message) => {
        const { user } = render({ role: 'OWNER' }, { archive: () => reply });
        await management();
        await user.click(screen.getByRole('button', { name: 'Arhiviraj skupino' }));
        await user.click(
          within(await screen.findByRole('dialog')).getByRole('button', {
            name: 'Arhiviraj skupino',
          }),
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(message);
        expect(alert.textContent).not.toMatch(/GROUP_|FORBIDDEN|\b\d{3}\b/);
        expect(screen.queryByRole('region', { name: 'Stanje skupine' })).not.toBeInTheDocument();
      },
    );

    it('FR-003-01: 409 GROUP_ARCHIVED (že arhivirana) – stanje se ponovno prebere', async () => {
      let reads = 0;
      const { user } = render(
        { role: 'OWNER' },
        {
          get: () => {
            reads += 1;
            return { status: 200, body: groupDetail({ role: 'OWNER', archived: reads > 1 }) };
          },
          archive: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
        },
      );
      await management();
      await user.click(screen.getByRole('button', { name: 'Arhiviraj skupino' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Arhiviraj skupino',
        }),
      );

      expect(await screen.findByRole('region', { name: 'Stanje skupine' })).toBeInTheDocument();
    });

    it.each(['ADMIN', 'EDITOR', 'VIEWER'] as const)(
      'FR-003-01: %s nearhivirane skupine ne vidi razdelka Upravljanje skupine',
      async (role) => {
        render({ role });

        await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
        expect(
          screen.queryByRole('heading', { level: 2, name: 'Upravljanje skupine' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Arhiviraj skupino' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Izbriši skupino' })).not.toBeInTheDocument();
      },
    );
  });

  describe('odarhiviranje', () => {
    it('FR-003-04 FR-003-06: lastnik arhivirane skupine – Odarhiviraj skupino z razlago, brez Arhiviraj; lastnik z drugimi člani – razlaga namesto Izbriši', async () => {
      render({ role: 'OWNER', archived: true, canDelete: false });

      await management();
      const section = screen.getByRole('region', { name: 'Upravljanje skupine' });
      expect(
        within(section).getByRole('button', { name: 'Odarhiviraj skupino' }),
      ).toBeInTheDocument();
      expect(section).toHaveTextContent('Skupina bo spet delovala kot pred arhiviranjem.');
      expect(screen.queryByRole('button', { name: 'Arhiviraj skupino' })).not.toBeInTheDocument();
      expect(
        within(section).queryByRole('button', { name: 'Izbriši skupino' }),
      ).not.toBeInTheDocument();
      expect(section).toHaveTextContent(DELETE_INFO);
    });

    it('FR-003-04 FR-003-09: lastnik arhivirane skupine, ki je edini član, vidi Izbriši skupino', async () => {
      render({ role: 'OWNER', archived: true, canDelete: true });

      await management();
      const section = screen.getByRole('region', { name: 'Upravljanje skupine' });
      expect(within(section).getByRole('button', { name: 'Izbriši skupino' })).toBeInTheDocument();
      expect(
        within(section).getByRole('button', { name: 'Odarhiviraj skupino' }),
      ).toBeInTheDocument();
      expect(section).not.toHaveTextContent(DELETE_INFO);
    });

    it('FR-003-09: edini član, ki je skupino ravnokar arhiviral, jo lahko takoj izbriše', async () => {
      const { user } = render(
        { role: 'OWNER', canDelete: true },
        {
          archive: (id) => ({
            status: 200,
            body: groupDetail({ id, role: 'OWNER', archived: true, canDelete: true }),
          }),
        },
      );
      await management();
      await user.click(screen.getByRole('button', { name: 'Arhiviraj skupino' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Arhiviraj skupino',
        }),
      );
      await screen.findByRole('region', { name: 'Stanje skupine' });

      await user.click(await screen.findByRole('button', { name: 'Izbriši skupino' }));

      expect(
        await screen.findByRole('dialog', { name: 'Izbrišem skupino Projekt FERI?' }),
      ).toBeInTheDocument();
    });

    it('FR-003-06: Odarhiviraj skupino iz razdelka – brez dialoga, zahtevek in obvestilo', async () => {
      const { user, api } = render(
        { role: 'OWNER', archived: true },
        { unarchive: (id) => ({ status: 200, body: groupDetail({ id, role: 'OWNER' }) }) },
      );
      await management();
      const section = screen.getByRole('region', { name: 'Upravljanje skupine' });

      await user.click(within(section).getByRole('button', { name: 'Odarhiviraj skupino' }));

      await expectNotice('Skupina je odarhivirana.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(api.of('POST', `/api/groups/${GROUP_ID}/unarchive`)).toHaveLength(1);
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Stanje skupine' })).not.toBeInTheDocument(),
      );
      expect(await screen.findByRole('button', { name: 'Arhiviraj skupino' })).toBeInTheDocument();
    });

    it('FR-003-06: neuspeh odarhiviranja – opozorilo, skupina ostane arhivirana', async () => {
      const { user } = render(
        { role: 'OWNER', archived: true },
        { unarchive: () => ({ status: 500 }) },
      );
      await management();
      const section = screen.getByRole('region', { name: 'Upravljanje skupine' });

      await user.click(within(section).getByRole('button', { name: 'Odarhiviraj skupino' }));

      expect(await within(section).findByRole('alert')).toHaveTextContent(
        'Skupine ni bilo mogoče odarhivirati. Poskusi znova.',
      );
      expect(screen.getByRole('region', { name: 'Stanje skupine' })).toBeInTheDocument();
    });
  });

  describe('izbris', () => {
    it('FR-003-10: lastnik z več člani – brez gumba Izbriši skupino, razlaga namesto njega', async () => {
      render({ role: 'OWNER', canDelete: false });

      await management();
      expect(screen.queryByRole('button', { name: 'Izbriši skupino' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Upravljanje skupine' })).toHaveTextContent(
        DELETE_INFO,
      );
    });

    it('FR-003-10: edini član – dialog z besedilom posledic, poljem za naslov in fokusom na Prekliči', async () => {
      const { user } = render({ role: 'OWNER', canDelete: true });
      await management();

      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));

      const dialog = await screen.findByRole('dialog', { name: 'Izbrišem skupino Projekt FERI?' });
      expect(dialog).toHaveTextContent(
        'Izbrisani bodo vsi kontakti, revizijska sled in čakajoča povabila skupine. Izbrisa ni mogoče razveljaviti.',
      );
      expect(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Prekliči' })).toHaveFocus();
    });

    it.each(['napačno', 'projekt feri', ''])(
      'FR-003-10: vnos »%s« se ne ujema – napaka ob polju, brez zahtevka',
      async (typed) => {
        const { user, api } = render({ role: 'OWNER', canDelete: true });
        await management();
        await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
        const dialog = await screen.findByRole('dialog');
        const field = within(dialog).getByRole('textbox', {
          name: 'Za potrditev vpiši naslov skupine',
        });
        if (typed) await user.type(field, typed);

        await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(field).toHaveAccessibleDescription(
          'Vpisano besedilo se ne ujema z naslovom skupine.',
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(api.of('DELETE', `/api/groups/${GROUP_ID}`)).toHaveLength(0);
      },
    );

    it('FR-003-09 FR-003-10 FR-003-11: natančen naslov (obrezan presledkov) – izbris, preusmeritev, obvestilo, povzetek osvežen', async () => {
      const { user, api, listRequests } = render({ role: 'OWNER', canDelete: true });
      await management();
      await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(0));
      const before = listRequests(10).length;
      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        '  Projekt FERI  ',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Skupine' })).toBeInTheDocument();
      expect(api.of('DELETE', `/api/groups/${GROUP_ID}`)).toHaveLength(1);
      await expectNotice('Skupina je izbrisana.');
      await waitFor(() => expect(listRequests(10).length).toBeGreaterThan(before));
    });

    it('FR-003-09: izbris v arhivirani skupini je dovoljen', async () => {
      const { user, api } = render({ role: 'OWNER', archived: true, canDelete: true });
      await management();
      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        'Projekt FERI',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

      await waitFor(() => expect(api.of('DELETE', `/api/groups/${GROUP_ID}`)).toHaveLength(1));
    });

    it('FR-003-09: 409 GROUP_HAS_OTHER_MEMBERS – razumljivo sporočilo v dialogu, dialog ostane', async () => {
      const { user } = render(
        { role: 'OWNER', canDelete: true },
        { remove: () => ({ status: 409, body: { code: 'GROUP_HAS_OTHER_MEMBERS' } }) },
      );
      await management();
      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        'Projekt FERI',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent('Skupine ni mogoče izbrisati, ker ima še druge člane.');
      expect(alert.textContent).not.toMatch(/GROUP_/);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it.each([
      ['strežnik ne uspe', { status: 500 }, 'Skupine ni bilo mogoče izbrisati. Poskusi znova.'],
      ['ni povezave', 'network-error' as const, 'Ni povezave. Preveri povezavo in poskusi znova.'],
    ])('FR-003-10: %s – opozorilo v dialogu', async (_name, reply, message) => {
      const { user } = render({ role: 'OWNER', canDelete: true }, { remove: () => reply });
      await management();
      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        'Projekt FERI',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    });

    it('FR-003-11: po izbrisu povezava do skupine vodi na »Te strani ni«', async () => {
      renderGroupsApp(PATH, { get: () => ({ status: 404 }) });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Te strani ni' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Upravljanje skupine' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('trajno arhivirana skupina', () => {
    it.each(['VIEWER', 'EDITOR', 'ADMIN'] as const)(
      'FR-003-08 FR-003-10: %s več članov – razdelek viden, brez Odarhiviraj in Izbriši, z razlago',
      async (role) => {
        render({ role, archived: true, permanentlyArchived: true, canDelete: false });

        await management();
        expect(
          screen.queryByRole('button', { name: 'Odarhiviraj skupino' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Izbriši skupino' })).not.toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Upravljanje skupine' })).toHaveTextContent(
          DELETE_INFO,
        );
      },
    );

    it('FR-003-08 FR-003-09: edini preostali bralec vidi Izbriši skupino in jo izbriše', async () => {
      const { user, api } = render({
        role: 'VIEWER',
        archived: true,
        permanentlyArchived: true,
        canDelete: true,
      });
      await management();
      await user.click(screen.getByRole('button', { name: 'Izbriši skupino' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Za potrditev vpiši naslov skupine' }),
        'Projekt FERI',
      );

      await user.click(within(dialog).getByRole('button', { name: 'Izbriši skupino' }));

      await waitFor(() => expect(api.of('DELETE', `/api/groups/${GROUP_ID}`)).toHaveLength(1));
    });
  });

  describe('dostopnost', () => {
    it.each(['sl', 'en'])(
      'FR-003-01 FR-003-10: brez kršitev axe z odprtima dialogoma (%s)',
      async (language) => {
        await i18n.changeLanguage(language);
        const sl = language === 'sl';
        const { user, container } = render({ role: 'OWNER', canDelete: true });
        await screen.findByRole('heading', {
          level: 2,
          name: sl ? 'Upravljanje skupine' : 'Group management',
        });
        expect((await axe(container)).violations).toEqual([]);

        await user.click(
          screen.getByRole('button', { name: sl ? 'Arhiviraj skupino' : 'Archive group' }),
        );
        await screen.findByRole('dialog');
        expect((await axe(document.body)).violations).toEqual([]);
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        await user.click(
          screen.getByRole('button', { name: sl ? 'Izbriši skupino' : 'Delete group' }),
        );
        const dialog = await screen.findByRole('dialog');
        await user.click(
          within(dialog).getByRole('button', { name: sl ? 'Izbriši skupino' : 'Delete group' }),
        );
        expect((await axe(document.body)).violations).toEqual([]);
      },
    );
  });
});
