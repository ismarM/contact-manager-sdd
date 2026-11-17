import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { DisplayFormatsContext } from '../formats/displayFormatsContext';
import type { DisplayFormats } from '../formats/types';
import { ChangeTable } from './ChangeTable';
import type { ContactChange } from './types';

// Tipi in deli naslova v preglednici sprememb (016, FR-016-26): vrednosti po shemi uporabnika, sprememba tipa ključa.

const NONE: DisplayFormats = { phoneFormat: null, dateFormat: null, addressFormat: null };

const PARTS = { street: 'Trg 1', postalCode: '1000', city: 'Ljubljana', country: 'SI' };

const CHANGE: ContactChange = {
  contactId: '0193c4a2-7a1f-7c3e-9b1a-c0ffee000001',
  displayName: 'Ana Novak',
  kind: 'CHANGED',
  fields: [
    {
      field: 'ATTRIBUTE',
      key: 'Mobilni',
      before: { type: 'OTHER', value: '041 123 456' },
      after: { type: 'PHONE', value: '+38641123456' },
    },
    {
      field: 'ATTRIBUTE',
      key: 'Rojstvo',
      before: null,
      after: { type: 'DATE', value: '2026-11-16' },
    },
    { field: 'ADDRESS', key: null, before: 'Trg 1, Ljubljana', after: PARTS },
    {
      field: 'ATTRIBUTE',
      key: 'Domov',
      before: null,
      after: { type: 'ADDRESS', parts: PARTS },
    },
  ],
};

function renderTable(formats: DisplayFormats = NONE) {
  return render(
    <DisplayFormatsContext.Provider
      value={{ formats, change: () => undefined, saveStatus: 'idle' }}
    >
      <ChangeTable change={CHANGE} />
    </DisplayFormatsContext.Provider>,
  );
}

const cells = (row: HTMLElement) => within(row).getAllByRole('cell');

describe('ChangeTable – tipi in naslovi', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-26: sprememba tipa ključa je pod imenom ključa (»tip: Drugo → Telefon«), vrednost po shemi', () => {
    renderTable({ ...NONE, phoneFormat: 'E164' });

    const row = screen.getByRole('row', { name: /Mobilni/ });
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Mobilni');
    expect(within(row).getByRole('rowheader')).toHaveTextContent('tip: Drugo → Telefon');
    expect(cells(row).map((cell) => cell.textContent)).toEqual(['041 123 456', '+38641123456']);
  });

  it('FR-016-16: telefon se prikaže po izbrani shemi, časovni žig ni del tipa Datum', () => {
    renderTable({ ...NONE, phoneFormat: 'NATIONAL', dateFormat: 'ISO' });

    expect(cells(screen.getByRole('row', { name: /Mobilni/ }))[1]).toHaveTextContent('041 123 456');
    expect(cells(screen.getByRole('row', { name: /Rojstvo/ }))[1]).toHaveTextContent('2026-11-16');
  });

  it('FR-016-26: datum tipa Datum po shemi dolgo; ključ brez spremembe tipa nima pripisa', () => {
    renderTable({ ...NONE, dateFormat: 'LONG' });

    const row = screen.getByRole('row', { name: /Rojstvo/ });
    expect(cells(row)[1]?.textContent).toMatch(/16\.? (november|November) 2026/);
    expect(within(row).getByRole('rowheader')).not.toHaveTextContent('tip:');
  });

  it('FR-016-26: naslov iz delov po pravilih države in enovrstično; besedilo ostane dobesedno', () => {
    const { unmount } = renderTable({ ...NONE, addressFormat: 'SINGLE_LINE' });
    let address = screen.getByRole('row', { name: /^Naslov/ });
    expect(cells(address)[0]).toHaveTextContent('Trg 1, Ljubljana');
    expect(cells(address)[1]?.textContent).toContain('Trg 1');
    expect(cells(address)[1]?.textContent).toContain('1000 Ljubljana');
    expect(cells(address)[1]?.textContent).not.toContain('\n');
    unmount();

    renderTable({ ...NONE, addressFormat: 'COUNTRY' });
    address = screen.getByRole('row', { name: /^Naslov/ });
    expect(cells(address)[1]?.textContent).toContain('Trg 1');
    expect(cells(screen.getByRole('row', { name: /Domov/ }))[1]?.textContent).toContain(
      'Ljubljana',
    );
  });

  it('axe: brez kršitev', async () => {
    const { container } = renderTable();

    expect((await axe(container)).violations).toEqual([]);
  });
});
