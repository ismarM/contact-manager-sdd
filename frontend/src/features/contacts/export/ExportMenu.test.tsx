import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  contactId,
  contactIdsReply,
  contactSummaries,
  renderContactsApp,
  resultsReply,
} from '../../../test/contactsApi';
import { captureDownloads } from '../../../test/myDataApi';
import { LIST, listReady } from '../../../test/selection';

// Meni *Izvozi* ob *Uvozi*: izvoz vseh zadetkov trenutne poizvedbe (brez izbora), tudi za bralca.

const MATCHES = Array.from({ length: 12 }, (_, i) => contactId(i + 1));

function render(role: 'EDITOR' | 'VIEWER', path = `${LIST}?sort=email&dir=desc&tag=vip`) {
  return renderContactsApp(path, {
    role,
    contacts: {
      list: resultsReply(contactSummaries(12)),
      contactIds: () => contactIdsReply(MATCHES),
    },
  });
}

const toasts = () => screen.getByRole('region', { name: 'Obvestila' });

describe('ExportMenu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('izvoz v Excel zajame vse zadetke poizvedbe v razvrstitvi seznama', async () => {
    const downloads = captureDownloads();
    const { user, api } = render('EDITOR');
    await listReady();

    await user.click(screen.getByRole('button', { name: 'Izvozi' }));
    await user.click(await screen.findByRole('menuitem', { name: 'V Excel (.xlsx)' }));

    await waitFor(() => expect(api.exportRequests()).toHaveLength(1));
    const idsRequest = api.requests.find((r) => r.path.endsWith('/contact-ids'));
    expect(idsRequest?.search.getAll('tag')).toEqual(['vip']);
    expect(api.exportRequests()[0]).toMatchObject({
      contactIds: MATCHES,
      sort: 'email',
      dir: 'desc',
      language: 'sl',
    });
    await waitFor(() => expect(downloads.names).toHaveLength(1));
    expect(downloads.names[0]).toMatch(/\.xlsx$/);
    expect(
      await within(toasts()).findByText('Izvoženih kontaktov: 12.', {}, { timeout: 1000 }),
    ).toBeInTheDocument();
  });

  it('meni Dejanja (ožji zasloni) ima uvoz, izvoz in kodo QR; izvoz iz menija zajame vse zadetke', async () => {
    captureDownloads();
    const { user, api } = render('EDITOR');
    await listReady();

    await user.click(screen.getByRole('button', { name: 'Dejanja' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual([
      'Uvozi iz Excela (.xlsx)',
      'Uvozi iz vizitk (.vcf)',
      'Izvozi v Excel (.xlsx)',
      'Izvozi v vizitke (.vcf)',
      'Dodaj s kodo QR',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Izvozi v Excel (.xlsx)' }));

    await waitFor(() => expect(api.exportRequests()).toHaveLength(1));
    expect(api.exportRequests()[0]?.contactIds).toEqual(MATCHES);
  });

  it('bralec ima v meniju Dejanja samo izvoz', async () => {
    const { user } = render('VIEWER');
    await listReady();

    await user.click(screen.getByRole('button', { name: 'Dejanja' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Izvozi v Excel (.xlsx)', 'Izvozi v vizitke (.vcf)']);
  });

  it('bralec ima Izvozi, nima pa Uvozi in Dodaj s kodo QR; brez kršitev axe', async () => {
    const { container } = render('VIEWER');
    await listReady();

    expect(screen.getByRole('button', { name: 'Izvozi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uvozi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dodaj s kodo QR' })).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
