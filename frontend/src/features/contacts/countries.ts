// Države za polje *Država* (specs/013-pametni-atributi, FR-013-13, FR-013-17): statični seznam uradnih kod ISO 3166-1
// alpha-2 (enak kot `Locale.getISOCountries()` v zaledju, brez `XK`); imena prek `Intl.DisplayNames`, brez omrežja.

export type UiLanguage = 'sl' | 'en';

const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export const COUNTRY_CODES: readonly string[] = CODES.split(' ');

const COUNTRY_SET = new Set(COUNTRY_CODES);

export function isCountryCode(code: string): boolean {
  return COUNTRY_SET.has(code);
}

const names = new Map<UiLanguage, Intl.DisplayNames>();

/** Ime države v jeziku vmesnika; neznana koda ostane surova koda. */
export function countryName(code: string, language: UiLanguage): string {
  if (!COUNTRY_SET.has(code)) return code;
  let display = names.get(language);
  if (!display) {
    display = new Intl.DisplayNames([language], { type: 'region' });
    names.set(language, display);
  }
  return display.of(code) ?? code;
}

/** Besedilo za iskanje: brez razlike velikosti črk in strešic. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .trim();
}

export interface CountryOption {
  code: string;
  name: string;
}

const sorted = new Map<UiLanguage, CountryOption[]>();

/** Vse države po abecedi jezika vmesnika. */
export function allCountries(language: UiLanguage): CountryOption[] {
  let list = sorted.get(language);
  if (!list) {
    list = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, language) })).sort((a, b) =>
      a.name.localeCompare(b.name, language),
    );
    sorted.set(language, list);
  }
  return list;
}

/**
 * Države, ki ustrezajo vpisu (ime v jeziku vmesnika ali koda): najprej enaka koda, nato predpona imena, nato vsebovanje;
 * znotraj skupine abecedno. Prazen vpis vrne vse države po abecedi.
 */
export function searchCountries(query: string, language: UiLanguage): CountryOption[] {
  const needle = foldText(query);
  const all = allCountries(language);
  if (needle === '') return all;
  const ranked: { option: CountryOption; rank: number }[] = [];
  for (const option of all) {
    const name = foldText(option.name);
    const code = option.code.toLowerCase();
    const rank =
      code === needle
        ? 0
        : name.startsWith(needle)
          ? 1
          : name.includes(needle) || code.startsWith(needle)
            ? 2
            : -1;
    if (rank >= 0) ranked.push({ option, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.option);
}
