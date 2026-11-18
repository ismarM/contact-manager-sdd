import { IconAlertTriangle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { type FormEvent, type RefObject, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorAlert, fieldError, focusRing, textInput } from '../../shared/ui/styles';
import { type AuthFieldErrors, type AuthFormValues, validateAuthForm } from './passwordValidation';

type Field = keyof AuthFormValues;
const FIELD_ORDER: Field[] = ['email', 'password', 'passwordConfirm'];

/**
 * Stanje obrazca z e-naslovom in geslom (design.md 8.2): preverjanje ob zapustitvi polja in ob oddaji, napaka izgine,
 * ko jo uporabnik začne popravljati; ob neuspešni oddaji povzetek napak dobi fokus.
 */
export function useAuthForm(mode: 'signIn' | 'register', fields: Field[]) {
  const [values, setValues] = useState<AuthFormValues>({
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [summaryVisible, setSummaryVisible] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const visible = (all: AuthFieldErrors): AuthFieldErrors =>
    Object.fromEntries(Object.entries(all).filter(([field]) => fields.includes(field as Field)));

  const change = (field: Field, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const blur = (field: Field) => {
    // Prazno polje ob prvem prehodu ni napaka; preveri se samo vneseno (design.md 8.2).
    if (!values[field]) return;
    const error = visible(validateAuthForm(values, mode))[field];
    setErrors((previous) => ({ ...previous, [field]: error }));
  };

  /** Preveri vsa polja; vrne `true`, če je obrazec veljaven, sicer prikaže povzetek in nanj premakne fokus. */
  const validate = (event: FormEvent): boolean => {
    event.preventDefault();
    const next = visible(validateAuthForm(values, mode));
    setErrors(next);
    const valid = Object.values(next).every((error) => !error);
    setSummaryVisible(!valid);
    if (!valid) queueMicrotask(() => summaryRef.current?.focus());
    return valid;
  };

  return { values, errors, change, blur, validate, summaryVisible, summaryRef };
}

export function ErrorSummary({
  errors,
  fieldIds,
  summaryRef,
}: {
  errors: AuthFieldErrors;
  fieldIds: Partial<Record<Field, string>>;
  summaryRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const entries = FIELD_ORDER.filter((field) => errors[field]);
  if (entries.length === 0) return null;
  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className={`${errorAlert} ${focusRing}`}>
      <IconAlertTriangle aria-hidden="true" size={20} stroke={1.75} className="shrink-0" />
      <div>
        <p>{t('auth.form.summary')}</p>
        <ul className="mt-1 list-disc pl-5">
          {entries.map((field) => (
            <li key={field}>
              <a href={`#${fieldIds[field]}`} className={`underline ${focusRing}`}>
                {t(`auth.form.errors.${errors[field]!}`)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AuthField({
  id,
  label,
  type,
  autoComplete,
  value,
  error,
  hint,
  onChange,
  onBlur,
  readOnly,
  revealable = false,
  describedBy: extraDescribedBy,
}: {
  id: string;
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  readOnly?: boolean;
  /** Gumb za prikaz gesla (FR-020-14): `aria-pressed`, polje se ob prikazu spremeni v besedilno. */
  revealable?: boolean;
  /** Dodatni element, ki opisuje polje (npr. seznam pravil gesla). */
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const errorId = useId();
  const [shown, setShown] = useState(false);
  const describedBy = [hint ? hintId : null, extraDescribedBy, error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <span className="relative block">
        <input
          id={id}
          type={revealable && shown ? 'text' : type}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`h-11 ${textInput} ${revealable ? 'pr-12' : ''}`}
        />
        {revealable && (
          <button
            type="button"
            aria-pressed={shown}
            aria-controls={id}
            aria-label={t('auth.form.showPassword')}
            onClick={() => setShown((value) => !value)}
            className={`absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted pointer-coarse:size-11 ${focusRing}`}
          >
            {shown ? (
              <IconEyeOff aria-hidden="true" size={20} stroke={1.75} />
            ) : (
              <IconEye aria-hidden="true" size={20} stroke={1.75} />
            )}
          </button>
        )}
      </span>
      {error && (
        <p id={errorId} className={`flex items-center gap-1 ${fieldError}`}>
          <IconAlertTriangle aria-hidden="true" size={16} stroke={1.75} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
