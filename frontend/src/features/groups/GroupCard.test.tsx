import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GroupCard } from './GroupCard';
import type { GroupEntry } from './useGroupList';

// Kartica skupine (FR-020-10, -13; design.md 8.5, 8.17a).

const GROUP: GroupEntry = {
  id: 'g-1',
  title: 'Projekt FERI',
  description: 'Kontakti semestrskega projekta',
  color: 'mah',
  contactCount: 128,
  role: 'EDITOR',
};

const renderCard = (group: GroupEntry, archived = false) =>
  render(
    <MemoryRouter>
      <ul>
        <GroupCard group={group} archived={archived} />
      </ul>
    </MemoryRouter>,
  );

describe('GroupCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-020-10: naziv je povezava na skupino, opis, število kontaktov in vloga z »Vloga:«', () => {
    renderCard(GROUP);

    const item = screen.getByRole('listitem');
    expect(within(item).getByRole('link')).toHaveAccessibleName('Projekt FERI');
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/groups/g-1');
    expect(item).toHaveTextContent('Kontakti semestrskega projekta');
    expect(item).toHaveTextContent('128 kontaktov');
    expect(item).toHaveTextContent('Vloga: Urednik');
    expect(item).not.toHaveTextContent('Arhivirana');
  });

  it('FR-020-10: skupina brez opisa pokaže »Brez opisa«, dolg naziv je še vedno ena povezava', () => {
    const title = 'Zelo dolg naziv skupine '.repeat(4).trim();
    renderCard({ ...GROUP, title, description: null });

    expect(screen.getByText('Brez opisa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
  });

  it('FR-020-13: arhivirana skupina ima značko, trajno arhivirana še opombo o lastniku', () => {
    renderCard({ ...GROUP, permanentlyArchived: true }, true);

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Trajno arhivirana');
    expect(item).toHaveTextContent('lastnik: izbrisan uporabnik');
  });

  it.each(['sl', 'en'])('FR-020-10: kartica nima kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = renderCard({ ...GROUP, permanentlyArchived: false }, true);

    expect((await axe(container)).violations).toEqual([]);
  });
});
