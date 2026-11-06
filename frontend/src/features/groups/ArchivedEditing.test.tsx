import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, renderGroupsApp } from '../../test/groupsApi';

// Urejanje podatkov skupine, ki je medtem postala arhivirana (FR-003-04; plan.md – Key elements; design.md 8.13).

const PATH = `/groups/${GROUP_ID}/settings`;

describe('urejanje v arhivirani skupini', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-003-04: 409 GROUP_ARCHIVED ob shranjevanju – sporočilo, ponovno branje in način samo za branje', async () => {
    let reads = 0;
    const { user, api } = renderGroupsApp(PATH, {
      get: () => {
        reads += 1;
        return { status: 200, body: groupDetail({ role: 'ADMIN', archived: reads > 1 }) };
      },
      update: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
    });
    const form = await screen.findByRole('form', { name: 'Podatki skupine' });
    await user.type(within(form).getByRole('textbox', { name: 'Naslov' }), ' 2');

    await user.click(within(form).getByRole('button', { name: 'Shrani spremembe' }));

    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skupina je medtem postala arhivirana, zato je ni več mogoče urejati.',
    );
    expect(screen.getAllByRole('term')).toHaveLength(3);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Stanje skupine' })).toBeInTheDocument();
    expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(1);
    expect(reads).toBeGreaterThan(1);
  });

  it('FR-003-04: lastnik arhivirane skupine ob prvem nalaganju ne vidi obrazca', async () => {
    renderGroupsApp(PATH, {
      get: () => ({ status: 200, body: groupDetail({ role: 'OWNER', archived: true }) }),
    });

    await screen.findByRole('heading', { level: 2, name: 'Podatki skupine' });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shrani spremembe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Arhiviraj skupino' })).not.toBeInTheDocument();
  });

  it.each(['sl', 'en'])('FR-003-04: brez kršitev axe po zavrnitvi (%s)', async (language) => {
    await i18n.changeLanguage(language);
    let reads = 0;
    const { user, container } = renderGroupsApp(PATH, {
      get: () => {
        reads += 1;
        return { status: 200, body: groupDetail({ role: 'ADMIN', archived: reads > 1 }) };
      },
      update: () => ({ status: 409, body: { code: 'GROUP_ARCHIVED' } }),
    });
    const form = await screen.findByRole('form');
    await user.click(
      within(form).getByRole('button', {
        name: language === 'sl' ? 'Shrani spremembe' : 'Save changes',
      }),
    );

    await screen.findByRole('alert');
    expect((await axe(container)).violations).toEqual([]);
  });
});
