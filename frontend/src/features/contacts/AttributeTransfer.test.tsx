import type { BoundFunctions, queries } from '@testing-library/react';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import {
  CONTACT_ID,
  contactDetail,
  GROUP_ID,
  renderContactsApp,
  resolveReply,
} from '../../test/contactsApi';
import { chooseCountry, country, name, tr } from '../../test/smartAttributes';
import type { ContactDetail, CountryResolution } from './types';

// Ročen prenos starih atributov Država/Podjetje v novi polji (FR-013-08, FR-013-20; design.md 8.10).

const EDIT = `/groups/${GROUP_ID}/contacts/${CONTACT_ID}/edit`;
const PUT = `/api/groups/${GROUP_ID}/contacts/${CONTACT_ID}`;
const RESOLVE = '/api/countries/resolve';

const withAttributes = (
  attributes: ContactDetail['attributes'],
  extra: Partial<ContactDetail> = {},
) => contactDetail({ version: 3, attributes, ...extra });

async function openEdit(
  loaded: ContactDetail,
  resolve?: (values: string[]) => ReturnType<typeof resolveReply> | CountryResolution[],
  failResolve = false,
) {
  const view = renderContactsApp(EDIT, {
    role: 'EDITOR',
    contacts: {
      get: () => ({ status: 200, body: loaded }),
      resolve: (values) =>
        failResolve
          ? { status: 500, body: { code: 'INTERNAL' } }
          : ((resolve?.(values) as ReturnType<typeof resolveReply>) ??
            resolveReply(values.map((input) => ({ input, status: 'UNKNOWN' as const })))),
    },
  });
  await screen.findByRole('heading', { level: 2, name: tr('contacts.form.editHeading') });
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: tr('contacts.form.firstName') })).toHaveValue(
      'Janez',
    ),
  );
  return view;
}

const found = (code: string) => (values: string[]) =>
  resolveReply(values.map((input) => ({ input, status: 'FOUND' as const, code })));

const moveCountry = () =>
  screen.getByRole('button', { name: tr('contacts.transfer.action.country') });
const moveCompany = () =>
  screen.getByRole('button', { name: tr('contacts.transfer.action.company') });
const keyFields = () => screen.queryAllByRole('combobox', { name: name.key() });
const writes = (api: Awaited<ReturnType<typeof openEdit>>['api']) =>
  api.requests.filter(
    (request) => request.method === 'PUT' || request.path === `/api/groups/${GROUP_ID}/contacts`,
  );

const dialogOf = async () => within(await screen.findByRole('dialog'));

const definitions = (scope: BoundFunctions<typeof queries>) =>
  scope.getAllByRole('definition').map((value) => value.textContent);

