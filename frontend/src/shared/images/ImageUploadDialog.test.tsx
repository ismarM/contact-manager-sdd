import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ApiError } from '../api/client';
import { imageFile, imageText, stubImageDecoding } from '../../test/imagesApi';
import { ImageUploadDialog } from './ImageUploadDialog';

// Nalaganje slike (FR-018-01, -04, -14): izbira, obrezovanje s tipkovnico, trajne napake po kodah.

function setup(onUpload = vi.fn<(file: Blob) => Promise<void>>().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const view = render(
    <ImageUploadDialog open onClose={onClose} shape="circle" onUpload={onUpload} />,
  );
  return { user, onClose, onUpload, ...view };
}

const choose = (user: ReturnType<typeof userEvent.setup>) =>
  user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
const save = () => screen.findByRole('button', { name: imageText('images.dialog.save') });

describe('ImageUploadDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('izbira datoteke prikaže obrezovalnik; axe brez kršitev', async () => {
    stubImageDecoding();
    const { user } = setup();

    expect((await axe(document.body)).violations).toEqual([]);
    await choose(user);

    expect(
      await screen.findByRole('button', { name: imageText('images.dialog.cropLabel') }),
    ).toHaveFocus();
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('obrezovanje s tipkovnico: puščice, +/−, Home sporočijo spremembo; shranjeno se izvozi in naloži', async () => {
    const decoding = stubImageDecoding({ width: 1600, height: 800 });
    const { user, onUpload } = setup();
    await choose(user);
    await screen.findByRole('button', { name: imageText('images.dialog.cropLabel') });
    const live = screen.getByRole('status');

    await user.keyboard('{ArrowLeft}');
    expect(live).toHaveTextContent(
      imageText('images.dialog.moved', { direction: imageText('images.dialog.left') }),
    );
    await user.keyboard('+');
    const slider = screen.getByRole('slider', { name: imageText('images.dialog.zoom') });
    const zoomed = Number(slider.getAttribute('value'));
    expect(zoomed).toBeGreaterThan(1);
    await user.keyboard('-');
    expect(Number(slider.getAttribute('value'))).toBeLessThan(zoomed);
    await user.keyboard('{Home}');
    expect(live).toHaveTextContent(imageText('images.dialog.reset'));

    await user.click(screen.getByRole('button', { name: imageText('images.dialog.zoomIn') }));
    expect(Number(slider.getAttribute('value'))).toBeGreaterThan(1);

    await user.click(await save());
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(decoding.exports.length).toBeGreaterThan(0);
    expect(onUpload.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  });

  it('obrezovanje: brez premika je izrez sredinski kvadrat, po premiku in povečavi se izrez spremeni', async () => {
    // Slika 1600 × 800: sredinski kvadrat je (sx 400, sy 0, stranica 800).
    const baseline = stubImageDecoding({ width: 1600, height: 800 });
    const first = setup();
    await choose(first.user);
    await first.user.click(await save());
    await waitFor(() => expect(baseline.draws).toHaveLength(1));
    const [bsx, bsy, bside] = baseline.draws[0] ?? [];
    expect([bsx, bsy, bside]).toEqual([400, 0, 800]);
    first.unmount();

    const moved = stubImageDecoding({ width: 1600, height: 800 });
    const second = setup();
    await choose(second.user);
    await screen.findByRole('button', { name: imageText('images.dialog.cropLabel') });
    await second.user.keyboard('+');
    await second.user.keyboard('{ArrowLeft}{ArrowDown}');
    await second.user.click(await save());
    await waitFor(() => expect(moved.draws).toHaveLength(1));
    const [sx, sy, side] = moved.draws[0] ?? [];

    expect(side).toBeLessThan(800);
    // Ni sredinski izrez povečane slike: premik je izrez res zamaknil.
    expect(sx).not.toBe((1600 - (side ?? 0)) / 2);
    expect(sy).not.toBe((800 - (side ?? 0)) / 2);
    expect([sx, sy, side]).not.toEqual([bsx, bsy, bside]);
  });

  it('WebP: dialog sprejme image/webp, naložen blob je JPEG ali PNG (brskalnik jo pretvori)', async () => {
    const decoding = stubImageDecoding();
    const { user, onUpload } = setup();
    const input = screen.getByLabelText(imageText('images.dialog.choose'));
    expect(input.getAttribute('accept')).toContain('image/webp');

    await user.upload(input, imageFile('portret.webp', 'image/webp'));
    await user.click(await save());

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const blob = onUpload.mock.calls[0]?.[0] as Blob;
    expect(['image/jpeg', 'image/png']).toContain(blob.type);
    expect(['image/jpeg', 'image/png']).toContain(decoding.exports.at(-1)?.type);
  });

  it('prosojen vir se izvozi kot PNG', async () => {
    const decoding = stubImageDecoding({ alpha: true });
    const { user } = setup();
    await choose(user);
    await user.click(await save());

    await waitFor(() => expect(decoding.exports.at(-1)?.type).toBe('image/png'));
  });

  it('datoteke, ki je ni mogoče prebrati: INVALID_IMAGE, brez gumba Poskusi znova', async () => {
    stubImageDecoding({ failDecode: true });
    const { user } = setup();

    await choose(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      imageText('images.errors.INVALID_IMAGE'),
    );
    expect(
      screen.queryByRole('button', { name: imageText('images.dialog.retry') }),
    ).not.toBeInTheDocument();
  });

  const failures: [string, ApiError, string][] = [
    [
      'INVALID_IMAGE',
      new ApiError(400, 'VALIDATION_FAILED', {
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'file', code: 'INVALID_IMAGE' }],
      }),
      'INVALID_IMAGE',
    ],
    [
      'IMAGE_TOO_LARGE',
      new ApiError(400, 'VALIDATION_FAILED', {
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'file', code: 'IMAGE_TOO_LARGE' }],
      }),
      'IMAGE_TOO_LARGE',
    ],
    ['FILE_TOO_LARGE (413)', new ApiError(413, 'PAYLOAD_TOO_LARGE'), 'FILE_TOO_LARGE'],
    ['RATE_LIMITED', new ApiError(429, 'RATE_LIMITED'), 'RATE_LIMITED'],
    ['strežniška napaka', new ApiError(500, 'INTERNAL'), 'generic'],
  ];

  it.each(failures)('napaka %s: trajno sporočilo in Poskusi znova', async (_name, error, key) => {
    stubImageDecoding();
    const onUpload = vi
      .fn<(file: Blob) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const { user, onClose } = setup(onUpload);
    await choose(user);

    await user.click(await save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      imageText(`images.errors.${key as 'generic'}`),
    );
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: imageText('images.dialog.retry') }));

    if (key === 'INVALID_IMAGE' || key === 'IMAGE_TOO_LARGE' || key === 'FILE_TOO_LARGE') {
      // Napaka vsebine: ponovitev vrne na izbiro datoteke.
      expect(onUpload).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(imageText('images.dialog.choose'))).toBeInTheDocument();
    } else {
      await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    }
  });
});
