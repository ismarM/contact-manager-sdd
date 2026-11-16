import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import '../../i18n';
import { TypedValueView } from '../contacts/typed/TypedValueView';
import { DisplayFormatsContext } from './displayFormatsContext';
import type { DisplayFormats } from './types';

// Vrednosti po tipu se prikažejo po shemi uporabnika, povezava ostane kanonična (FR-016-16, FR-016-18).

function renderWith(formats: DisplayFormats, ui: React.ReactNode) {
  return render(
    <DisplayFormatsContext.Provider
      value={{ formats, change: () => undefined, saveStatus: 'idle' }}
    >
      {ui}
    </DisplayFormatsContext.Provider>,
  );
}

const NONE: DisplayFormats = { phoneFormat: null, dateFormat: null, addressFormat: null };

describe('prikaz po shemi uporabnika', () => {
  it.each([
    ['INTERNATIONAL', '+43 664 1234567'],
    ['NATIONAL', '0664 1234567'],
    ['E164', '+436641234567'],
  ] as const)(
    'FR-016-16, FR-016-18: telefon po shemi %s, povezava tel ostane kanonična',
    (phoneFormat, text) => {
      renderWith({ ...NONE, phoneFormat }, <TypedValueView type="PHONE" value="+436641234567" />);

      expect(screen.getByRole('link', { name: text })).toHaveAttribute('href', 'tel:+436641234567');
    },
  );

  it('FR-016-16: datum ISO ostane kanoničen, dolga oblika ga razpiše', () => {
    const { unmount } = renderWith(
      { ...NONE, dateFormat: 'ISO' },
      <TypedValueView type="DATE" value="2026-11-16" />,
    );
    // getByText: izid oblikovanja je golo besedilo brez vloge (veljá tudi za naslednjo asercijo).
    expect(screen.getByText('2026-11-16')).toBeVisible();
    unmount();

    renderWith({ ...NONE, dateFormat: 'LONG' }, <TypedValueView type="DATE" value="2026-11-16" />);
    expect(screen.getByText(/^16\s+November 2026$|^16\. november 2026$/)).toBeVisible();
  });

  it('FR-016-16: razčlenjen naslov po pravilih države in enovrstično', () => {
    const parts = {
      street: '1 Main St',
      postalCode: '62701',
      city: 'Springfield',
      region: 'IL',
      country: 'US',
    };
    const { container, unmount } = renderWith(
      { ...NONE, addressFormat: 'COUNTRY' },
      <TypedValueView type="ADDRESS" value="" parts={parts} />,
    );
    expect(container.textContent).toContain('Springfield, IL 62701');
    // jsdom nima postavitve, zato je razred edina opazna posledica večvrstičnega prikaza; vsebino preverjata ostali asercij.
    expect(container.querySelector('span')?.className).toContain('whitespace-pre-line');
    unmount();

    const single = renderWith(
      { ...NONE, addressFormat: 'SINGLE_LINE' },
      <TypedValueView type="ADDRESS" value="" parts={parts} />,
    );
    expect(single.container.textContent).toMatch(/^1 Main St, Springfield, IL 62701/);
  });

  it('FR-016-16: nerazčlenjen naslov je prikazan dobesedno', () => {
    renderWith(NONE, <TypedValueView type="ADDRESS" value="Neka ulica 5" />);

    // getByText: izid oblikovanja je golo besedilo brez vloge.
    expect(screen.getByText('Neka ulica 5')).toBeVisible();
  });
});