describe('AttributeTransfer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-013-08: ob odprtju kontakta se nič ne prenese samo; opomba in gumb sta samo pri rezerviranih imenih', async () => {
    const { api } = await openEdit(
      withAttributes([
        { key: 'Država', value: 'Slovenija' },
        { key: 'Oddelek', value: 'IT' },
      ]),
    );

    expect(moveCountry()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: tr('contacts.transfer.action.country') }),
    ).toHaveAccessibleDescription(tr('contacts.transfer.note.country'));
    expect(
      screen.queryByRole('button', { name: tr('contacts.transfer.action.company') }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Odstrani atribut/ })).toHaveLength(2);
    expect(api.of('POST', RESOLVE)).toHaveLength(0);
    expect(writes(api)).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue('');
  });

  it('FR-013-20: država FOUND – polje je predizpolnjeno, vrstica odstranjena, na strežniku se do shranjevanja nič ne spremeni', async () => {
    const { user, api } = await openEdit(
      withAttributes([{ key: 'Država', value: 'Slovenija' }]),
      found('SI'),
    );

    await user.click(moveCountry());

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue(country('SI')),
    );
    expect(keyFields()).toHaveLength(0);
    expect(api.of('POST', RESOLVE)[0]?.body).toEqual({ values: ['Slovenija'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes(api)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('PUT', PUT)).toHaveLength(1));
    expect(api.of('PUT', PUT)[0]?.body).toMatchObject({
      country: 'SI',
      attributes: [],
      version: 3,
    });
  });

  it('FR-013-20: dvoumna država – okno pokaže vrednost in kandidate; brez izbire prenos ni mogoč', async () => {
    const { user, api } = await openEdit(
      withAttributes([{ key: 'Država', value: 'Korea' }]),
      (values) =>
        resolveReply(
          values.map((input) => ({
            input,
            status: 'AMBIGUOUS' as const,
            candidates: ['KP', 'KR'],
          })),
        ),
    );

    await user.click(moveCountry());

    const dialog = await dialogOf();
    expect(definitions(dialog)).toContain('Korea');
    expect(dialog.getAllByRole('radio').map((radio) => radio.parentElement?.textContent)).toEqual([
      country('KR'),
      country('KP'),
    ]);
    const confirm = dialog.getByRole('button', { name: tr('contacts.transfer.action.country') });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await user.click(confirm);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(writes(api)).toHaveLength(0);

    await user.click(dialog.getByRole('radio', { name: country('KR') }));
    await user.click(dialog.getByRole('button', { name: tr('contacts.transfer.action.country') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue(country('KR'));
    expect(keyFields()).toHaveLength(0);
    expect(writes(api)).toHaveLength(0);
  });

  it('FR-013-20: neprepoznana država – okno zahteva izbiro s celotnega seznama; preklic pusti atribut', async () => {
    const { user } = await openEdit(withAttributes([{ key: 'Country', value: 'Slovenija?!' }]));

    await user.click(moveCountry());

    let dialog = await dialogOf();
    expect(definitions(dialog)).toContain('Slovenija?!');
    expect(
      dialog.getByRole('button', { name: tr('contacts.transfer.action.country') }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(dialog.getByRole('button', { name: tr('contacts.transfer.cancel') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(keyFields()).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue('');

    await user.click(moveCountry());
    dialog = await dialogOf();
    await chooseCountry(
      user,
      dialog.getByRole('combobox', { name: name.country() }),
      'sloven',
      country('SI'),
    );
    await user.click(dialog.getByRole('button', { name: tr('contacts.transfer.action.country') }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue(country('SI'));
    expect(keyFields()).toHaveLength(0);
  });

  it('FR-013-20: prepoznana država, ki se razlikuje od izpolnjenega polja, zahteva odločitev', async () => {
    const { user } = await openEdit(
      withAttributes([{ key: 'Država', value: 'SVN' }], { country: 'AT' }),
      found('SI'),
    );

    await user.click(moveCountry());

    const dialog = await dialogOf();
    expect(definitions(dialog)).toEqual(
      expect.arrayContaining(['SVN', country('AT'), country('SI')]),
    );
    await user.click(dialog.getByRole('button', { name: tr('contacts.transfer.replaceField') }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue(country('SI')),
    );
    expect(keyFields()).toHaveLength(0);
  });

  it('FR-013-20: podjetje – prazno polje prejme vrednost brez vprašanja, vrstica se odstrani', async () => {
    const { user, api } = await openEdit(withAttributes([{ key: 'Podjetje', value: 'Acme' }]));

    await user.click(moveCompany());

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: name.company() })).toHaveValue('Acme'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(keyFields()).toHaveLength(0);
    expect(api.of('POST', RESOLVE)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: name.save() }));

    await waitFor(() => expect(api.of('PUT', PUT)).toHaveLength(1));
    expect(api.of('PUT', PUT)[0]?.body).toMatchObject({ company: 'Acme', attributes: [] });
  });

  describe('konflikt podjetja', () => {
    const loaded = () =>
      withAttributes([{ key: 'Company', value: 'Acme' }], { company: 'Acme d.o.o.' });

    it('okno pokaže obe vrednosti; »obdrži vrednost polja« odstrani samo atribut', async () => {
      const { user } = await openEdit(loaded());

      await user.click(moveCompany());

      const dialog = await dialogOf();
      expect(definitions(dialog)).toEqual(expect.arrayContaining(['Acme', 'Acme d.o.o.']));
      await user.click(dialog.getByRole('button', { name: tr('contacts.transfer.keepField') }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('combobox', { name: name.company() })).toHaveValue('Acme d.o.o.');
      expect(keyFields()).toHaveLength(0);
    });

    it('»nadomesti vrednost polja z atributom« prepiše polje in odstrani atribut', async () => {
      const { user, api } = await openEdit(loaded());

      await user.click(moveCompany());
      await user.click(
        (await dialogOf()).getByRole('button', { name: tr('contacts.transfer.replaceField') }),
      );

      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: name.company() })).toHaveValue('Acme'),
      );
      expect(keyFields()).toHaveLength(0);
      expect(writes(api)).toHaveLength(0);
    });

    it('preklic ne spremeni ničesar', async () => {
      const { user } = await openEdit(loaded());

      await user.click(moveCompany());
      await user.click(
        (await dialogOf()).getByRole('button', { name: tr('contacts.transfer.cancel') }),
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('combobox', { name: name.company() })).toHaveValue('Acme d.o.o.');
      expect(keyFields()).toHaveLength(1);
    });
  });

  it('FR-013-20: napaka prepoznavanja pusti atribut in pokaže opozorilo ob vrstici', async () => {
    const { user } = await openEdit(
      withAttributes([{ key: 'Država', value: 'Slovenija' }]),
      undefined,
      true,
    );

    await user.click(moveCountry());

    expect(await screen.findByRole('alert')).toHaveTextContent(tr('contacts.transfer.failed'));
    expect(keyFields()).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: name.country() })).toHaveValue('');
  });

  it('FR-013-20: v angleškem vmesniku so besedila in imena držav angleška', async () => {
    await i18n.changeLanguage('en');
    const { user } = await openEdit(
      withAttributes([{ key: 'Country', value: 'Slovenia' }]),
      found('SI'),
    );

    await user.click(screen.getByRole('button', { name: 'Move to the Country field' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toHaveValue('Slovenia'),
    );
  });

  it('FR-013-20: axe brez kršitev (obrazec z opombo in pogovorno okno)', async () => {
    const { user, container } = await openEdit(
      withAttributes([{ key: 'Company', value: 'Acme' }], { company: 'Acme d.o.o.' }),
    );
    expect((await axe(container)).violations).toEqual([]);

    await user.click(moveCompany());

    await screen.findByRole('dialog');
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
