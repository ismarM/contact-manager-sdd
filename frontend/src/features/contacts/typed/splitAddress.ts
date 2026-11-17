import { type AddressDraft, EMPTY_ADDRESS } from './addressDraft';

/** Vrstica s poštno številko in krajem: prvi del 3–10 znakov z vsaj eno števko, nato kraj (R-04). */
const POSTAL_LINE = /^(\S{3,10})\s+(\S.*)$/;

/**
 * Preprosta razčlenitev nerazčlenjenega naslova (016, FR-016-14; research R-04): prva vrstica je ulica, vrstica s
 * poštno številko in krajem se razdeli, ostalo (neprepoznano) gre v dodatno vrstico. Ena vrstica z vejicami se
 * razdeli po vejicah. Država je predizpolnjena z državo kontakta. Rezultat je samo predlog za obrazec.
 */
export function splitAddress(text: string, country = ''): AddressDraft {
  let lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '');
  if (lines.length === 1 && lines[0]!.includes(',')) {
    lines = lines[0]!
      .split(',')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
  const draft: AddressDraft = { ...EMPTY_ADDRESS, country };
  if (lines.length === 0) return draft;

  // Poštna vrstica: zadnja ustrezna, pri več vrsticah ne prva (prva je ulica, npr. »1600 Pennsylvania Avenue«).
  let postalIndex = -1;
  for (let index = lines.length - 1; index >= (lines.length === 1 ? 0 : 1); index -= 1) {
    const match = POSTAL_LINE.exec(lines[index]!);
    if (match && /\d/.test(match[1]!)) {
      postalIndex = index;
      draft.postalCode = match[1]!;
      draft.city = match[2]!;
      break;
    }
  }
  const rest = lines.filter((_, index) => index !== postalIndex);
  if (postalIndex !== 0 && rest.length > 0) {
    draft.street = rest.shift()!;
  }
  draft.extra = rest.join(', ');
  if (draft.street === '' && draft.city === '' && draft.extra !== '') {
    // Brez prepoznane ulice ali kraja: besedilo ostane v ulici, da je naslov veljaven in ga uporabnik popravi.
    draft.street = draft.extra;
    draft.extra = '';
  }
  return draft;
}
