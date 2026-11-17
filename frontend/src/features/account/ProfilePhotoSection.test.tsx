import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import {
  imageFile,
  imageReplies,
  imageText,
  mockImagesApi,
  stubImageDecoding,
  trackBlobUrls,
} from '../../test/imagesApi';
import { ANA_PROFILE, mockProfileApi, renderApp } from '../../test/renderApp';

// Razdelek *Profilna slika* (FR-018-01, -02, -04, -20): nalaganje, zamenjava, odstranitev, slika Google računa.

function renderAccount(options: {
  photoRevision?: number | null;
  googlePhoto?: boolean;
  images?: Parameters<typeof mockImagesApi>[0];
}) {
  mockProfileApi({ profile: { ...ANA_PROFILE, photoRevision: options.photoRevision ?? null } });
  const images = mockImagesApi(options.images);
  const gateway = createAuthFake({ user: { ...ANA, hasPhotoUrl: options.googlePhoto ?? false } });
  return { ...renderApp('/account', { gateway }), images };
}

const section = () => screen.findByRole('region', { name: imageText('images.profile.heading') });

describe('ProfilePhotoSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    trackBlobUrls();
  });

  it('brez slike: začetnice in samo »Naloži sliko«; zahtevka za sliko ni', async () => {
    const { images, container } = renderAccount({});

    const region = await section();
    expect(within(region).getByRole('button', { name: imageText('images.upload') })).toBeVisible();
    expect(
      within(region).queryByRole('button', { name: imageText('images.remove') }),
    ).not.toBeInTheDocument();
    expect(images.reads()).toHaveLength(0);
    expect((await axe(container)).violations).toEqual([]);
  });

  it('naložitev: avatar dobi novo revizijo, na voljo sta zamenjava in odstranitev', async () => {
    stubImageDecoding();
    const { user, images } = renderAccount({ images: { upload: imageReplies.result(3) } });

    const region = await section();
    await user.click(within(region).getByRole('button', { name: imageText('images.upload') }));
    await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
    await user.click(await screen.findByRole('button', { name: imageText('images.dialog.save') }));

    expect(await screen.findByText(imageText('images.profile.uploaded'))).toBeInTheDocument();
    expect(images.uploads()[0]?.upload?.version).toBeNull();
    expect(
      await within(await section()).findByRole('button', { name: imageText('images.replace') }),
    ).toBeVisible();
    await waitFor(() =>
      expect(images.reads().some((read) => read.search.get('v') === '3')).toBe(true),
    );
  });

  it('odstranitev s potrditvijo: začetnice in sporočilo', async () => {
    const { user, images } = renderAccount({ photoRevision: 2 });

    const region = await section();
    await user.click(within(region).getByRole('button', { name: imageText('images.remove') }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: imageText('images.removeDialog.confirm'),
      }),
    );

    expect(await screen.findByText(imageText('images.profile.removed'))).toBeInTheDocument();
    expect(images.removals()).toHaveLength(1);
    expect(
      within(await section()).queryByRole('button', { name: imageText('images.remove') }),
    ).not.toBeInTheDocument();
  });

  it('gumb za sliko Google računa je skrit, kadar račun nima slike', async () => {
    renderAccount({ googlePhoto: false });

    await section();
    expect(
      screen.queryByRole('button', { name: imageText('images.google.use') }),
    ).not.toBeInTheDocument();
  });

  it('slika Google računa: POST brez telesa, nova revizija in sporočilo', async () => {
    const { user, images } = renderAccount({
      googlePhoto: true,
      images: { google: imageReplies.result(5) },
    });

    await user.click(await screen.findByRole('button', { name: imageText('images.google.use') }));

    expect(await screen.findByText(imageText('images.google.done'))).toBeInTheDocument();
    const post = images.requests.find((request) => request.method === 'POST');
    expect(post?.path).toBe('/api/me/photo/google');
    expect(post?.search.size).toBe(0);
    await waitFor(() =>
      expect(images.reads().some((read) => read.search.get('v') === '5')).toBe(true),
    );
  });

  it('GOOGLE_PHOTO_UNAVAILABLE: razumljiva napaka, slika ostane', async () => {
    const { user } = renderAccount({
      googlePhoto: true,
      photoRevision: 2,
      images: { google: imageReplies.googleUnavailable },
    });

    await user.click(await screen.findByRole('button', { name: imageText('images.google.use') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      imageText('images.errors.GOOGLE_PHOTO_UNAVAILABLE'),
    );
    expect(screen.getByRole('button', { name: imageText('images.remove') })).toBeVisible();
  });
});
