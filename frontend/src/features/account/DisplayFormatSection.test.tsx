import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { accountRegion, renderAccountApp } from '../../test/myDataApi';

describe('DisplayFormatSection – razdelek Oblika zapisa', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('sl');
  });

  it('FR-016-16: privzeto so izbrane Mednarodno, Po jeziku vmesnika in Po pravilih države', async () => {
    renderAccountApp();

    const region = await accountRegion('Oblika zapisa');
    expect(
      within(region).getByRole('radio', { name: /^Mednarodna \(\+386 41 123 456\)/ }),
    ).toBeChecked();
    expect(within(region).getByRole('radio', { name: /^Po jeziku vmesnika/ })).toBeChecked();
    expect(within(region).getByRole('radio', { name: /^Po pravilih države/ })).toBeChecked();
    expect(within(region).getAllByRole('group')).toHaveLength(3);
  });

  it('FR-016-16, FR-016-17: izbira se uveljavi takoj in se shrani v profil; privzeta izbira pošlje null', async () => {
    const { user, profile } = renderAccountApp();
    const region = await accountRegion('Oblika zapisa');

    await user.click(within(region).getByRole('radio', { name: /^Nacionalna/ }));
    expect(within(region).getByRole('radio', { name: /^Nacionalna/ })).toBeChecked();
    await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('shranjena'));
    await user.click(within(region).getByRole('radio', { name: /^V eni vrstici/ }));
    await user.click(within(region).getByRole('radio', { name: /^Mednarodna/ }));

    const saves = () => profile.requests.filter((r) => r.path === '/api/me/preferences');
    await waitFor(() => expect(saves()).toHaveLength(3));
    expect(saves()[0]?.body).toMatchObject({ phoneFormat: 'NATIONAL' });
    expect(saves()[1]?.body).toMatchObject({ addressFormat: 'SINGLE_LINE' });
    expect(saves()[2]?.body).toMatchObject({ phoneFormat: null });
    expect(localStorage.getItem('addressFormat')).toBe('SINGLE_LINE');
    expect(localStorage.getItem('phoneFormat')).toBeNull();
  });

  it('FR-016-17: izbira iz profila ima prednost pred kopijo na napravi', async () => {
    localStorage.setItem('phoneFormat', 'E164');
    renderAccountApp();

    const region = await accountRegion('Oblika zapisa');
    await waitFor(() =>
      expect(within(region).getByRole('radio', { name: /^Mednarodna/ })).toBeChecked(),
    );
  });

  it('FR-016-17: ob prijavi se kopija z naprave pošlje v profil', async () => {
    localStorage.setItem('dateFormat', 'ISO');
    const { profile } = renderAccountApp();

    await accountRegion('Oblika zapisa');
    const sync = profile.requests.find((r) => r.method === 'PUT' && r.path === '/api/me');
    expect(sync?.body).toMatchObject({ dateFormat: 'ISO', phoneFormat: null });
  });

  it('FR-016-16: brez kršitev axe', async () => {
    renderAccountApp();
    const region = await accountRegion('Oblika zapisa');
    expect((await axe(region)).violations).toEqual([]);
    expect(screen.getByRole('heading', { level: 2, name: 'Oblika zapisa' })).toBeVisible();
  });
});
