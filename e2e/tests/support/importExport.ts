import type { Page } from '@playwright/test';
import ExcelJS from 'exceljs';

import { sql } from './groups';

// Pomočniki E2E za 014 (uvoz, vCard, koda QR, CardDAV): datoteke za uvoz in stanje v bazi. Dostopna imena so v testu,
// zbrana na enem mestu (`NAMES`), da sprememba besedila pomeni en popravek.

export const NAMES = {
  importMenu: 'Uvozi',
  actionsMenu: 'Dejanja',
  actionsImportExcel: 'Uvozi iz Excela (.xlsx)',
  actionsImportVcf: 'Uvozi iz vizitk (.vcf)',
  fromExcel: 'Iz Excela (.xlsx)',
  fromVcf: 'Iz vizitk (.vcf)',
  xlsxFile: 'Preglednica Excel (.xlsx)',
  vcfFile: 'Datoteka vizitk (.vcf)',
  read: 'Preberi datoteko',
  vcfSelection: 'Izvozi v vCard (.vcf)',
  qrShare: 'Deli s kodo QR',
  qrDownload: 'Prenesi sliko',
  qrScan: 'Dodaj s kodo QR',
  pickImage: 'Izberi sliko',
  save: 'Shrani kontakt',
  newPassword: 'Novo geslo',
  deviceName: 'Ime naprave',
  createPassword: 'Ustvari geslo',
  close: 'Zapri',
  revokeConfirm: 'Prekliči geslo',
  revoke: (name: string) => `Prekliči geslo ${name}`,
  confirm: (count: number) =>
    count === 1
      ? `Uvozi ${count} kontakt`
      : count === 2
        ? `Uvozi ${count} kontakta`
        : count === 3 || count === 4
          ? `Uvozi ${count} kontakte`
          : `Uvozi ${count} kontaktov`,
};

/** Datoteka `.xlsx` (prvi seznam je glava) kot medpomnilnik za `setInputFiles`. */
export async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kontakti');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function lastAction(groupId: string): { action: string; count: number } | null {
  const row = sql(
    `select action || '|' || contact_count from audit_entry where group_id = '${groupId}'::uuid order by seq desc limit 1`,
  )
    .split('\n')[0]
    ?.trim();
  if (!row) return null;
  const [action, count] = row.split('|');
  return { action: action ?? '', count: Number(count) };
}

export function namesIn(groupId: string): string[] {
  return sql(
    `select coalesce(first_name, '') || ' ' || coalesce(last_name, '') from contact where group_id = '${groupId}'::uuid order by 1`,
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function basic(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`;
}

/**
 * Dejanja seznama kontaktov: od 1280 px ločena gumba *Uvozi* in *Dodaj s kodo QR*, na ožjih zaslonih meni *Dejanja*
 * s postavkami *Uvozi iz Excela (.xlsx)*, *Uvozi iz vizitk (.vcf)* in *Dodaj s kodo QR*.
 */
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280;

/** Odpre uvoz iz Excela ali vizitk na seznamu kontaktov (gumb *Uvozi* ali meni *Dejanja*). */
export async function startImport(page: Page, source: 'xlsx' | 'vcf') {
  if (wide(page)) {
    await page.getByRole('button', { name: NAMES.importMenu, exact: true }).click();
    await page
      .getByRole('menuitem', { name: source === 'xlsx' ? NAMES.fromExcel : NAMES.fromVcf })
      .click();
    return;
  }
  await page.getByRole('button', { name: NAMES.actionsMenu, exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: source === 'xlsx' ? NAMES.actionsImportExcel : NAMES.actionsImportVcf,
    })
    .click();
}

/** Odpre okno *Dodaj s kodo QR* (gumb ali postavka menija *Dejanja*). */
export async function openQrScan(page: Page) {
  if (wide(page)) {
    await page.getByRole('button', { name: NAMES.qrScan, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: NAMES.actionsMenu, exact: true }).click();
  await page.getByRole('menuitem', { name: NAMES.qrScan }).click();
}

const SELECTION_EXPORT = {
  sl: {
    toolbar: 'Dejanja izbora',
    xlsx: 'Izvozi v Excel',
    vcf: 'Izvozi v vCard (.vcf)',
    menu: 'Izvozi',
    menuXlsx: 'V Excel (.xlsx)',
    menuVcf: 'V vizitke (.vcf)',
  },
  en: {
    toolbar: 'Selection actions',
    xlsx: 'Export to Excel',
    vcf: 'Export to vCard (.vcf)',
    menu: 'Export',
    menuXlsx: 'To Excel (.xlsx)',
    menuVcf: 'To business cards (.vcf)',
  },
} as const;

/**
 * Izvoz v vrstici izbora: od 1280 px ločena gumba *Izvozi v Excel* in *Izvozi v vCard (.vcf)*, na ožjih zaslonih en meni
 * *Izvozi* s postavkama. Vrne gumb (široko) oziroma sproži meni in vrne postavko (ozko), da test sam klikne ali pritisne.
 */
export function selectionExportControl(page: Page, language: 'sl' | 'en' = 'sl') {
  const names = SELECTION_EXPORT[language];
  const bar = page.getByRole('toolbar', { name: names.toolbar });
  return wide(page)
    ? bar.getByRole('button', { name: names.xlsx, exact: true })
    : bar.getByRole('button', { name: names.menu, exact: true });
}

/** Klikne izvoz izbranih v Excel ali vizitke (gumb od 1280 px, sicer meni *Izvozi*). */
export async function exportSelection(
  page: Page,
  format: 'xlsx' | 'vcf' = 'xlsx',
  language: 'sl' | 'en' = 'sl',
) {
  const names = SELECTION_EXPORT[language];
  const bar = page.getByRole('toolbar', { name: names.toolbar });
  if (wide(page)) {
    await bar
      .getByRole('button', { name: format === 'xlsx' ? names.xlsx : names.vcf, exact: true })
      .click();
    return;
  }
  await bar.getByRole('button', { name: names.menu, exact: true }).click();
  await page
    .getByRole('menuitem', { name: format === 'xlsx' ? names.menuXlsx : names.menuVcf })
    .click();
}
