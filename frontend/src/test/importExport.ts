import { http, HttpResponse, type JsonBodyType } from 'msw';

import type { CardCandidate } from '../features/contacts/qr/vcardTypes';
import type { ImportSheet, PreviewRow } from '../features/import/types';
import { server } from './msw';
import { tr } from './smartAttributes';

// Skupni pomočniki za teste 014 (uvoz, vCard, koda QR, gesla za aplikacijo): dostopna imena iz prevodov in odgovori
// MSW (constitution §3.3).

export const names = {
  importMenu: () => tr('contacts.importMenu.button'),
  fromExcel: () => tr('contacts.importMenu.xlsx'),
  fromVcf: () => tr('contacts.importMenu.vcf'),
  xlsxFile: () => tr('import.fileXlsx'),
  vcfFile: () => tr('import.fileVcf'),
  read: () => tr('import.read'),
  targetFor: (column: string) => tr('import.mapping.targetFor', { column }),
  keyFor: (column: string) => tr('import.mapping.keyFor', { column }),
  typeFor: (column: string) => tr('import.mapping.typeFor', { column }),
  target: (target: string) => tr(`import.mapping.targets.${target}`),
  confirm: (count: number) => tr('import.confirm', { count }),
  countryFor: (text: string) => tr('import.countries.choose', { text }),
  decision: (row: number) => tr('import.preview.decision', { row }),
  skip: () => tr('import.preview.skip'),
  create: () => tr('import.preview.create'),
  retry: () => tr('import.retry'),
  qrShare: () => tr('contacts.qrShare.button'),
  qrAlt: (name: string) => tr('contacts.qrShare.alt', { name }),
  qrDownload: () => tr('contacts.qrShare.download'),
  qrScan: () => tr('contacts.qrScan.button'),
  pickImage: () => tr('contacts.qrScan.pickImage'),
  vcardDownload: () => tr('contacts.vcard.download'),
  newPassword: () => tr('account.appPasswords.create'),
  deviceName: () => tr('account.appPasswords.nameLabel'),
  createPassword: () => tr('account.appPasswords.createSubmit'),
  revoke: (name: string) => tr('account.appPasswords.revoke', { name }),
  revokeConfirm: () => tr('account.appPasswords.revokeConfirm'),
  close: () => tr('account.appPasswords.close'),
};

export { tr };

export interface RecordedImport {
  /** Parametri poizvedbe `format` in `language` (telo multipart se v jsdom ne bere). */
  parse: URLSearchParams[];
  preview: CardCandidate[][];
  commit: { source: string; contacts: Record<string, unknown>[] }[];
}

type Reply = { status: number; body?: JsonBodyType } | 'network-error';

const reply = (value: Reply) =>
  value === 'network-error'
    ? HttpResponse.error()
    : HttpResponse.json(value.body ?? null, { status: value.status });

/**
 * Posnetek API uvoza: `parse` vrne dani odgovor, `preview` po privzetem vsak kandidat brez napak in brez države,
 * `commit` po privzetem `201` s številom kontaktov. Vrne zabeležene zahtevke.
 */
export function mockImportApi(handlers: {
  parse?: () => Reply;
  preview?: (candidates: CardCandidate[]) => Reply;
  commit?: (body: { source: string; contacts: Record<string, unknown>[] }) => Reply;
}): RecordedImport {
  const recorded: RecordedImport = { parse: [], preview: [], commit: [] };
  server.use(
    http.post('/api/groups/:groupId/imports/parse', ({ request }) => {
      recorded.parse.push(new URL(request.url).searchParams);
      return reply(handlers.parse ? handlers.parse() : { status: 400 });
    }),
    http.post('/api/groups/:groupId/imports/preview', async ({ request }) => {
      const body = (await request.json()) as { candidates: CardCandidate[] };
      recorded.preview.push(body.candidates);
      return reply(
        handlers.preview
          ? handlers.preview(body.candidates)
          : {
              status: 200,
              body: {
                rows: body.candidates.map((_, i) => previewRow(i)),
              } as unknown as JsonBodyType,
            },
      );
    }),
    http.post('/api/groups/:groupId/imports', async ({ request }) => {
      const body = (await request.json()) as {
        source: string;
        contacts: Record<string, unknown>[];
      };
      recorded.commit.push(body);
      return reply(
        handlers.commit
          ? handlers.commit(body)
          : { status: 201, body: { created: body.contacts.length, auditEntryId: 'e1' } },
      );
    }),
  );
  return recorded;
}

export function previewRow(index: number, overrides: Partial<PreviewRow> = {}): PreviewRow {
  return {
    index,
    errors: [],
    country: { status: 'EMPTY', code: null, candidates: [] },
    duplicate: null,
    normalized: { attributeKeys: [], tags: [] },
    ...overrides,
  };
}

export function sheet(
  headers: string[],
  rows: string[][],
  overrides: Partial<ImportSheet> = {},
): ImportSheet {
  return {
    format: 'XLSX',
    sheetCount: 1,
    headers,
    suggestedMapping: headers.map((header, column) => ({
      column,
      target: 'ATTRIBUTE',
      key: header,
    })),
    rows: rows.map((cells, i) => ({ rowNumber: i + 2, cells })),
    ...overrides,
  };
}

/** Datoteka za polje *Datoteka* (vsebino prebere strežnik – v testu MSW). */
export function file(name: string, size = 10, type = ''): File {
  return new File([new Uint8Array(size)], name, { type });
}
