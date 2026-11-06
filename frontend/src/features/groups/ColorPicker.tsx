import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError, focusRing } from '../../shared/ui/styles';
import { COLOR_SWATCH } from './colors';
import { GROUP_COLORS, type GroupColor } from './types';

/**
 * Izbira barve skupine (design.md 4.2): skupina nativnih izbirnih gumbov (D-15) z vzorcem 24 × 24 px in imenom barve.
 * Napaka (FR-002-02) je povezana s skupino prek aria-describedby.
 */
export function ColorPicker({
  value,
  onChange,
  error,
}: {
  value: GroupColor;
  onChange: (color: GroupColor) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const legend = useId();
  const errorId = useId();
  const name = useId();

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legend}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="flex flex-col gap-2"
    >
      <legend id={legend} className="mb-2 font-bold">
        {t('groups.form.color')}
      </legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {GROUP_COLORS.map((color) => (
          <label key={color} className="flex min-h-11 items-center gap-2 pointer-coarse:min-h-12">
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className={`size-5 accent-primary ${focusRing}`}
            />
            <span
              aria-hidden="true"
              className={`inline-block size-6 shrink-0 rounded-sm ${COLOR_SWATCH[color]}`}
            />
            {t(`colors.${color}`)}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={fieldError}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
