import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { imageText } from '../../test/imagesApi';
import { RemoveImageDialog } from '../images/RemoveImageDialog';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './dialog';

// Dialogi po Kartoteki v2 (FR-020-22, FR-020-23, FR-020-27): začetni fokus, spodnja ploskev pod 640 px, Esc, axe.

describe('dialogi', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-020-23: nevarni dialog – naslov, telo, fokus na Prekliči, Esc zapre brez dejanja', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<RemoveImageDialog open onClose={onClose} onConfirm={onConfirm} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(imageText('images.removeDialog.title'));
    expect(
      screen.getByRole('button', { name: imageText('images.removeDialog.cancel') }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: imageText('images.removeDialog.confirm') }),
    ).toBeVisible();
    expect((await axe(document.body)).violations).toEqual([]);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('FR-020-22: pod 640 px je dialog spodnja ploskev čez celo širino, od 640 px sredinski z omejeno širino', () => {
    render(
      <Dialog open>
        <DialogContent wide>
          <DialogTitle>Naslov</DialogTitle>
          <DialogClose>Zapri</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const classes = dialog.className.split(/\s+/);
    // Telefon: pritrjen na spodnji rob, čez celo širino, zaobljena zgornja robova.
    expect(classes).toEqual(
      expect.arrayContaining(['bottom-0', 'left-0', 'w-full', 'rounded-t-lg']),
    );
    // Od 640 px: sredinski, obrazci do 560 px.
    expect(classes).toEqual(
      expect.arrayContaining(['sm:top-1/2', 'sm:left-1/2', 'sm:max-w-[560px]', 'sm:rounded-lg']),
    );
  });

  it('FR-020-23: Esc zapre dialog z obrazcem; axe brez kršitev', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Naslov</DialogTitle>
          <DialogClose>Prekliči</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    expect((await axe(document.body)).violations).toEqual([]);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
