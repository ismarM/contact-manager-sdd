import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { GROUP_ID, renderContactsApp } from '../../test/contactsApi';
import { file, mockImportApi, names, previewRow, sheet, tr } from '../../test/importExport';

const PATH = `/groups/${GROUP_ID}/contacts/import`;

const EXPORTED = sheet(
  ['Ime', 'Priimek', 'E-naslov', 'Država', 'Značke', 'Mobitel', 'Opombe interno'],
  [
    ['Ana', 'Kos', 'ana@primer.si', 'Avstrija', 'a, b', '041 1', 'x'],
    ['Bor', 'Zupan', 'ni-email', 'Kongo', '', '', ''],
    ['Cene', 'Novak', '', 'Atlantida', '', '', ''],
  ],
  {
    suggestedMapping: [
      { column: 0, target: 'FIRST_NAME', key: null },
      { column: 1, target: 'LAST_NAME', key: null },
      { column: 2, target: 'EMAIL', key: null },
      { column: 3, target: 'COUNTRY', key: null },
      { column: 4, target: 'TAGS', key: null },
      { column: 5, target: 'ATTRIBUTE', key: 'Mobitel' },
      { column: 6, target: 'ATTRIBUTE', key: 'Opombe interno' },
    ],
  },
);

async function upload(source: 'xlsx' | 'vcf' = 'xlsx', name = 'kontakti.xlsx') {
  const user = userEvent.setup();
  const label = source === 'xlsx' ? names.xlsxFile() : names.vcfFile();
  await user.upload(await screen.findByLabelText(label), file(name));
  await user.click(screen.getByRole('button', { name: names.read() }));
  return user;
}

