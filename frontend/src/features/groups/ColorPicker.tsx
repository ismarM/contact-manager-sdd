import { IconCheck } from '@tabler/icons-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError } from '../../shared/ui/styles';
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
      <legend id={legend} className="mb-2 font-medium">
        {t('groups.form.color')}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GROUP_COLORS.map((color) => (
          <label
            key={color}
            className={`relative flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 text-base has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring pointer-coarse:min-h-12 ${
              value === color
                ? 'border-primary bg-selected font-medium text-foreground'
                : 'border-input bg-card hover:bg-muted'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span
              aria-hidden="true"
              className={`inline-block size-5 shrink-0 rounded-xs ${COLOR_SWATCH[color]}`}
            />
            <span className="flex-1">{t(`colors.${color}`)}</span>
            {value === color && (
              <IconCheck aria-hidden="true" size={16} stroke={1.75} className="text-primary" />
            )}
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
