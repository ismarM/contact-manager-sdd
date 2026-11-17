import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

import type { PhoneFormat } from './types';

/**
 * Prikaz telefona po shemi (FR-016-16): *Mednarodno* »+386 41 123 456« (privzeto), *Nacionalno* »041 123 456« v
 * obliki države številke, *E.164* »+38641123456«. Vrednost, ki je ni mogoče razčleniti, ostane kanonična.
 */
export function formatPhone(value: string, format: PhoneFormat | null): string {
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed?.isValid()) return value;
  switch (format) {
    case 'NATIONAL':
      return parsed.formatNational();
    case 'E164':
      return parsed.number;
    default:
      return parsed.formatInternational();
  }
}
