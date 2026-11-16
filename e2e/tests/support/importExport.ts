import ExcelJS from 'exceljs';

import { sql } from './groups';

// Pomočniki E2E za 014 (uvoz, vCard, koda QR, CardDAV): datoteke za uvoz in stanje v bazi. Dostopna imena so v testu,
// zbrana na enem mestu (`NAMES`), da sprememba besedila pomeni en popravek.

export const NAMES = {
  importMenu: 'Uvozi',
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
