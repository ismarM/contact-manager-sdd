import { describe, expect, it } from 'vitest';

import { validateAuthForm, validateEmail, validatePassword } from './passwordValidation';

describe('passwordValidation', () => {
  it.each([
    ['', 'emailRequired'],
    ['   ', 'emailRequired'],
    ['ana', 'emailInvalid'],
    ['ana@primer', 'emailInvalid'],
    ['ana @primer.si', 'emailInvalid'],
    ['ana@primer.si', undefined],
    [' ana@primer.si ', undefined],
  ])('FR-017-01: e-naslov %j → %s', (email, expected) => {
    expect(validateEmail(email)).toBe(expected);
  });

  it('FR-017-01: novo geslo ima najmanj 8 znakov (meja)', () => {
    expect(validatePassword('', true)).toBe('passwordRequired');
    expect(validatePassword('1234567', true)).toBe('passwordTooShort');
    expect(validatePassword('12345678', true)).toBeUndefined();
  });

  it('FR-017-05: pri prijavi se dolžina ne preverja (ne razkrije pravil obstoječega gesla)', () => {
    expect(validatePassword('', false)).toBe('passwordRequired');
    expect(validatePassword('123', false)).toBeUndefined();
  });

  it('FR-017-01: registracija zahteva enaki gesli', () => {
    expect(
      validateAuthForm(
        { email: 'ana@primer.si', password: '12345678', passwordConfirm: '12345679' },
        'register',
      ),
    ).toEqual({ passwordConfirm: 'passwordMismatch' });
    expect(
      validateAuthForm(
        { email: 'ana@primer.si', password: '12345678', passwordConfirm: '12345678' },
        'register',
      ),
    ).toEqual({});
    expect(validateAuthForm({ email: '', password: '' }, 'signIn')).toEqual({
      email: 'emailRequired',
      password: 'passwordRequired',
    });
  });
});
