import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { EmptyState } from './EmptyState';
import { FieldLabel } from './FieldLabel';
import { FirstRunIllustration } from './illustrations';
import { LoadingState } from './Skeleton';

// Prazna stanja, nalaganje, oznaka neobveznega polja in zapiranje dialoga (FR-020-24, -25, -27).

describe('prazna stanja in pomočniki', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-020-24: prazno stanje ima naslov, stavek, dovoljeno dejanje in skrito ilustracijo; axe brez kršitev', async () => {
    const { container } = render(
      <main>
        <EmptyState
          centered
          illustration={<FirstRunIllustration />}
          title="Nimaš še nobene skupine."
          text="Ustvari prvo skupino."
          action={<button type="button">Nova skupina</button>}
        />
      </main>,
    );

    expect(screen.getByRole('heading', { name: 'Nimaš še nobene skupine.' })).toBeVisible();
    expect(screen.getByText('Ustvari prvo skupino.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nova skupina' })).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-020-24: VIEWER oziroma arhivirana skupina dejanja ne dobita (action = null)', () => {
    render(<EmptyState headingLevel={3} title="Ta skupina še nima kontaktov." action={null} />);

    expect(screen.getByRole('heading', { level: 3 })).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('FR-020-25: nalaganje je skelet (aria-hidden) z besedilom za bralnik zaslona', () => {
    const { container } = render(<LoadingState label="Nalagam …" />);

    expect(screen.getByRole('status')).toHaveTextContent('Nalagam …');
    container.querySelectorAll('.k-skeleton').forEach((s) => {
      expect(s).toHaveAttribute('aria-hidden', 'true');
    });
    expect(container.querySelectorAll('.k-skeleton').length).toBeGreaterThan(0);
  });

  it('FR-020-26: oznaka »(neobvezno)« je zunaj dostopnega imena polja', () => {
    render(
      <>
        <FieldLabel htmlFor="f" optional>
          Telefon
        </FieldLabel>
        <input id="f" />
      </>,
    );

    expect(screen.getByLabelText('Telefon')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Telefon' })).toBeVisible();
    expect(screen.getByText('(neobvezno)')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dialog ima gumb X »Zapri dialog«, ki ga zapre', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Naslov</DialogTitle>
          <button type="button">Prekliči</button>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Zapri dialog' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Prekliči' })).toBeVisible();
  });
});
