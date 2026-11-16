import { useTranslation } from 'react-i18next';

import { focusRing } from '../../../shared/ui/styles';
import { typeNameKey } from '../../attributes/typeNames';
import { ATTRIBUTE_TYPES, type AttributeType } from '../../attributes/types';

/**
 * Izbira tipa ključa atributa (FR-016-01): ime tipa je vedno iz prevodov (`attributes.types.<TIP>`). Oznako izriše
 * komponenta; napako ali pojasnilo klicatelj poveže z `aria-describedby`.
 */
export function TypeSelect({
  id,
  label,
  value,
  onChange,
  onBlur,
  disabled = false,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  id: string;
  label?: string;
  value: AttributeType;
  onChange: (type: AttributeType) => void;
  onBlur?: () => void;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-bold">
        {label ?? t('attributes.type.new')}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value as AttributeType)}
        onBlur={onBlur}
        className={`w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground aria-[invalid=true]:border-destructive ${focusRing}`}
      >
        {ATTRIBUTE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(typeNameKey(type))}
          </option>
        ))}
      </select>
    </div>
  );
}
