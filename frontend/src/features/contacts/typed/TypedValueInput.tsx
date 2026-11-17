import type { AttributeType } from '../../attributes/types';
import { textInput } from '../../../shared/ui/styles';
import { SuggestInput } from '../SuggestInput';

/**
 * Polje vrednosti atributa po tipu ključa (FR-016-01, FR-016-03): `email` in `tel` s ustrezno tipkovnico, spletni naslov
 * kot besedilo (strežnik dopolni shemo), datum z izbirnikom datuma, opombe večvrstično; tip `OTHER` ohrani predloge
 * vrednosti (013). Tip `ADDRESS` je do strukturiranega naslova besedilo v več vrsticah. Oznako in napako izriše
 * klicatelj (`id`, `aria-*`); preverjanje in normalizacija sta na strežniku.
 */
export function TypedValueInput({
  id,
  type,
  value,
  onChange,
  onBlur,
  keyParam,
  listLabel,
  ...aria
}: {
  id: string;
  type: AttributeType;
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  /** Ključ atributa (predlogi vrednosti pri tipu `OTHER`). */
  keyParam?: string;
  listLabel: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  if (type === 'OTHER') {
    return (
      <SuggestInput
        id={id}
        type="value"
        keyParam={keyParam}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        listLabel={listLabel}
        {...aria}
      />
    );
  }
  if (type === 'NOTES' || type === 'ADDRESS') {
    return (
      <textarea
        id={id}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={textInput}
        {...aria}
      />
    );
  }
  const input =
    type === 'EMAIL'
      ? { type: 'email', inputMode: 'email' as const, autoComplete: 'off' }
      : type === 'PHONE'
        ? { type: 'tel', inputMode: 'tel' as const, autoComplete: 'off' }
        : type === 'URL'
          ? { type: 'text', inputMode: 'url' as const, autoComplete: 'off' }
          : { type: 'date', inputMode: undefined, autoComplete: 'off' };
  return (
    <input
      id={id}
      {...input}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      className={textInput}
      {...aria}
    />
  );
}
