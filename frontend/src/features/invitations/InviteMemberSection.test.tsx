import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail } from '../../test/groupsApi';
import { type Reply, renderInvitationsApp } from '../../test/invitationsApi';
import type { Role } from '../groups/types';

// Razdelek *Povabi člana* v *Nastavitvah* skupine (FR-006-01 … FR-006-04; plan.md – Key elements; design.md 9.7).

const PATH = `/groups/${GROUP_ID}/settings`;

function render(
  options: {
    role?: Role;
    archived?: boolean;
    send?: (groupId: string, body: unknown) => Reply | Promise<Reply>;
    get?: () => Reply;
  } = {},
) {
  return renderInvitationsApp(
    PATH,
    { send: options.send },
    {
      get:
        options.get ??
        (() => ({
          status: 200,
          body: groupDetail({ role: options.role ?? 'ADMIN', archived: options.archived ?? false }),
        })),
    },
  );
}

async function section() {
  return within(await screen.findByRole('region', { name: 'Povabi člana' }));
}

async function loaded() {
  await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
}

describe('InviteMemberSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  describe('prikaz', () => {
    it('FR-006-01: admin nearhivirane skupine vidi polje, vlogi Urednik in Bralec (brez Admin) in gumb', async () => {
      render({ role: 'ADMIN' });

      const form = await section();
      expect(form.getByRole('textbox', { name: 'E-naslov' })).toBeRequired();
      const roles = form.getByRole('radiogroup', { name: 'Vloga' });
      expect(within(roles).getByRole('radio', { name: 'Urednik' })).not.toBeChecked();
      expect(within(roles).getByRole('radio', { name: 'Bralec' })).not.toBeChecked();
      expect(within(roles).queryByRole('radio', { name: 'Admin' })).not.toBeInTheDocument();
      expect(within(roles).queryByRole('radio', { name: 'Lastnik' })).not.toBeInTheDocument();
      expect(form.getByRole('button', { name: 'Pošlji povabilo' })).toBeInTheDocument();
    });

    it('FR-006-01: lastnik vidi vloge Admin, Urednik in Bralec', async () => {
      render({ role: 'OWNER' });

      const roles = (await section()).getByRole('radiogroup', { name: 'Vloga' });
      expect(
        within(roles)
          .getAllByRole('radio')
          .map((r) => (r as HTMLInputElement).labels?.[0]?.textContent),
      ).toEqual(['Admin', 'Urednik', 'Bralec']);
    });

    it.each([
      ['EDITOR', false],
      ['VIEWER', false],
      ['ADMIN', true],
      ['OWNER', true],
    ] as [Role, boolean][])(
      'FR-006-01: %s (arhivirana: %s) razdelka Povabi člana ne vidi',
      async (role, archived) => {
        render({ role, archived });

        await loaded();
        expect(screen.queryByRole('region', { name: 'Povabi člana' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Pošlji povabilo' })).not.toBeInTheDocument();
      },
    );
  });

  describe('preverjanje pred pošiljanjem', () => {
    it('FR-006-03: prazen e-naslov in brez vloge – napaki ob polju brez zahtevka', async () => {
      const { user, invitations } = render();
      const form = await section();

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

      const email = form.getByRole('textbox', { name: 'E-naslov' });
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(email).toHaveAccessibleDescription('Vpiši e-naslov.');
      expect(form.getByRole('radiogroup', { name: 'Vloga' })).toHaveAccessibleDescription(
        'Izberi vlogo.',
      );
      expect(invitations.of('POST', `/api/groups/${GROUP_ID}/invitations`)).toHaveLength(0);
    });

    it('FR-006-03: neveljaven e-naslov in predolg e-naslov', async () => {
      const { user, invitations } = render();
      const form = await section();
      const email = form.getByRole('textbox', { name: 'E-naslov' });
      await user.click(form.getByRole('radio', { name: 'Urednik' }));

      await user.type(email, 'ana@');
      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));
      expect(email).toHaveAccessibleDescription('Vpiši veljaven e-naslov.');

      await user.clear(email);
      await user.click(email);
      await user.paste(`${'a'.repeat(250)}@p.si`);
      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));
      expect(email).toHaveAccessibleDescription('E-naslov je predolg (največ 254 znakov).');
      expect(invitations.of('POST', `/api/groups/${GROUP_ID}/invitations`)).toHaveLength(0);
    });
  });

  describe('angleška besedila preverjanja', () => {
    it('FR-006-03: prazno, neveljavno, predolgo in brez vloge – angleška besedila ob poljih', async () => {
      await i18n.changeLanguage('en');
      const { user } = render();
      const form = within(await screen.findByRole('region', { name: 'Invite a member' }));
      const email = form.getByRole('textbox', { name: 'Email' });
      const send = form.getByRole('button', { name: 'Send invitation' });

      await user.click(send);
      expect(email).toHaveAccessibleDescription('Enter an email address.');
      expect(form.getByRole('radiogroup', { name: 'Role' })).toHaveAccessibleDescription(
        'Choose a role.',
      );
      await user.type(email, 'ana@');
      await user.click(send);
      expect(email).toHaveAccessibleDescription('Enter a valid email address.');
      await user.clear(email);
      await user.click(email);
      await user.paste(`${'a'.repeat(250)}@p.si`);
      await user.click(send);
      expect(email).toHaveAccessibleDescription(
        'The email address is too long (at most 254 characters).',
      );
    });
  });

  describe('pošiljanje', () => {
    it('FR-006-02 FR-006-04: veljaven obrazec – POST, obvestilo, prazno polje, brez izbrane vloge, fokus na e-naslovu', async () => {
      const { user, invitations } = render({ role: 'OWNER' });
      const form = await section();
      const email = form.getByRole('textbox', { name: 'E-naslov' });
      await user.type(email, 'ana@primer.si');
      await user.click(form.getByRole('radio', { name: 'Admin' }));

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Obvestila' })).toHaveTextContent(
          'Povabilo je poslano.',
        ),
      );
      const posts = invitations.of('POST', `/api/groups/${GROUP_ID}/invitations`);
      expect(posts).toHaveLength(1);
      expect(posts[0]!.body).toEqual({ email: 'ana@primer.si', role: 'ADMIN' });
      await waitFor(() => expect(email).toHaveValue(''));
      for (const radio of form.getAllByRole('radio')) expect(radio).not.toBeChecked();
      await waitFor(() => expect(email).toHaveFocus());
    });

    it.each([
      [
        'INVITEE_NOT_REGISTERED',
        'Uporabnik s tem e-naslovom ni registriran.',
        'No registered user has this email address.',
      ],
      [
        'ALREADY_MEMBER',
        'Ta uporabnik je že član skupine.',
        'This user is already a member of the group.',
      ],
      [
        'INVITATION_ALREADY_PENDING',
        'Ta uporabnik že ima povabilo v to skupino.',
        'This user already has an invitation to this group.',
      ],
      ['CANNOT_INVITE_SELF', 'Sebe ne moreš povabiti.', 'You cannot invite yourself.'],
    ])('FR-006-03: 409 %s – besedilo ob polju v sl in en, brez kode', async (code, sl, en) => {
      for (const language of ['sl', 'en'] as const) {
        await i18n.changeLanguage(language);
        const { user, unmount } = render({
          send: () => ({ status: 409, body: { code } }),
        });
        const form = within(
          await screen.findByRole('region', {
            name: language === 'sl' ? 'Povabi člana' : 'Invite a member',
          }),
        );
        await user.type(
          form.getByRole('textbox', { name: language === 'sl' ? 'E-naslov' : 'Email' }),
          'ana@primer.si',
        );
        await user.click(
          form.getByRole('radio', { name: language === 'sl' ? 'Urednik' : 'Editor' }),
        );
        await user.click(
          form.getByRole('button', {
            name: language === 'sl' ? 'Pošlji povabilo' : 'Send invitation',
          }),
        );

        const email = form.getByRole('textbox', { name: language === 'sl' ? 'E-naslov' : 'Email' });
        await waitFor(() => expect(email).toHaveAccessibleDescription(language === 'sl' ? sl : en));
        expect(email).toHaveAttribute('aria-invalid', 'true');
        expect(
          form.getByRole('textbox', { name: language === 'sl' ? 'E-naslov' : 'Email' }),
        ).not.toHaveAccessibleDescription(code);
        unmount();
      }
    });

    it('FR-006-03: 400 s polji strežnika – besedila ob poljih', async () => {
      const { user } = render({
        send: () => ({
          status: 400,
          body: {
            code: 'VALIDATION_FAILED',
            errors: [
              { field: 'email', code: 'INVALID_VALUE' },
              { field: 'role', code: 'REQUIRED' },
            ],
          },
        }),
      });
      const form = await section();
      await user.type(form.getByRole('textbox', { name: 'E-naslov' }), 'ana@primer.si');
      await user.click(form.getByRole('radio', { name: 'Bralec' }));

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

      await waitFor(() =>
        expect(form.getByRole('textbox', { name: 'E-naslov' })).toHaveAccessibleDescription(
          'Vpiši veljaven e-naslov.',
        ),
      );
      expect(form.getByRole('radiogroup', { name: 'Vloga' })).toHaveAccessibleDescription(
        'Izberi vlogo.',
      );
    });

    it('FR-006-02: 403 – alert »Za to dejanje nimaš več pravic.«', async () => {
      const { user } = render({ send: () => ({ status: 403, body: { code: 'FORBIDDEN' } }) });
      const form = await section();
      await user.type(form.getByRole('textbox', { name: 'E-naslov' }), 'ana@primer.si');
      await user.click(form.getByRole('radio', { name: 'Bralec' }));

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Za to dejanje nimaš več pravic.');
    });

    it('FR-006-04: 409 GROUP_ARCHIVED – alert, ponovno branje skupine in razdelek izgine', async () => {
      let reads = 0;
      const { user } = render({
        send: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
        get: () => {
          reads += 1;
          return {
            status: 200,
            body: groupDetail({ role: 'ADMIN', archived: reads > 1 }),
          };
        },
      });
      const form = await section();
      await user.type(form.getByRole('textbox', { name: 'E-naslov' }), 'ana@primer.si');
      await user.click(form.getByRole('radio', { name: 'Bralec' }));

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Skupina je medtem postala arhivirana, zato povabil ni več mogoče pošiljati.',
      );
      await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Povabi člana' })).not.toBeInTheDocument(),
      );
      expect(reads).toBeGreaterThan(1);
    });

    it('FR-006-02: 500 in brez povezave – alert brez kod', async () => {
      let reply: Reply = { status: 500, body: { code: 'INTERNAL' } };
      const { user } = render({ send: () => reply });
      const form = await section();
      await user.type(form.getByRole('textbox', { name: 'E-naslov' }), 'ana@primer.si');
      await user.click(form.getByRole('radio', { name: 'Bralec' }));

      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));
      const failed = await screen.findByRole('alert');
      expect(failed).toHaveTextContent('Povabila ni bilo mogoče poslati. Poskusi znova.');
      expect(failed).not.toHaveTextContent('INTERNAL');

      reply = 'network-error';
      await user.click(form.getByRole('button', { name: 'Pošlji povabilo' }));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Ni povezave. Preveri povezavo in poskusi znova.',
        ),
      );
    });
  });

  it.each(['sl', 'en'])('FR-006-01: brez kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = render({ role: 'OWNER' });

    await screen.findByRole('region', {
      name: language === 'sl' ? 'Povabi člana' : 'Invite a member',
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
