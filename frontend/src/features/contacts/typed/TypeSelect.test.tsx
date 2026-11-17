import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import { typeName } from '../../../test/typedAttributesApi';
import { ATTRIBUTE_TYPES } from '../../attributes/types';
import { TypeSelect } from './TypeSelect';

// Izbira tipa ključa: imena tipov iz prevodov (FR-016-01).

function renderSelect(onChange = vi.fn(), value: (typeof ATTRIBUTE_TYPES)[number] = 'OTHER') {
  render(
    <I18nextProvider i18n={i18n}>
      <main>
        <TypeSelect id="tip" value={value} onChange={onChange} />
      </main>
    </I18nextProvider>,
  );
  return onChange;
}

describe('TypeSelect', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-01: ponudi vseh sedem tipov z imeni iz prevodov', () => {
    renderSelect();

    const select = screen.getByRole('combobox', { name: 'Tip novega ključa' });
    const names = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(names).toEqual(ATTRIBUTE_TYPES.map((type) => typeName(type)));
    expect(names).toHaveLength(7);
  });

  it('FR-016-01: izbira tipa sproži onChange s kodo tipa', async () => {
    const onChange = renderSelect();

    await userEvent.selectOptions(screen.getByRole('combobox'), typeName('PHONE'));

    expect(onChange).toHaveBeenCalledWith('PHONE');
  });

  it('FR-016-01: imena tipov sledijo jeziku, brez kršitev axe', async () => {
    await i18n.changeLanguage('en');
    renderSelect(vi.fn(), 'EMAIL');

    expect(screen.getByRole('combobox', { name: 'Type of the new key' })).toHaveValue('EMAIL');
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
