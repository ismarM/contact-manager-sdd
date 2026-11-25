import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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
import { setViewport } from '../../test/viewport';

// Kartica kontakta in seznam po platnu Kartoteke v2 (FR-020-17 … -21; tasks T053).

const LIST = `/groups/${GROUP_ID}/contacts`;
const VIEW = `${LIST}/${CONTACT_ID}`;
const VIEW_HANDLERS = {
  get: () => ({ status: 200 as const, body: contactDetail() }),
  list: contactPageReply(contactSummaries(2)),
};

describe('Kartica kontakta (FR-020-19)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('prikaže ime, vrstico o nastanku in zadnji spremembi, deljenje, polja, atribute, značke in zgodovino', async () => {
    renderContactsApp(VIEW, {
      role: 'EDITOR',
      contacts: {
        get: () => ({
          status: 200 as const,
          body: contactDetail({
            company: 'FERI UM',
            tags: ['partner', 'vip'],
            attributes: [{ key: 'vloga', type: 'OTHER', value: 'Vodja projekta' }],
          }),
        }),
        list: contactPageReply(contactSummaries(2)),
      },
    });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    // design.md 8.6a: datuma po obliki zapisa, ne surova trenutka ISO (createdAt 2026-11-05T10:00:00Z).
    expect(
      screen.getByText('Dodano 5. 11. 2026 · nazadnje urejeno 5. 11. 2026, Ana Novak'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prenesi vizitko (.vcf)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deli s kodo QR' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Kontakt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Dodatni atributi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Značke' })).toBeInTheDocument();
    const history = screen.getByRole('region', { name: 'Zgodovina' });
    expect(within(history).getByRole('link', { name: 'Zgodovina kontakta' })).toHaveAttribute(
      'href',
      `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/history`,
    );
    expect(
      within(history).getByRole('link', { name: 'Spremembe tega kontakta v revizijski sledi' }),
    ).toHaveAttribute('href', `/groups/${GROUP_ID}/audit?contact=${CONTACT_ID}`);
  });

  it('Uredi kontakt (primarno) je pred Izbriši kontakt', async () => {
    renderContactsApp(VIEW, { role: 'EDITOR', contacts: VIEW_HANDLERS });

    const edit = await screen.findByRole('link', { name: 'Uredi kontakt' });
    const remove = screen.getByRole('button', { name: 'Izbriši kontakt' });
    expect(edit.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('bralec: brez akcij urejanja in brisanja, deljenje in zgodovina ostaneta', async () => {
    renderContactsApp(VIEW, { role: 'VIEWER', contacts: VIEW_HANDLERS });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('link', { name: 'Uredi kontakt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Izbriši kontakt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deli s kodo QR' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zgodovina kontakta' })).toBeInTheDocument();
  });

  it('arhivirana skupina: pisalnih akcij ni, deljenje je', async () => {
    renderContactsApp(VIEW, {
      role: 'OWNER',
      archived: true,
      contacts: VIEW_HANDLERS,
    });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect(screen.queryByRole('link', { name: 'Uredi kontakt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Izbriši kontakt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prenesi vizitko (.vcf)' })).toBeInTheDocument();
  });

  it.each(['narrow', 'panel'] as const)('brez kršitev axe (%s)', async (width) => {
    setViewport(width);
    const { container } = renderContactsApp(VIEW, {
      role: 'EDITOR',
      contacts: VIEW_HANDLERS,
    });

    await screen.findByRole('heading', { level: 2, name: 'Janez Novak' });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('Seznam kontaktov in izbor (FR-020-17, FR-020-21)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('preglednica ima največ tri značke in »+N«; ista vsebina je v vrstici ob vsaki širini', async () => {
    renderContactsApp(LIST, {
      role: 'VIEWER',
      contacts: {
        list: contactPageReply([contactSummary(1, { tags: ['a', 'b', 'c', 'd', 'e'] })]),
      },
    });

    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    for (const tag of ['a', 'b', 'c']) expect(within(row).getByText(tag)).toBeInTheDocument();
    expect(within(row).queryByText('d')).not.toBeInTheDocument();
    expect(within(row).getByText('+2')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Ime001 Priimek001' })).toBeInTheDocument();
  });

  it('izbrana vrstica ima barvo in označeno potrditveno polje; plavajoča vrstica kaže število', async () => {
    const { user } = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: { list: contactPageReply(contactSummaries(3)) },
    });

    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    expect(screen.queryByRole('toolbar', { name: 'Dejanja izbora' })).not.toBeInTheDocument();
    const box = within(table).getByRole('checkbox', { name: 'Izberi Ime001 Priimek001' });
    await user.click(box);

    expect(box).toBeChecked();
    expect(box.closest('tr')).toHaveClass('bg-selected');
    const bar = screen.getByRole('toolbar', { name: 'Dejanja izbora' });
    expect(within(bar).getByRole('status')).toHaveTextContent('Izbran: 1');
    expect(bar).toHaveClass('fixed');

    await user.click(within(bar).getByRole('button', { name: 'Počisti izbor' }));
    expect(screen.queryByRole('toolbar', { name: 'Dejanja izbora' })).not.toBeInTheDocument();
    expect(box).not.toBeChecked();
  });

  it('seznam z izbiro brez kršitev axe', async () => {
    const { user, container } = renderContactsApp(LIST, {
      role: 'EDITOR',
      contacts: { list: contactPageReply(contactSummaries(3)) },
    });
    const table = await screen.findByRole('table', { name: 'Kontakti skupine Projekt FERI' });
    await user.click(within(table).getByRole('checkbox', { name: 'Izberi Ime001 Priimek001' }));

    expect((await axe(container)).violations).toEqual([]);
  });

  it('tudi od 1280 px je izbrani kontakt na svoji strani brez seznama', async () => {
    setViewport('panel');
    renderContactsApp(VIEW, { role: 'VIEWER', contacts: VIEW_HANDLERS });

    expect(await screen.findByRole('link', { name: 'Nazaj na seznam kontaktov' })).toBeVisible();
    expect(screen.queryByRole('table', { name: /Kontakti skupine/ })).not.toBeInTheDocument();
  });
});
