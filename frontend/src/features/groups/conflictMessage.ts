import type { UserRef } from './types';

/**
 * Besedilo opozorila o konfliktu verzij (design.md 8.14, FR-002-12): kdo (ime, sicer e-naslov; `null` = izbrisan
 * uporabnik) in kdaj (ura v zapisu jezika; datum, če sprememba ni bila na isti dan kot `now`). Ogrodje (T008):
 * implementacija v T045.
 */
export function conflictMessage(
  updatedBy: UserRef | null,
  updatedAt: string,
  language: 'sl' | 'en',
  now: Date,
): string {
  void updatedBy;
  void updatedAt;
  void language;
  void now;
  throw new Error('not implemented');
}
