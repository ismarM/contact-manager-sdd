import type { GroupDetail, UserRef } from '../groups/types';

// Stanje seznama v naslovu poti (FR-004-09, research R-11) in pravice za akcije kontaktov (FR-004-17).

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_SIZE = 25;

/** Sporočilo nad seznamom po dejanju (izbris izbrisanega kontakta, konflikt pri izbrisu iz vrstice). */
export type ListNotice =
  { kind: 'gone' } | { kind: 'conflict'; updatedBy: UserRef | null; updatedAt: string };

/** Stran (1-osna) in velikost iz poizvedbe; neveljavne vrednosti so privzete. */
export function readPaging(params: URLSearchParams): { page: number; size: number } {
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SIZE,
  };
}

/** Poizvedba seznama brez privzetih vrednosti (stran 1, velikost 25). */
export function listSearch(page: number, size: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (size !== DEFAULT_SIZE) params.set('size', String(size));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Ustvarjanje, urejanje in izbris: urednik ali višje v nearhivirani skupini (FR-004-07, FR-004-15, FR-004-17). */
export function canEditContacts(group: GroupDetail): boolean {
  return !group.archived && group.role !== 'VIEWER';
}
