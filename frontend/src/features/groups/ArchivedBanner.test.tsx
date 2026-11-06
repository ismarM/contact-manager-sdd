import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, renderGroupsApp } from '../../test/groupsApi';
import type { GroupDetail } from './types';

// Pasica arhivirane skupine in odarhiviranje (FR-003-05, FR-003-06, FR-003-08; plan.md – Key elements; design.md 9.11).

const PATH = `/groups/${GROUP_ID}/settings`;
const ARCHIVED_TEXT = 'Skupina je arhivirana – na voljo so pregled, iskanje in izvoz.';
const PERMANENT_TEXT = 'Skupina je trajno arhivirana, ker lastnik nima več računa.';

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

describe('ArchivedBanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-003-05: nearhivirana skupina nima pasice', async () => {
    render({ role: 'OWNER' });

    await screen.findByRole('heading', { level: 1, name: 'Projekt FERI' });
    expect(screen.queryByRole('region', { name: 'Stanje skupine' })).not.toBeInTheDocument();
  });

  it('FR-003-05: urednik arhivirane skupine vidi pasico brez akcije Odarhiviraj in oznako Arhivirano', async () => {
    render({ role: 'EDITOR', archived: true });

    const banner = await screen.findByRole('region', { name: 'Stanje skupine' });
    expect(banner).toHaveTextContent(ARCHIVED_TEXT);
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Projekt FERI' })).toHaveTextContent('Arhivirano');
  });

  it('FR-003-06: lastnik odarhivira iz pasice – zahtevek, obvestilo, pasica izgine, obrazec se vrne', async () => {
    const { user, api } = render(
      { role: 'OWNER', archived: true },
      {
        unarchive: (id) => ({
          status: 200,
          body: groupDetail({ id, role: 'OWNER', archived: false }),
        }),
      },
    );
    const banner = await screen.findByRole('region', { name: 'Stanje skupine' });

    await user.click(within(banner).getByRole('button', { name: 'Odarhiviraj skupino' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Stanje skupine' })).not.toBeInTheDocument(),
    );
    expect(api.of('POST', `/api/groups/${GROUP_ID}/unarchive`)).toHaveLength(1);
    await expectNotice('Skupina je odarhivirana.');
    expect(await screen.findByRole('form', { name: 'Podatki skupine' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Projekt FERI' })).not.toHaveTextContent(
      'Arhivirano',
    );
  });

  it('FR-003-06: 409 GROUP_NOT_ARCHIVED – stanje skupine se ponovno prebere', async () => {
    let reads = 0;
    const { user } = render(
      { role: 'OWNER', archived: true },
      {
        get: () => {
          reads += 1;
          return { status: 200, body: groupDetail({ role: 'OWNER', archived: reads === 1 }) };
        },
        unarchive: () => ({ status: 409, body: { code: 'GROUP_NOT_ARCHIVED' } }),
      },
    );
    const banner = await screen.findByRole('region', { name: 'Stanje skupine' });

    await user.click(within(banner).getByRole('button', { name: 'Odarhiviraj skupino' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Stanje skupine' })).not.toBeInTheDocument(),
    );
    expect(reads).toBeGreaterThan(1);
  });

  it.each(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const)(
    'FR-003-08: trajno arhivirana skupina (%s) – posebno besedilo brez akcije Odarhiviraj',
    async (role) => {
      render({ role, archived: true, permanentlyArchived: true });

      const banner = await screen.findByRole('region', { name: 'Stanje skupine' });
      expect(banner).toHaveTextContent(PERMANENT_TEXT);
      expect(banner).not.toHaveTextContent(ARCHIVED_TEXT);
      expect(screen.queryByRole('button', { name: 'Odarhiviraj skupino' })).not.toBeInTheDocument();
    },
  );

  it.each([
    ['sl', ARCHIVED_TEXT],
    ['en', 'This group is archived – you can browse, search and export.'],
  ])('FR-003-05: brez kršitev axe (%s)', async (language, text) => {
    await i18n.changeLanguage(language);
    const { container } = render({ role: 'OWNER', archived: true });

    const banner = await screen.findByRole('region', {
      name: language === 'sl' ? 'Stanje skupine' : 'Group status',
    });
    expect(banner).toHaveTextContent(text);
    expect((await axe(container)).violations).toEqual([]);
  });
});
