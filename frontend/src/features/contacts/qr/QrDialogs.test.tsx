import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import { CONTACT_ID, contactDetail, GROUP_ID, renderContactsApp } from '../../../test/contactsApi';
import { file, names, tr } from '../../../test/importExport';
import { server } from '../../../test/msw';
import { captureDownloads } from '../../../test/myDataApi';

const CARD =
  'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Novak;Bor\r\nFN:Bor Novak\r\nEMAIL;TYPE=internet:bor@primer.si\r\n' +
  'TEL;TYPE=voice:041 abc\r\nADR:;;Ulica 1;;;;Atlantida\r\nEND:VCARD\r\n';

/** Lažni izvorni `BarcodeDetector`: vsaka slika vrne dane kode. */
function fakeDetector(codes: string[]) {
  const detect = vi.fn(() => Promise.resolve(codes.map((rawValue) => ({ rawValue }))));
  class FakeDetector {
    static getSupportedFormats() {
      return Promise.resolve(['qr_code']);
    }
    detect = detect;
  }
  vi.stubGlobal('BarcodeDetector', FakeDetector);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({})),
  );
  return detect;
}

function camera(outcome: 'denied' | 'granted') {
  const stop = vi.fn();
  const getUserMedia = vi.fn(() =>
    outcome === 'denied'
      ? Promise.reject(new DOMException('denied', 'NotAllowedError'))
      : Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
  );
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  return { getUserMedia, stop };
}

describe('koda QR (014)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('FR-014-14 FR-014-15: bralec v arhivirani skupini odpre kodo QR z opozorilom, alternativo in prenosom PNG', async () => {
    const downloads = captureDownloads();
    const { container } = renderContactsApp(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}`, {
      role: 'VIEWER',
      archived: true,
      contacts: {
        get: () => ({
          status: 200,
          body: contactDetail({
            firstName: 'Ana',
            lastName: 'Kos',
            displayName: 'Ana Kos',
          }) as unknown as JsonBodyType,
        }),
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.qrShare() }));
    const dialog = await screen.findByRole('dialog', {
      name: tr('contacts.qrShare.title', { name: 'Ana Kos' }),
    });

    expect(within(dialog).getByText(tr('contacts.qrShare.warning'))).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('img', { name: names.qrAlt('Ana Kos') }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: names.qrDownload() }));
    await waitFor(() => expect(downloads.names).toEqual(['Ana-Kos-qr.png']));
  });

  it('FR-014-10: Prenesi vizitko (.vcf) prenese ‹ime-priimek›.vcf v jeziku vmesnika', async () => {
    const downloads = captureDownloads();
    let url = '';
    server.use(
      http.get('/api/groups/:groupId/contacts/:contactId/vcard', ({ request }) => {
        url = request.url;
        return new HttpResponse('BEGIN:VCARD\r\nEND:VCARD\r\n', {
          headers: { 'Content-Type': 'text/vcard' },
        });
      }),
    );
    renderContactsApp(`/groups/${GROUP_ID}/contacts/${CONTACT_ID}`, {
      role: 'VIEWER',
      contacts: {
        get: () => ({
          status: 200,
          body: contactDetail({
            firstName: 'Ana',
            lastName: 'Kos',
            displayName: 'Ana Kos',
          }) as unknown as JsonBodyType,
        }),
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.vcardDownload() }));

    await waitFor(() => expect(downloads.names).toEqual(['Ana-Kos.vcf']));
    expect(new URL(url).searchParams.get('language')).toBe('sl');
  });

  it('FR-014-17: kamera ni dovoljena → besedilo in izbira slike; FR-014-18: slika s kodo odpre predizpolnjen obrazec', async () => {
    camera('denied');
    fakeDetector([CARD]);
    renderContactsApp(`/groups/${GROUP_ID}/contacts`, { role: 'EDITOR' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.qrScan() }));
    expect(await screen.findByText(tr('contacts.qrScan.noCamera'))).toBeInTheDocument();
    await user.upload(screen.getByLabelText(names.pickImage()), file('koda.png', 10, 'image/png'));

    expect(
      await screen.findByRole('heading', { name: tr('contacts.form.newHeading') }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(tr('contacts.form.firstName'))).toHaveValue('Bor');
    expect(screen.getByLabelText(tr('contacts.form.email'))).toHaveValue('bor@primer.si');
    expect(screen.getByLabelText(tr('contacts.form.phone'))).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByText(tr('contacts.form.qrCountryHint', { text: 'Atlantida' })),
    ).toBeInTheDocument();
  });

  it('FR-014-19: slika brez kontakta pokaže napako, okno ostane odprto', async () => {
    camera('denied');
    fakeDetector(['https://primer.si']);
    renderContactsApp(`/groups/${GROUP_ID}/contacts`, { role: 'EDITOR' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.qrScan() }));
    await user.upload(
      await screen.findByLabelText(names.pickImage()),
      file('slika.png', 10, 'image/png'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(tr('contacts.qrScan.noCode'));
    expect(screen.getByRole('dialog', { name: tr('contacts.qrScan.title') })).toBeInTheDocument();
  });

  it('FR-014-20: zaprtje okna ustavi kamero; slika se ne pošlje na strežnik', async () => {
    const { stop } = camera('granted');
    fakeDetector([]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderContactsApp(`/groups/${GROUP_ID}/contacts`, { role: 'EDITOR' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: names.qrScan() }));
    expect(await screen.findByText(tr('contacts.qrScan.instruction'))).toBeInTheDocument();
    await user.upload(screen.getByLabelText(names.pickImage()), file('slika.png', 10, 'image/png'));
    await user.click(screen.getByRole('button', { name: tr('contacts.qrScan.close') }));

    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(
      fetchSpy.mock.calls.some(
        ([, init]) => init?.body instanceof File || init?.body instanceof FormData,
      ),
    ).toBe(false);
  });

  it.each([
    ['VIEWER', false],
    ['OWNER', true],
  ] as const)(
    'FR-014-01 FR-014-17: %s v arhivirani=%s ne vidi Uvozi in Dodaj s kodo QR',
    async (role, archived) => {
      renderContactsApp(`/groups/${GROUP_ID}/contacts`, { role, archived });

      await screen.findByRole('heading', { name: tr('contacts.heading') });
      expect(screen.queryByRole('button', { name: names.importMenu() })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: names.qrScan() })).not.toBeInTheDocument();
    },
  );
});
