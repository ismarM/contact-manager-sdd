import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import type { AttributeType } from '../../attributes/types';
import { TypedValueInput } from './TypedValueInput';

// Polje vrednosti po tipu ključa (FR-016-01, FR-016-03, FR-016-07). Tip OTHER ima predloge (SuggestInput), zato je
// drugje; tu so polja po tipu brez dostopa do skupine.

function Harness({ type }: { type: Exclude<AttributeType, 'OTHER'> }) {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="v">Vrednost</label>
      <TypedValueInput id="v" type={type} value={value} onChange={setValue} listLabel="Predlogi" />
    </>
  );
}

describe('TypedValueInput', () => {
  it.each([
    ['EMAIL', 'email', 'email'],
    ['PHONE', 'tel', 'tel'],
    ['URL', 'text', 'url'],
  ] as const)('FR-016-03: tip %s ima polje type=%s in inputMode=%s', (type, inputType, mode) => {
    render(<Harness type={type} />);

    const field = screen.getByLabelText('Vrednost');
    expect(field.tagName).toBe('INPUT');
    expect(field).toHaveAttribute('type', inputType);
    expect(field).toHaveAttribute('inputmode', mode);
  });

  it('FR-016-03: tip DATE ima izbirnik datuma', () => {
    render(<Harness type="DATE" />);

    expect(screen.getByLabelText('Vrednost')).toHaveAttribute('type', 'date');
  });

  it('FR-016-07: opombe so večvrstično polje in ohranijo presledke ter vrstice', async () => {
    render(<Harness type="NOTES" />);
    const field = screen.getByLabelText('Vrednost');

    await userEvent.type(field, '  a{Enter}  b ');

    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveValue('  a\n  b ');
  });

  it('FR-016-01: napaka polja je povezana z aria-describedby', async () => {
    const { container } = render(
      <>
        <label htmlFor="v">Vrednost</label>
        <TypedValueInput
          id="v"
          type="EMAIL"
          value="x"
          onChange={() => undefined}
          listLabel="Predlogi"
          aria-invalid
          aria-describedby="napaka"
        />
        <p id="napaka">Vpiši veljaven e-naslov.</p>
      </>,
    );

    expect(screen.getByLabelText('Vrednost')).toHaveAccessibleDescription(
      'Vpiši veljaven e-naslov.',
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
