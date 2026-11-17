import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ArchivedBadge, Badge, RoleBadge } from './Badge';
import { Callout } from './Callout';
import { Chip } from './Chip';
import {
  AuthHeroIllustration,
  FirstRunIllustration,
  ImportDoneIllustration,
  NoContactsIllustration,
  NoInvitationsIllustration,
  NoResultsIllustration,
  NotFoundIllustration,
  OfflineIllustration,
} from './illustrations';
import { Monogram } from './Monogram';
import { SegmentedControl } from './SegmentedControl';
import { Skeleton } from './Skeleton';
import {
  dangerButton,
  ghostButton,
  primaryButton,
  secondaryButton,
  softButton,
  textInput,
} from './styles';

// Primitivi v2 (FR-020-01, -22, -24, -25): semantika, dostopna imena in axe v svetli in temni temi.

function Showcase() {
  const [view, setView] = useState<'cards' | 'list'>('cards');
  return (
    <main>
      <h1>Primitivi</h1>
      <button className={primaryButton}>Primarni</button>
      <button className={softButton}>Mehki</button>
      <button className={secondaryButton}>Sekundarni</button>
      <button className={ghostButton}>Tihi</button>
      <button className={dangerButton}>Nevarni</button>
      <label>
        Naslov
        <input className={textInput} />
      </label>
      <Badge>Značka</Badge>
      <RoleBadge value="OWNER" />
      <ArchivedBadge />
      <ArchivedBadge permanent />
      <Chip active onClick={() => undefined} onRemove={() => undefined} name="Alfa">
        Alfa
      </Chip>
      <Chip onClick={() => undefined}>Beta</Chip>
      <Callout tone="error">Napaka</Callout>
      <Callout tone="warning">Opozorilo</Callout>
      <Callout tone="info">Informacija</Callout>
      <Monogram title="Projekt FERI" color="mah" size={48} />
      <SegmentedControl
        label="Pogled"
        value={view}
        onChange={setView}
        segments={[
          { value: 'cards', label: 'Kartice' },
          { value: 'list', label: 'Seznam' },
        ]}
      />
      <Skeleton />
      <FirstRunIllustration />
      <NoContactsIllustration />
      <NoResultsIllustration />
      <NoInvitationsIllustration />
      <ImportDoneIllustration />
      <OfflineIllustration />
      <NotFoundIllustration />
      <AuthHeroIllustration />
    </main>
  );
}

describe('primitivi v2', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it.each(['light', 'dark'] as const)('FR-020-01: axe brez kršitev (%s tema)', async (theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<Showcase />);

    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-020-22: značka vloge ima dostopen napis »Vloga: Lastnik«', () => {
    render(<RoleBadge value="OWNER" />);

    expect(screen.getByText('Lastnik').parentElement).toHaveTextContent('Vloga: Lastnik');
  });

  it('FR-020-22: znački *Arhivirana* in *Trajno arhivirana* imata besedilo in ikono', () => {
    const { container } = render(
      <>
        <ArchivedBadge />
        <ArchivedBadge permanent />
      </>,
    );

    expect(screen.getByText('Arhivirana')).toBeInTheDocument();
    expect(screen.getByText('Trajno arhivirana')).toBeInTheDocument();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('FR-020-22: aktiven čip ima gumb »Odstrani filter …«, čip vloge ga nima', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <>
        <Chip active onClick={() => undefined} onRemove={onRemove} name="Alfa">
          Alfa
        </Chip>
        <Chip active onClick={() => undefined}>
          Lastnik
        </Chip>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Odstrani filter Alfa' }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Odstrani filter/ })).toHaveLength(1);
  });

  it('FR-020-22: napaka je role=alert, opozorilo in informacija role=status; vedno z ikono', () => {
    const { container } = render(
      <>
        <Callout tone="error">Napaka</Callout>
        <Callout tone="warning">Opozorilo</Callout>
        <Callout tone="info">Info</Callout>
      </>,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
    expect(container.innerHTML).not.toMatch(/border-l-/);
  });

  it('FR-020-22: segmentni gumb je skupina izbirnih gumbov in izbira z miško', async () => {
    const user = userEvent.setup();
    render(<Showcase />);
    const group = screen.getByRole('radiogroup', { name: 'Pogled' });
    expect(screen.getByRole('radio', { name: 'Kartice' })).toBeChecked();

    await user.click(screen.getByText('Seznam'));

    expect(screen.getByRole('radio', { name: 'Seznam' })).toBeChecked();
    expect(group).toContainElement(screen.getByRole('radio', { name: 'Seznam' }));
  });

  it('FR-020-22: monogram je okras z začetnicama', () => {
    const { container } = render(<Monogram title="Projekt FERI" color="mah" size={48} />);

    const tile = container.firstElementChild;
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).toHaveTextContent('PF');
  });

  it('FR-020-04: skelet je okras (aria-hidden) z mirnim utripanjem', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveClass('k-skeleton');
  });

  it('FR-020-24: ilustracije so okras (aria-hidden), brez rastrskih slik in omrežja', () => {
    const { container } = render(
      <>
        <FirstRunIllustration />
        <NoContactsIllustration />
        <NoResultsIllustration />
        <NoInvitationsIllustration />
        <ImportDoneIllustration />
        <OfflineIllustration />
        <NotFoundIllustration />
        <AuthHeroIllustration />
      </>,
    );

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(8);
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.querySelector('image, linearGradient, radialGradient, filter')).toBeNull();
    });
  });
});
