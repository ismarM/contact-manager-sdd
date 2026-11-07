import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  contactPageReply,
  contactSummaries,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';

// Akcije kontaktov po vlogi in stanju skupine (FR-004-07, FR-004-15, FR-004-17; plan.md – Key elements).

const LIST = `/groups/${GROUP_ID}/contacts`;
const VIEW = `${LIST}/${CONTACT_ID}`;
const handlers = {
  list: contactPageReply(contactSummaries(3)),
  get: () => ({ status: 200 as const, body: contactDetail() }),
};

const READ_ONLY = [
  ['bralec', { role: 'VIEWER' as const, archived: false }],
  ['lastnik arhivirane skupine', { role: 'OWNER' as const, archived: true }],
  ['admin arhivirane skupine', { role: 'ADMIN' as const, archived: true }],
  ['urednik arhivirane skupine', { role: 'EDITOR' as const, archived: true }],
] as const;

describe('ContactPermissions', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it.each(READ_ONLY)(
    'FR-004-17: seznam – %s nima Nov kontakt, stolpca Dejanja in menijev',
    async (_n, options) => {
      renderContactsApp(LIST, { ...options, contacts: handlers });

      const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
      expect(
        within(table).queryByRole('columnheader', { name: 'Dejanja' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Dejanja za/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Nov kontakt' })).not.toBeInTheDocument();
    },
  );

  it.each(READ_ONLY)(
    'FR-004-17: pogled – %s nima Uredi kontakt in Izbriši kontakt',
    async (_n, options) => {
      renderContactsApp(VIEW, { ...options, contacts: handlers });

      await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
      expect(screen.queryByRole('link', { name: 'Uredi kontakt' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Izbriši kontakt' })).not.toBeInTheDocument();
    },
  );

  it.each(['EDITOR', 'ADMIN', 'OWNER'] as const)(
    'FR-004-17: %s nearhivirane skupine vidi vse akcije',
    async (role) => {
      const { user } = renderContactsApp(LIST, { role, contacts: handlers });

      const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
      expect(within(table).getByRole('columnheader', { name: 'Dejanja' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Nov kontakt' })).toHaveAttribute(
        'href',
        `${LIST}/new`,
      );
      await user.click(within(table).getByRole('button', { name: 'Dejanja za Ime001 Priimek001' }));
      expect(await screen.findByRole('menuitem', { name: 'Uredi kontakt' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Izbriši kontakt' })).toBeInTheDocument();
    },
  );

  it('FR-004-07: urednik v pogledu vidi Uredi kontakt (povezava) in Izbriši kontakt (gumb)', async () => {
    renderContactsApp(VIEW, { role: 'EDITOR', contacts: handlers });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.getByRole('link', { name: 'Uredi kontakt' })).toHaveAttribute(
      'href',
      `${VIEW}/edit`,
    );
    expect(screen.getByRole('button', { name: 'Izbriši kontakt' })).toBeInTheDocument();
  });

  it.each(['/new', `/${CONTACT_ID}/edit`])(
    'FR-004-17: bralec na poti %s ne dobi obrazca, ampak razlago in povezavo na seznam',
    async (suffix) => {
      const { api } = renderContactsApp(`${LIST}${suffix}`, { role: 'VIEWER', contacts: handlers });

      const main = await screen.findByRole('main');
      await waitFor(() =>
        expect(main).toHaveTextContent('Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.'),
      );
      expect(within(main).queryByRole('form')).not.toBeInTheDocument();
      expect(within(main).queryByRole('textbox')).not.toBeInTheDocument();
      expect(within(main).getByRole('link', { name: 'Nazaj na seznam kontaktov' })).toHaveAttribute(
        'href',
        LIST,
      );
      expect(api.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);
      expect(api.of('GET', `/api/groups/${GROUP_ID}/tags`)).toHaveLength(0);
    },
  );

  it.each(['/new', `/${CONTACT_ID}/edit`])(
    'FR-004-17: arhivirana skupina na poti %s – razlaga namesto obrazca',
    async (suffix) => {
      renderContactsApp(`${LIST}${suffix}`, { role: 'OWNER', archived: true, contacts: handlers });

      const main = await screen.findByRole('main');
      await waitFor(() =>
        expect(main).toHaveTextContent('Skupina je arhivirana – kontaktov ni mogoče spreminjati.'),
      );
      expect(within(main).queryByRole('textbox')).not.toBeInTheDocument();
      expect(
        within(main).getByRole('link', { name: 'Nazaj na seznam kontaktov' }),
      ).toBeInTheDocument();
    },
  );

  it('FR-004-17: vloga se vzame iz skupine – bralec na novem kontaktu: brez kršitev axe (sl in en)', async () => {
    const { container } = renderContactsApp(`${LIST}/new`, { role: 'VIEWER', contacts: handlers });
    await waitFor(() =>
      expect(screen.getByRole('main')).toHaveTextContent(
        'Za urejanje kontaktov potrebuješ vlogo urednik ali višjo.',
      ),
    );
    expect((await axe(container)).violations).toEqual([]);

    await i18n.changeLanguage('en');
    await waitFor(() =>
      expect(screen.getByRole('main')).toHaveTextContent(
        'You need the editor role or higher to edit contacts.',
      ),
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