describe('ImportPage (014)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-014-02 FR-014-03: preslikava se uporabi v brskalniku, predogled pokaže napake po vrsticah in povzetek', async () => {
    const api = mockImportApi({
      parse: () => ({ status: 200, body: EXPORTED as unknown as JsonBodyType }),
      preview: (candidates) => ({
        status: 200,
        body: {
          rows: candidates.map((_, i) =>
            i === 1
              ? previewRow(i, { errors: [{ field: 'email', code: 'INVALID_VALUE' }] })
              : previewRow(i),
          ),
        } as unknown as JsonBodyType,
      }),
    });
    const { container } = renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = await upload();

    await user.selectOptions(
      await screen.findByLabelText(names.targetFor('Mobitel')),
      names.target('PHONE'),
    );
    await user.selectOptions(
      screen.getByLabelText(names.targetFor('Opombe interno')),
      names.target('SKIP'),
    );

    await waitFor(() => expect(api.preview.at(-1)?.[0]?.phone).toBe('041 1'));
    const sent = api.preview.at(-1)!;
    expect(sent[0]).toMatchObject({
      firstName: 'Ana',
      lastName: 'Kos',
      email: 'ana@primer.si',
      countryText: 'Avstrija',
      tags: ['a', 'b'],
      attributes: [],
    });
    expect(api.parse[0]?.get('format')).toBe('XLSX');
    const preview = screen.getByRole('region', { name: tr('import.preview.heading') });
    await waitFor(() =>
      expect(within(preview).getAllByRole('status')[0]).toHaveTextContent(
        `${tr('import.preview.ready', { count: 2 })} ${tr('import.preview.invalid', { count: 1 })}`,
      ),
    );
    const table = screen.getByRole('table', { name: tr('import.preview.table') });
    // FR-014-13: predogled pokaže prebrane vrednosti vrstice.
    expect(within(table).getByRole('row', { name: /^2 Ana Kos/ })).toHaveTextContent('041 1');
    expect(within(table).getByRole('row', { name: /^3 Bor Zupan/ })).toHaveTextContent(
      tr('import.preview.fieldError', {
        field: tr('import.preview.fields.email'),
        reason: tr('import.preview.reasons.INVALID_VALUE'),
      }),
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-014-02: dva stolpca ne moreta imeti istega predefiniranega cilja', async () => {
    mockImportApi({ parse: () => ({ status: 200, body: EXPORTED as unknown as JsonBodyType }) });
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = await upload();

    await user.selectOptions(
      await screen.findByLabelText(names.targetFor('Mobitel')),
      names.target('EMAIL'),
    );

    expect(screen.getByLabelText(names.targetFor('Mobitel'))).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(names.targetFor('Mobitel'))).toHaveAccessibleDescription(
      tr('import.mapping.duplicateTarget'),
    );
  });

  it('FR-014-04 FR-014-05: neprepoznane države se razrešijo enkrat za vse vrstice, nato uvoz pošlje kode', async () => {
    const api = mockImportApi({
      parse: () => ({ status: 200, body: EXPORTED as unknown as JsonBodyType }),
      preview: (candidates) => ({
        status: 200,
        body: {
          rows: candidates.map((c, i) =>
            previewRow(i, {
              country:
                c.countryText === 'Avstrija'
                  ? { status: 'FOUND', code: 'AT', candidates: [] }
                  : c.countryText === 'Kongo'
                    ? { status: 'AMBIGUOUS', code: null, candidates: ['CD', 'CG'] }
                    : { status: 'UNKNOWN', code: null, candidates: [] },
            }),
          ),
        } as unknown as JsonBodyType,
      }),
    });
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = await upload();
    const confirm = await screen.findByRole('button', { name: names.confirm(3) });

    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(tr('import.countries.unresolved'));
    await user.selectOptions(screen.getByLabelText(names.countryFor('Kongo')), 'CG');
    await user.selectOptions(
      screen.getByLabelText(names.countryFor('Atlantida')),
      tr('import.countries.leaveEmpty'),
    );
    await user.click(confirm);

    await waitFor(() => expect(api.commit).toHaveLength(1));
    expect(api.commit[0]!.source).toBe('XLSX');
    expect(api.commit[0]!.contacts.map((c) => c.country)).toEqual(['AT', 'CG', null]);
    expect(api.commit[0]!.contacts[0]).not.toHaveProperty('countryText');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: tr('toast.region') })).toHaveTextContent(
        tr('import.done', { count: 3 }),
      ),
    );
  });

  it('FR-014-09: dvojnik je privzeto preskočen; izbira Ustvari ga vključi v uvoz', async () => {
    const api = mockImportApi({
      parse: () => ({ status: 200, body: EXPORTED as unknown as JsonBodyType }),
      preview: (candidates) => ({
        status: 200,
        body: {
          rows: candidates.map((_, i) =>
            i === 0
              ? previewRow(i, {
                  duplicate: { reason: 'EMAIL', contactName: 'Ana Kos', inFileIndex: null },
                })
              : previewRow(i),
          ),
        } as unknown as JsonBodyType,
      }),
    });
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = await upload();

    expect(
      await screen.findByRole('group', {
        name: tr('import.preview.duplicateEMAIL', { name: 'Ana Kos' }),
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: tr('import.preview.heading') })).getAllByRole(
        'status',
      )[0],
    ).toHaveTextContent(tr('import.preview.skipped', { count: 1 }));
    const decision = screen.getByRole('radiogroup', { name: names.decision(2) });
    expect(within(decision).getByRole('radio', { name: names.skip() })).toBeChecked();
    await user.click(screen.getByRole('button', { name: names.confirm(2) }));
    await waitFor(() => expect(api.commit).toHaveLength(1));
    expect(api.commit[0]!.contacts.map((c) => c.firstName)).toEqual(['Bor', 'Cene']);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: tr('toast.region') })).toHaveTextContent(
        `${tr('import.done', { count: 2 })} ${tr('import.doneSkipped', { count: 1 })}`,
      ),
    );
  });

  it('FR-014-05: napaka strežnika pusti predogled odprt s Poskusi znova; ponovni poskus uspe', async () => {
    let attempts = 0;
    const api = mockImportApi({
      parse: () => ({ status: 200, body: EXPORTED as unknown as JsonBodyType }),
      commit: (body) => {
        attempts += 1;
        return attempts === 1
          ? { status: 500 }
          : { status: 201, body: { created: body.contacts.length, auditEntryId: 'e' } };
      },
    });
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = await upload();

    await user.click(await screen.findByRole('button', { name: names.confirm(3) }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(tr('import.failed'));
    expect(screen.getByRole('table', { name: tr('import.preview.table') })).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: names.retry() }));

    await waitFor(() => expect(api.commit).toHaveLength(2));
  });

  it('FR-014-08: prevelika datoteka se zavrne že v brskalniku, napaka strežnika pove razlog', async () => {
    const api = mockImportApi({
      parse: () => ({
        status: 400,
        body: { code: 'VALIDATION_FAILED', errors: [{ field: 'file', code: 'NOT_XLSX' }] },
      }),
    });
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'EDITOR' });
    const user = userEvent.setup();

    await user.upload(
      await screen.findByLabelText(names.xlsxFile()),
      file('velika.xlsx', 10 * 1024 * 1024 + 1),
    );
    await user.click(screen.getByRole('button', { name: names.read() }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      tr('import.fileErrors.FILE_TOO_LARGE'),
    );
    expect(api.parse).toHaveLength(0);

    await user.upload(screen.getByLabelText(names.xlsxFile()), file('ni.xlsx'));
    await user.click(screen.getByRole('button', { name: names.read() }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tr('import.fileErrors.NOT_XLSX'));
  });

  it('FR-014-13: vizitke preskočijo preslikavo, predogled opozori na izpuščene fotografije', async () => {
    const api = mockImportApi({
      parse: () => ({
        status: 200,
        body: {
          format: 'VCF',
          omitted: ['PHOTO'],
          candidates: [
            {
              firstName: 'Janez',
              lastName: 'Novak',
              address: null,
              email: 'janez@doma.si',
              phone: null,
              company: null,
              countryText: null,
              attributes: [{ key: 'E-naslov 2', value: 'janez@delo.si' }],
              tags: [],
            },
          ],
        },
      }),
    });
    renderContactsApp(`${PATH}?source=vcf`, { role: 'EDITOR' });
    const user = await upload('vcf', 'kontakti.vcf');

    expect(await screen.findByRole('note')).toHaveTextContent(tr('import.omittedPhoto'));
    expect(screen.queryByLabelText(names.targetFor('Ime'))).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: names.confirm(1) }));
    await waitFor(() => expect(api.commit[0]?.source).toBe('VCF'));
    expect(api.parse[0]?.get('format')).toBe('VCF');
  });

  it.each(['VIEWER'] as const)('FR-014-01: %s nima strani uvoza', async (role) => {
    renderContactsApp(`${PATH}?source=xlsx`, { role });

    expect(
      await screen.findByRole('heading', { name: tr('notFound.heading') }),
    ).toBeInTheDocument();
  });

  it('FR-014-01: arhivirana skupina nima strani uvoza', async () => {
    renderContactsApp(`${PATH}?source=xlsx`, { role: 'OWNER', archived: true });

    expect(
      await screen.findByRole('heading', { name: tr('notFound.heading') }),
    ).toBeInTheDocument();
  });
});
