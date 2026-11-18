import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, groupDetail, renderGroupsApp, summary } from '../../test/groupsApi';
import {
  imageFile,
  imageReplies,
  imageText,
  mockImagesApi,
  stubImageDecoding,
  trackBlobUrls,
} from '../../test/imagesApi';
import type { GroupDetail } from './types';

// Slika skupine (FR-018-05..08, -21): razdelek v *Podatki skupine*, avatarji v seznamih, glavi in preklopniku.

const SETTINGS = `/groups/${GROUP_ID}/settings`;

function renderSettings(detail: Partial<GroupDetail>, images = mockImagesApi()) {
  const view = renderGroupsApp(SETTINGS, {
    get: () => ({ status: 200, body: groupDetail(detail) }),
    update: (_id, body) => ({
      status: 200,
      body: groupDetail({ ...detail, ...(body as object), version: 9 }),
    }),
  });
  return { ...view, images };
}

async function findPhotoGroup() {
  return screen.findByRole('group', { name: imageText('images.group.heading') });
}

describe('Slika skupine', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    trackBlobUrls();
  });

  it.each(['OWNER', 'ADMIN'] as const)(
    '%s naloži sliko; verzija iz odgovora gre v obrazec',
    async (role) => {
      stubImageDecoding();
      const { user, images, api } = renderSettings({ role, photoRevision: null });

      const group = await findPhotoGroup();
      await user.click(within(group).getByRole('button', { name: imageText('images.upload') }));
      await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
      await user.click(
        await screen.findByRole('button', { name: imageText('images.dialog.save') }),
      );

      expect(await screen.findByText(imageText('images.group.uploaded'))).toBeInTheDocument();
      const [upload] = images.uploads();
      expect(upload?.path).toBe(`/api/groups/${GROUP_ID}/photo`);
      expect(upload?.upload?.version).toBe('3');
      // Zamenjava je zdaj mogoča, odstranitev prav tako.
      expect(
        within(await findPhotoGroup()).getByRole('button', { name: imageText('images.replace') }),
      ).toBeInTheDocument();

      // Shranjevanje podatkov uporabi novo verzijo (brez lažnega konflikta).
      await user.type(
        screen.getByRole('textbox', { name: new RegExp(imageText('groups.form.title')) }),
        '!',
      );
      await user.click(screen.getByRole('button', { name: imageText('groups.form.save') }));
      await waitFor(() => expect(api.of('PUT', `/api/groups/${GROUP_ID}`)).toHaveLength(1));
      expect(api.of('PUT', `/api/groups/${GROUP_ID}`)[0]?.body).toMatchObject({ version: 4 });
    },
  );

  it('odstranitev s potrditvijo pošlje verzijo in prikaže začetnice', async () => {
    const images = mockImagesApi({ remove: imageReplies.result(null, 4) });
    const { user } = renderSettings({ role: 'ADMIN', photoRevision: 2 }, images);

    const group = await findPhotoGroup();
    await user.click(within(group).getByRole('button', { name: imageText('images.remove') }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: imageText('images.removeDialog.confirm'),
      }),
    );

    expect(await screen.findByText(imageText('images.group.removed'))).toBeInTheDocument();
    expect(images.removals()[0]?.search.get('version')).toBe('3');
    expect(
      within(await findPhotoGroup()).queryByRole('button', { name: imageText('images.remove') }),
    ).not.toBeInTheDocument();
  });

  it('VERSION_CONFLICT pri nalaganju: razumljivo sporočilo, stara slika ostane', async () => {
    stubImageDecoding();
    const { user } = renderSettings(
      { role: 'OWNER', photoRevision: 2 },
      mockImagesApi({
        upload: { status: 409, body: { code: 'VERSION_CONFLICT' } },
      }),
    );

    const group = await findPhotoGroup();
    await user.click(within(group).getByRole('button', { name: imageText('images.replace') }));
    await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
    await user.click(await screen.findByRole('button', { name: imageText('images.dialog.save') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      imageText('images.errors.VERSION_CONFLICT'),
    );
  });

  it.each(['EDITOR', 'VIEWER'] as const)('%s slike vidi, a akcij nima', async (role) => {
    renderSettings({ role, photoRevision: 2 });

    const group = await findPhotoGroup();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });

  it('arhivirana skupina: ADMIN akcij nima', async () => {
    renderSettings({ role: 'ADMIN', archived: true, photoRevision: 2 });

    const group = await findPhotoGroup();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });

  it('brez slike zahtevka ni, z njo se naloži samo zahtevana različica', async () => {
    const images = mockImagesApi();
    renderSettings({ role: 'VIEWER', photoRevision: 5 }, images);

    await findPhotoGroup();
    await waitFor(() => expect(images.reads().length).toBeGreaterThan(0));
    expect(images.reads().every((r) => r.path === `/api/groups/${GROUP_ID}/photo`)).toBe(true);
    expect(images.reads().every((r) => r.authorization?.startsWith('Bearer '))).toBe(true);
  });

  it('brez photoRevision ni nobenega zahtevka za sliko; začetnice v glavi', async () => {
    const images = mockImagesApi();
    renderSettings({ role: 'VIEWER', photoRevision: null }, images);

    await findPhotoGroup();
    expect(images.reads()).toHaveLength(0);
  });

  it('seznam skupin: avatar samo pri skupinah s sliko; axe', async () => {
    const images = mockImagesApi();
    const view = renderGroupsApp('/', {
      list: () => ({
        status: 200,
        body: {
          total: 2,
          page: 0,
          size: 25,
          items: [summary(1, { photoRevision: 3 }), summary(2)],
        },
      }),
    });

    await screen.findByRole('link', { name: 'Skupina 001' });
    await waitFor(() => expect(images.reads().length).toBeGreaterThan(0));
    expect(images.reads().every((r) => r.path.endsWith('0001/photo'))).toBe(true);
    expect((await axe(view.container)).violations).toEqual([]);
  });

  it('izguba dostopa (404 pri nalaganju): stran »Te strani ni« in nobenega aktivnega blob naslova', async () => {
    stubImageDecoding();
    const blobs = trackBlobUrls();
    const { user } = renderSettings(
      { role: 'ADMIN', photoRevision: 2 },
      mockImagesApi({ upload: imageReplies.notFound }),
    );

    const group = await findPhotoGroup();
    await waitFor(() => expect(blobs.created).toBeGreaterThan(0));
    await user.click(within(group).getByRole('button', { name: imageText('images.replace') }));
    await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
    await user.click(await screen.findByRole('button', { name: imageText('images.dialog.save') }));

    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: imageText('images.group.heading') }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(blobs.active()).toEqual([]));
  });
});
