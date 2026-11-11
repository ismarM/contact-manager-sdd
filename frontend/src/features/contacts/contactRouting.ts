import type { GroupDetail, UserRef } from '../groups/types';
import { type ContactQuery, serializeQuery } from './contactQuery';

// Stanje seznama v naslovu poti (FR-004-09, FR-008-09, research R-11) in pravice za akcije kontaktov (FR-004-17).

/** Sporočilo nad seznamom po dejanju (izbris izbrisanega kontakta, konflikt pri izbrisu iz vrstice). */
export type ListNotice =
  { kind: 'gone' } | { kind: 'conflict'; updatedBy: UserRef | null; updatedAt: string };

/**
 * Poizvedba seznama (`?q=…&page=2`, kanonično) za povezave na kontakt in obrazec: *Nazaj*, »Nazaj na seznam kontaktov«
 * in »Zapri podrobnosti« vrnejo na isto stanje seznama (FR-008-09).
 */
export function listState(query: ContactQuery): string {
  return serializeQuery(query);
}

/** Ustvarjanje, urejanje in izbris: urednik ali višje v nearhivirani skupini (FR-004-07, FR-004-15, FR-004-17). */
export function canEditContacts(group: GroupDetail): boolean {
  return !group.archived && group.role !== 'VIEWER';
}
