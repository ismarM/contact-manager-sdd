import { useCallback } from 'react';

import type { Address } from '../attributes/types';
import { countryName } from '../contacts/countries';
import { useUiLanguage } from '../contacts/useUiLanguage';
import { useFormatters } from '../formats/useFormatters';
import type { AttributeType } from '../attributes/types';
import type { AttributeChangeValue, ChangeFieldName, ChangeValue } from './types';

/** Vrednost atributa s tipom (`type` je vedno prisoten); deli naslova nimajo polja `type`. */
export function isAttributeValue(value: ChangeValue): value is AttributeChangeValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value;
}

/** Tip atributa pred in po, kadar se je spremenil (»Drugo → Telefon«); sicer `null`. */
export function typeChange(
  before: ChangeValue,
  after: ChangeValue,
): [AttributeType, AttributeType] | null {
  if (!before || !after || !isAttributeValue(before) || !isAttributeValue(after)) return null;
  return before.type === after.type ? null : [before.type, after.type];
}

function isAddress(value: ChangeValue): value is Address {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !('type' in value);
}

/**
 * Besedilo vrednosti spremembe po prikaznih shemah uporabnika (FR-016-16, FR-016-26): telefon, datum in naslov
 * (deli ali besedilo) prek skupnih oblikovalnikov, država z imenom v jeziku vmesnika; značke ločene z vejico.
 * `null` = prazno. Časovni žigi sledi se ne oblikujejo tukaj (niso vrednost tipa Datum).
 */
export function useChangeText(): (field: ChangeFieldName, value: ChangeValue) => string | null {
  const format = useFormatters();
  const language = useUiLanguage();
  return useCallback(
    (field, value) => {
      if (value === null) return null;
      if (Array.isArray(value)) return value.join(', ');
      if (isAttributeValue(value)) {
        if (value.parts) return format.address(value.parts, true);
        return value.value === undefined ? null : format.byType(value.type, value.value);
      }
      if (isAddress(value)) return format.address(value, true);
      if (field === 'COUNTRY' && value) return countryName(value, language);
      if (field === 'PHONE' && value) return format.phone(value);
      return value;
    },
    [format, language],
  );
}
