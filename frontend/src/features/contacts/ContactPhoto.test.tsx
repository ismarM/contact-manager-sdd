import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  contactPageReply,
  contactSummaries,
  contactSummary,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';
import {
  imageFile,
  imageReplies,
  imageText,
  mockImagesApi,
  stubImageDecoding,
  trackBlobUrls,
} from '../../test/imagesApi';

// Slika kontakta (FR-018-09, -10, -21): avatar v seznamu, pogledu in obrazcu, nalaganje z verzijo kontakta.

const LIST = `/groups/${GROUP_ID}/contacts`;
const VIEW = `${LIST}/${CONTACT_ID}`;
const EDIT = `${VIEW}/edit`;
const PHOTO_PATH = `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}/photo`;

const detail = (overrides: Parameters<typeof contactDetail>[0] = {}) =>
  contactDetail({ version: 3, photoRevision: 2, ...overrides });

async function openEdit(
  overrides: Parameters<typeof contactDetail>[0] = {},
  images = mockImagesApi(),
  role: 'EDITOR' | 'VIEWER' = 'EDITOR',
) {
  const stored = detail(overrides);
  const view = renderContactsApp(EDIT, {
    role,
    contacts: {
      get: () => ({ status: 200, body: stored }),
      update: (id, body) => ({ status: 200, body: contactDetail({ ...(body as object), id }) }),
    },
  });
  await screen.findByRole('heading', { level: 2, name: 'Uredi kontakt' });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ime' })).toHaveValue('Janez'));
  return { ...view, images };
}

const photoGroup = () => screen.findByRole('group', { name: imageText('images.contact.heading') });

describe('Slika kontakta', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    trackBlobUrls();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('seznam: zahtevek za sliko samo pri kontaktih s photoRevision, z žetonom', async () => {
    const images = mockImagesApi();
    renderContactsApp(LIST, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([
          contactSummary(1, { photoRevision: 4 }),
          contactSummary(2),
          contactSummary(3, { photoRevision: null }),
        ]),
      },
    });

    await screen.findByRole('link', { name: 'Ime001 Priimek001' });
    await waitFor(() => expect(images.reads()).toHaveLength(1));
    expect(images.reads()[0]?.path).toMatch(/\/contacts\/.*0001\/photo$/);
    expect(images.reads()[0]?.authorization).toMatch(/^Bearer /);
  });

  it('seznam 100 vrstic: slike se naložijo samo za vidne vrstice (IntersectionObserver)', async () => {
    const observers: { callback: IntersectionObserverCallback; element: Element }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(element: Element) {
          observers.push({ callback: this.callback, element });
        }
        disconnect() {}
        unobserve() {}
      },
    );
    const images = mockImagesApi();
    renderContactsApp(LIST, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply(
          contactSummaries(100).map((contact) => ({ ...contact, photoRevision: 1 })),
        ),
      },
    });

    await screen.findByRole('link', { name: 'Ime001 Priimek001' });
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    expect(images.reads()).toHaveLength(0);

    const first = observers.find((entry) => entry.element.closest('tr'));
    if (!first) throw new Error('opazovalca ni');
    act(() => {
      first.callback(
        [{ isIntersecting: true, target: first.element } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    await waitFor(() => expect(images.reads()).toHaveLength(1));
  });

  it('pogled: avatar kontakta s sliko; brez photoRevision zahtevka ni', async () => {
    const images = mockImagesApi();
    renderContactsApp(VIEW, {
      role: 'VIEWER',
      contacts: { get: () => ({ status: 200, body: detail() }) },
    });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    await waitFor(() => expect(images.reads()).toHaveLength(1));
    expect(images.reads()[0]?.path).toBe(PHOTO_PATH);
  });

  it('obrazec: naložitev poveča verzijo, shranjevanje polj jo uporabi (brez lažnega konflikta)', async () => {
    stubImageDecoding();
    const { user, api, images } = await openEdit({ photoRevision: null });

    const group = await photoGroup();
    await user.click(within(group).getByRole('button', { name: imageText('images.upload') }));
    await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
    await user.click(await screen.findByRole('button', { name: imageText('images.dialog.save') }));

    expect(await screen.findByText(imageText('images.contact.uploaded'))).toBeInTheDocument();
    expect(images.uploads()[0]?.path).toBe(PHOTO_PATH);
    expect(images.uploads()[0]?.upload?.version).toBe('3');

    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));
    await waitFor(() => expect(api.of('PUT', PHOTO_PATH.replace('/photo', ''))).toHaveLength(1));
    expect(api.of('PUT', PHOTO_PATH.replace('/photo', ''))[0]?.body).toMatchObject({ version: 2 });
  });

  it('obrazec: odstranitev s potrditvijo pošlje verzijo kontakta', async () => {
    const { user, images } = await openEdit(
      {},
      mockImagesApi({ remove: imageReplies.result(null, 4) }),
    );

    const group = await photoGroup();
    await user.click(within(group).getByRole('button', { name: imageText('images.remove') }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: imageText('images.removeDialog.confirm'),
      }),
    );

    expect(await screen.findByText(imageText('images.contact.removed'))).toBeInTheDocument();
    expect(images.removals()[0]?.search.get('version')).toBe('3');
  });

  it('obrazec: VERSION_CONFLICT pokaže razumljivo sporočilo', async () => {
    stubImageDecoding();
    const { user } = await openEdit(
      {},
      mockImagesApi({ upload: { status: 409, body: { code: 'VERSION_CONFLICT' } } }),
    );

    await user.click(
      within(await photoGroup()).getByRole('button', { name: imageText('images.replace') }),
    );
    await user.upload(screen.getByLabelText(imageText('images.dialog.choose')), imageFile());
    await user.click(await screen.findByRole('button', { name: imageText('images.dialog.save') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      imageText('images.errors.VERSION_CONFLICT'),
    );
  });

  it('nov kontakt: namesto akcij razlaga; axe brez kršitev', async () => {
    const view = renderContactsApp(`${LIST}/new`, { role: 'EDITOR' });

    const group = await photoGroup();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
    expect(group).toHaveTextContent(imageText('images.contact.hint'));
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
