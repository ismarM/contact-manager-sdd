import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  GROUP_ID,
  renderContactsApp,
  suggestionsServer,
  validationFailedReply,
} from '../../../test/contactsApi';
import { currentLocation } from '../../../test/renderApp';
import { typeName } from '../../../test/typedAttributesApi';

// Tip ključa v obrazcu kontakta: nov ključ izbere tip, obstoječ ključ ga prevzame, napake strežnika po poljih
// (FR-016-01, FR-016-02, FR-016-04).

const LIST = `/groups/${GROUP_ID}/contacts`;
const CREATE = `/api/groups/${GROUP_ID}/contacts`;
const CREATED = contactDetail({ id: CONTACT_ID, version: 0 });

async function openNew(options: Parameters<typeof renderContactsApp>[1] = {}) {
  const view = renderContactsApp(`${LIST}/new`, {
    role: 'EDITOR',
    ...options,
    contacts: { create: () => ({ status: 201, body: CREATED }), ...options.contacts },
  });
  await screen.findByRole('heading', { level: 2, name: 'Nov kontakt' });
  await view.user.type(screen.getByRole('textbox', { name: 'Ime' }), 'Ana');
  await view.user.click(screen.getByRole('button', { name: 'Dodaj atribut' }));
  return view;
}

const sentAttributes = (api: Awaited<ReturnType<typeof openNew>>['api']) =>
  (api.of('POST', CREATE)[0]?.body as { attributes: unknown[] }).attributes;

describe('Tip ključa v obrazcu kontakta', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-016-01: nov ključ ima izbiro tipa; izbran tip gre v zahtevek in polje vrednosti sledi tipu', async () => {
    const { user, api } = await openNew();
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'Mobilni');
    await user.tab();

    const select = screen.getByRole('combobox', { name: 'Tip novega ključa' });
    expect(select).toHaveValue('OTHER');
    await user.selectOptions(select, typeName('PHONE'));
    const value = screen.getByLabelText('Vrednost');
    expect(value).toHaveAttribute('type', 'tel');
    await user.type(value, '041 123 456');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CONTACT_ID}`));
    expect(sentAttributes(api)).toEqual([{ key: 'Mobilni', type: 'PHONE', value: '041 123 456' }]);
  });

  it('FR-016-01: nov ključ brez izbranega tipa pošlje atribut brez tipa (OTHER)', async () => {
    const { user, api } = await openNew();
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'Oddelek');
    await user.type(screen.getByRole('combobox', { name: 'Vrednost' }), 'IT');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CONTACT_ID}`));
    expect(sentAttributes(api)).toEqual([{ key: 'Oddelek', value: 'IT' }]);
  });

  it('FR-016-04: ključ skupine s tipom prevzame tip – brez izbire, s pojasnilom, tip se ne pošlje', async () => {
    const { user, api } = await openNew({
      contacts: {
        suggestions: suggestionsServer({
          key: [{ text: 'Mobilni', count: 5, attributeType: 'PHONE' }],
        }),
      },
    });

    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'mobilni');
    await user.tab();

    expect(await screen.findByText(/Tip ključa v tej skupini je Telefon/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tip novega ključa' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vrednost')).toHaveAttribute('type', 'tel');
    await user.type(screen.getByLabelText('Vrednost'), '031 111 222');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(currentLocation()).toBe(`${LIST}/${CONTACT_ID}`));
    expect(sentAttributes(api)).toEqual([{ key: 'Mobilni', value: '031 111 222' }]);
  });

  it('FR-016-04: izbran predlog ključa prevzame tip', async () => {
    const { user } = await openNew({
      contacts: {
        suggestions: suggestionsServer({
          key: [{ text: 'Spletna stran', count: 2, attributeType: 'URL' }],
        }),
      },
    });

    await user.click(screen.getByRole('combobox', { name: 'Ključ' }));
    await user.click(await screen.findByRole('option', { name: /Spletna stran/ }));

    expect(
      await screen.findByText(/Tip ključa v tej skupini je Spletni naslov/),
    ).toBeInTheDocument();
  });

  it('FR-016-01: obstoječi atribut s tipom je pri urejanju zaklenjen in PUT ne pošlje tipa', async () => {
    const detail = contactDetail({
      id: CONTACT_ID,
      version: 2,
      attributes: [{ key: 'Pošta', type: 'EMAIL', value: 'ana@primer.si' }],
    });
    const { user, api } = renderContactsApp(`${LIST}/${CONTACT_ID}/edit`, {
      role: 'EDITOR',
      contacts: {
        get: () => ({ status: 200, body: detail }),
        update: () => ({ status: 200, body: { ...detail, version: 3 } }),
      },
    });
    await screen.findByRole('heading', { level: 2, name: /Uredi/ });

    expect(await screen.findByText(/Tip ključa v tej skupini je E-naslov/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tip novega ključa' })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Vrednost'));
    await user.type(screen.getByLabelText('Vrednost'), 'nova@primer.si');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await waitFor(() => expect(api.of('PUT', `${CREATE}/${CONTACT_ID}`)).toHaveLength(1));
    const body = api.of('PUT', `${CREATE}/${CONTACT_ID}`)[0]!.body as {
      attributes: unknown[];
      version: number;
    };
    expect(body.attributes).toEqual([{ key: 'Pošta', value: 'nova@primer.si' }]);
    expect(body.version).toBe(2);
  });

  it('FR-016-02: neveljavna vrednost za tip se pokaže ob polju z imenom tipa v sporočilu in v povzetku', async () => {
    const { user } = await openNew({
      contacts: {
        create: () =>
          validationFailedReply({ field: 'attributes[0].value', code: 'INVALID_VALUE' }),
      },
    });
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'Pošta');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('EMAIL'),
    );
    await user.type(screen.getByLabelText('Vrednost'), 'ni-e-naslov');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    const summary = await screen.findByRole('alert');
    expect(within(summary).getByRole('link', { name: 'Vpiši veljaven e-naslov.' })).toBeVisible();
    expect(screen.getByLabelText('Vrednost')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Vrednost')).toHaveAccessibleDescription(
      'Vpiši veljaven e-naslov.',
    );
    expect((await axe(screen.getByRole('main'))).violations).toEqual([]);
  });

  it('FR-016-04: tip, ki ni tip ključa v uporabi, strežnik zavrne in napaka je ob izbiri tipa', async () => {
    const { user } = await openNew({
      contacts: {
        create: () => validationFailedReply({ field: 'attributes[0].type', code: 'INVALID_VALUE' }),
      },
    });
    await user.type(screen.getByRole('combobox', { name: 'Ključ' }), 'Mobilni');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tip novega ključa' }),
      typeName('EMAIL'),
    );
    await user.type(screen.getByLabelText('Vrednost'), 'a@primer.si');
    await user.click(screen.getByRole('button', { name: 'Shrani kontakt' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('combobox', { name: 'Tip novega ključa' })).toHaveAccessibleDescription(
      'Ključ že obstaja z drugim tipom. Izberi predlagani ključ ali drugo ime ključa.',
    );
  });
});
