import type { ReactNode } from 'react';

import { focusRing } from '../../../shared/ui/styles';
import type { AttributeType } from '../../attributes/types';

const LINK = `underline ${focusRing}`;
const SAFE_URL = /^https?:\/\/[^\s]+$/i;
const SAFE_MAIL = /^[^\s@<>"]+@[^\s@<>"]+$/;
const SAFE_TEL = /^\+?[0-9]{3,20}$/;

/**
 * Prikaz vrednosti atributa po tipu (FR-016-03, FR-016-07): e-naslov `mailto:`, telefon `tel:`, spletni naslov
 * https-povezava z `rel="noopener noreferrer"`; opombe in ostalo kot golo besedilo (React ga izriše brez razlage
 * oznak) s ohranjenimi presledki in vrsticami. Vrednost, ki ni varna povezava, je navadno besedilo.
 */
export function TypedValueView({
  type,
  value,
  label,
}: {
  type: AttributeType | undefined;
  value: string;
  /** Dostopno ime povezave (npr. »Odpri …«); privzeto vrednost. */
  label?: (kind: 'mail' | 'call' | 'open') => string;
}): ReactNode {
  if (type === 'EMAIL' && SAFE_MAIL.test(value)) {
    return (
      <a href={`mailto:${value}`} className={LINK} aria-label={label?.('mail')}>
        {value}
      </a>
    );
  }
  if (type === 'PHONE' && SAFE_TEL.test(value)) {
    return (
      <a href={`tel:${value}`} className={LINK} aria-label={label?.('call')}>
        {value}
      </a>
    );
  }
  if (type === 'URL' && SAFE_URL.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
        aria-label={label?.('open')}
      >
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}
