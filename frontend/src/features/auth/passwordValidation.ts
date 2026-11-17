// Preverjanje obrazcev z e-naslovom in geslom v vmesniku (FR-017-01, FR-017-05, research R-06). Firebase password
// policy (najmanj 8 znakov) velja tudi na strežniku; vmesnik napako pokaže že ob polju.

export const MIN_PASSWORD_LENGTH = 8;

export type AuthFieldError =
  'emailRequired' | 'emailInvalid' | 'passwordRequired' | 'passwordTooShort' | 'passwordMismatch';

export interface AuthFormValues {
  email: string;
  password: string;
  /** Samo pri registraciji. */
  passwordConfirm?: string;
}

export type AuthFieldErrors = Partial<Record<keyof AuthFormValues, AuthFieldError>>;

// Namenoma preprosto: en @, brez presledkov, pika v domeni; natančno preverjanje opravi Firebase.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): AuthFieldError | undefined {
  const value = email.trim();
  if (!value) return 'emailRequired';
  if (!EMAIL.test(value)) return 'emailInvalid';
  return undefined;
}

/** `newPassword`: pri registraciji velja najmanjša dolžina; pri prijavi samo, da geslo ni prazno. */
export function validatePassword(
  password: string,
  newPassword: boolean,
): AuthFieldError | undefined {
  if (!password) return 'passwordRequired';
  if (newPassword && password.length < MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  return undefined;
}

export function validateAuthForm(
  values: AuthFormValues,
  mode: 'signIn' | 'register',
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const email = validateEmail(values.email);
  if (email) errors.email = email;
  const password = validatePassword(values.password, mode === 'register');
  if (password) errors.password = password;
  if (mode === 'register' && !password && values.passwordConfirm !== values.password) {
    errors.passwordConfirm = 'passwordMismatch';
  }
  return errors;
}
