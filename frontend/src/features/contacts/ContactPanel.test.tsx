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

// Podrobnosti kontakta so pri vseh širinah na ločeni strani (FR-004-09, FR-004-14).

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

  it('FR-004-09: od 1280 px izbira kontakta odpre ločeno stran brez seznama in brez panela', async () => {
    const { user } = renderContactsApp(LIST, { role: 'VIEWER', contacts: handlers() });
    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });

    await user.click(within(table).getByRole('link', { name: 'Ime002 Priimek002' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${contactId(2)}`));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ime002 Priimek002' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Podrobnosti kontakta' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nazaj na seznam kontaktov' })).toHaveAttribute(
      'href',
      LIST,
    );
  });

  it('FR-004-14: od 1280 px je neobstoječ kontakt »Te strani ni«', async () => {
    renderContactsApp(`${LIST}/${contactId(7)}`, {
      role: 'VIEWER',
      contacts: { ...handlers(), get: () => ({ status: 404 }) },
    });

    expect(await screen.findByRole('heading', { name: 'Te strani ni' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('FR-004-09: brez kršitev axe na strani kontakta od 1280 px', async () => {
    const { container } = renderContactsApp(`${LIST}/${contactId(2)}`, {
      role: 'VIEWER',
      contacts: handlers(),
    });
    await screen.findByRole('heading', { level: 2, name: 'Ime002 Priimek002' });

    expect((await axe(container)).violations).toEqual([]);
  });
});
