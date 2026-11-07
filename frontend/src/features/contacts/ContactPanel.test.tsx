import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  contactDetail,
  contactId,
  contactPageReply,
  contactSummaries,
  GROUP_ID,
  renderContactsApp,
} from '../../test/contactsApi';
import { currentLocation } from '../../test/renderApp';
import { setViewport } from '../../test/viewport';

// Panel podrobnosti ob seznamu (≥ 1280 px; FR-004-09, FR-004-14; SC-005; design.md 7.2).

const LIST = `/groups/${GROUP_ID}/contacts`;
const detailOf = (n: number) =>
  contactDetail({
    id: contactId(n),
    firstName: `Ime${n.toString().padStart(3, '0')}`,
    lastName: `Priimek${n.toString().padStart(3, '0')}`,
    displayName: `Ime${n.toString().padStart(3, '0')} Priimek${n.toString().padStart(3, '0')}`,
  });

function handlers() {
  return {
    list: contactPageReply(contactSummaries(30)),
    get: (id: string) => {
      const n = Number(id.slice(-6));
      return { status: 200, body: detailOf(n) };
    },
  };
}

describe('ContactPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
    setViewport('panel');
  });

  it('FR-004-09: izbira kontakta odpre panel desno od seznama; kontakt je v naslovu poti', async () => {
    const { user } = renderContactsApp(LIST, { role: 'VIEWER', contacts: handlers() });
    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });

    await user.click(within(table).getByRole('link', { name: 'Ime002 Priimek002' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${contactId(2)}`));
    const panel = await screen.findByRole('region', { name: 'Podrobnosti kontakta' });
    expect(
      await within(panel).findByRole('heading', { level: 2, name: 'Ime002 Priimek002' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Kontakti skupine Projekt FERI' }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Zapri podrobnosti' })).toHaveAttribute(
      'href',
      LIST,
    );
  });

  it('FR-004-09: izbira drugega kontakta zamenja vsebino panela, seznam ostane', async () => {
    const { user } = renderContactsApp(`${LIST}/${contactId(2)}`, {
      role: 'VIEWER',
      contacts: handlers(),
    });
    const panel = await screen.findByRole('region', { name: 'Podrobnosti kontakta' });
    await within(panel).findByRole('heading', { level: 2, name: 'Ime002 Priimek002' });

    await user.click(
      within(screen.getByRole('table', { name: 'Kontakti skupine Projekt FERI' })).getByRole(
        'link',
        {
          name: 'Ime005 Priimek005',
        },
      ),
    );

    expect(
      await within(screen.getByRole('region', { name: 'Podrobnosti kontakta' })).findByRole(
        'heading',
        { level: 2, name: 'Ime005 Priimek005' },
      ),
    ).toBeInTheDocument();
  });

  it('FR-004-09: osvežitev na poti kontakta – isti kontakt je še vedno izbran (SC-005)', async () => {
    renderContactsApp(`${LIST}/${contactId(7)}?page=1`, { role: 'VIEWER', contacts: handlers() });

    const panel = await screen.findByRole('region', { name: 'Podrobnosti kontakta' });
    expect(
      await within(panel).findByRole('heading', { level: 2, name: 'Ime007 Priimek007' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' }),
    ).toBeVisible();
  });

  it('FR-004-14: neobstoječ kontakt v panelu – sporočilo, seznam ostane', async () => {
    renderContactsApp(`${LIST}/${contactId(7)}`, {
      role: 'VIEWER',
      contacts: { ...handlers(), get: () => ({ status: 404 }) },
    });

    const panel = await screen.findByRole('region', { name: 'Podrobnosti kontakta' });
    await waitFor(() =>
      expect(panel).toHaveTextContent('Tega kontakta ni več – medtem ga je nekdo izbrisal.'),
    );
    expect(
      await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Te strani ni' })).not.toBeInTheDocument();
  });

  it('FR-004-09: pod 1280 px se podrobnosti odprejo na ločeni strani brez seznama', async () => {
    setViewport('wide');
    renderContactsApp(`${LIST}/${contactId(2)}`, { role: 'VIEWER', contacts: handlers() });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ime002 Priimek002' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Podrobnosti kontakta' })).not.toBeInTheDocument();
  });

  it('FR-004-09: brez kršitev axe s panelom', async () => {
    const { container } = renderContactsApp(`${LIST}/${contactId(2)}`, {
      role: 'VIEWER',
      contacts: handlers(),
    });
    const panel = await screen.findByRole('region', { name: 'Podrobnosti kontakta' });
    await within(panel).findByRole('heading', { level: 2, name: 'Ime002 Priimek002' });

    expect((await axe(container)).violations).toEqual([]);
  });
});
