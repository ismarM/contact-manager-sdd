import { describe, expect, it } from 'vitest';

import { exportFileName } from './exportFileName';

// Ime datoteke izvoza (FR-010-10; specs/010-izvoz-excel/research.md R-03, data-model.md – Ime datoteke): čista funkcija,
// datum je lokalni datum brskalnika.

const NOV_2 = new Date(2026, 10, 2);

describe('exportFileName', () => {
  it('FR-010-10: »Projekt FERI« → Projekt-FERI-kontakti-2026-11-02.xlsx (sl) in …-contacts-… (en)', () => {
    expect(exportFileName('Projekt FERI', 'sl', NOV_2)).toBe(
      'Projekt-FERI-kontakti-2026-11-02.xlsx',
    );
    expect(exportFileName('Projekt FERI', 'en', NOV_2)).toBe(
      'Projekt-FERI-contacts-2026-11-02.xlsx',
    );
  });

  it('FR-010-10: diakritike in posebni znaki: »Šola: 2./3. letnik?« → Sola-2.-3.-letnik-kontakti-2026-11-02.xlsx', () => {
    expect(exportFileName('Šola: 2./3. letnik?', 'sl', NOV_2)).toBe(
      'Sola-2.-3.-letnik-kontakti-2026-11-02.xlsx',
    );
  });

  it('FR-010-10: naslov brez uporabnih znakov → skupina / group', () => {
    expect(exportFileName('???', 'sl', NOV_2)).toBe('skupina-kontakti-2026-11-02.xlsx');
    expect(exportFileName('???', 'en', NOV_2)).toBe('group-contacts-2026-11-02.xlsx');
  });

  it('FR-010-10: vodilne in končne pike se obrežejo: »..Čaj..« → Caj-kontakti-…', () => {
    expect(exportFileName('..Čaj..', 'sl', NOV_2)).toBe('Caj-kontakti-2026-11-02.xlsx');
  });

  it('FR-010-10: datum je lokalni datum ob 23.30 lokalnega časa, ne UTC', () => {
    expect(exportFileName('Projekt FERI', 'sl', new Date(2026, 10, 2, 23, 30))).toBe(
      'Projekt-FERI-kontakti-2026-11-02.xlsx',
    );
    expect(exportFileName('Projekt FERI', 'sl', new Date(2026, 0, 1, 0, 15))).toBe(
      'Projekt-FERI-kontakti-2026-01-01.xlsx',
    );
  });
});
