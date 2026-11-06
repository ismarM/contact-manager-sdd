import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldError, textInput } from '../../shared/ui/styles';
import { ColorPicker } from './ColorPicker';
import type { GroupFieldError, GroupValidation } from './groupValidation';
import type { GroupColor } from './types';

export interface GroupFormState {
  title: string;
  description: string;
  color: GroupColor;
}

/**
 * Polja *Naslov*, *Opis* in *Barva* (design.md 8.2, 9.2, 9.7) za dialog *Nova skupina* in *Podatki skupine*. Napaka je ob
 * polju (aria-invalid, aria-describedby); polje nima atributa required, da preverjanje ostane v aplikaciji (FR-002-02).
 */
export function GroupFormFields({
  values,
  onChange,
  errors,
}: {
  values: GroupFormState;
  onChange: (values: GroupFormState) => void;
  errors: GroupValidation['errors'];
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const titleError = useId();
  const descriptionError = useId();
  const message = (error: GroupFieldError | undefined) =>
    error ? t(`groups.form.errors.${error}`) : undefined;

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="font-bold">
          {t('groups.form.title')}
        </label>
        <input
          id={titleId}
          type="text"
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
          aria-required="true"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? titleError : undefined}
          className={textInput}
        />
        {errors.title && (
          <p id={titleError} className={fieldError}>
            {message(errors.title)}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="font-bold">
          {t('groups.form.description')}
        </label>
        <textarea
          id={descriptionId}
          rows={4}
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? descriptionError : undefined}
          className={textInput}
        />
        {errors.description && (
          <p id={descriptionError} className={fieldError}>
            {message(errors.description)}
          </p>
        )}
      </div>
      <ColorPicker
        value={values.color}
        onChange={(color) => onChange({ ...values, color })}
        error={message(errors.color)}
      />
    </>
  );
}
