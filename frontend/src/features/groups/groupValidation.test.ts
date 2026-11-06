import { beforeEach, describe, expect, it } from 'vitest';

import { i18n } from '../../i18n';
import { validateGroupInput } from './groupValidation';

// Pravila podatkov skupine v obrazcu (FR-002-02; feature-map §2.6, research R-07) – enaka kot na zaledju.

const valid = { title: 'Projekt FERI', description: '', color: 'mah' };

describe('validateGroupInput', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-002-02: naslov se obreže, prazen opis pomeni brez opisa', () => {
    const result = validateGroupInput({ ...valid, title: '  Projekt  ', description: '   ' });

    expect(result.errors).toEqual({});
    expect(result.value).toEqual({ title: 'Projekt', description: null, color: 'mah' });
  });

  it('FR-002-02: opis se ne obreže', () => {
    expect(validateGroupInput({ ...valid, description: ' opis ' }).value.description).toBe(
      ' opis ',
    );
  });

  it('FR-002-02: prazen naslov ali samo presledki → »Vpiši naslov.«', () => {
    for (const title of ['', '    ']) {
      const { errors } = validateGroupInput({ ...valid, title });
      expect(errors).toEqual({ title: 'titleRequired' });
    }
    expect(i18n.t('groups.form.errors.titleRequired')).toBe('Vpiši naslov.');
  });

  it('FR-002-02: naslov 100 znakov po obrezu je sprejet, 101 ne', () => {
    expect(validateGroupInput({ ...valid, title: ` ${'a'.repeat(100)} ` }).errors).toEqual({});
    expect(validateGroupInput({ ...valid, title: 'a'.repeat(101) }).errors).toEqual({
      title: 'titleTooLong',
    });
    expect(i18n.t('groups.form.errors.titleTooLong')).toBe(
      'Naslov je lahko dolg največ 100 znakov.',
    );
  });

  it('FR-002-02: opis 1000 znakov je sprejet, 1001 ne', () => {
    expect(validateGroupInput({ ...valid, description: 'b'.repeat(1000) }).errors).toEqual({});
    expect(validateGroupInput({ ...valid, description: 'b'.repeat(1001) }).errors).toEqual({
      description: 'descriptionTooLong',
    });
    expect(i18n.t('groups.form.errors.descriptionTooLong')).toBe(
      'Opis je lahko dolg največ 1000 znakov.',
    );
  });

  it('FR-002-02: dolžina se šteje v znakih (kodnih točkah), ne v enotah UTF-16', () => {
    expect(
      validateGroupInput({ ...valid, title: '😀'.repeat(100), description: '😀'.repeat(1000) })
        .errors,
    ).toEqual({});
    expect(validateGroupInput({ ...valid, title: '😀'.repeat(101) }).errors).toEqual({
      title: 'titleTooLong',
    });
  });

  it('FR-002-02: barva, ki ni med osmimi imeni, je napaka', () => {
    expect(validateGroupInput({ ...valid, color: 'blue' }).errors).toEqual({
      color: 'colorInvalid',
    });
    expect(i18n.t('groups.form.errors.colorInvalid')).toBe('Izberi eno od ponujenih barv.');
  });

  it('FR-002-02: vse napake hkrati', () => {
    expect(
      validateGroupInput({ title: '', description: 'b'.repeat(1001), color: 'blue' }).errors,
    ).toEqual({
      title: 'titleRequired',
      description: 'descriptionTooLong',
      color: 'colorInvalid',
    });
  });
});
