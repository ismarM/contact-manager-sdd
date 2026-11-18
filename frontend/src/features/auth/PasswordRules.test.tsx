import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { PasswordRules, passwordRulesAnnouncement } from './PasswordRules';

// Pravila gesla sproti (FR-020-15): ikona + besedilo + skrito stanje, ne samo barva.

describe('PasswordRules', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('FR-020-15: neizpolnjeno in izpolnjeno pravilo imata v besedilu stanje', () => {
    const { rerender } = render(<PasswordRules id="r" password="1234567" />);
    expect(screen.getByRole('list', { name: 'Pravila gesla' })).toHaveTextContent(
      'Najmanj 8 znakov – ni izpolnjeno',
    );

    rerender(<PasswordRules id="r" password="12345678" />);

    expect(screen.getByRole('list', { name: 'Pravila gesla' })).toHaveTextContent(
      'Najmanj 8 znakov – izpolnjeno',
    );
  });

  it('FR-020-15: obvestilo za bralnik zaslona našteje stanje vsakega pravila', () => {
    expect(passwordRulesAnnouncement(i18n.t, '123')).toBe(
      'Pravila gesla. Najmanj 8 znakov: ni izpolnjeno.',
    );
    expect(passwordRulesAnnouncement(i18n.t, '12345678')).toBe(
      'Pravila gesla. Najmanj 8 znakov: izpolnjeno.',
    );
  });

  it.each(['sl', 'en'])('FR-020-15: seznam pravil nima kršitev axe (%s)', async (language) => {
    await i18n.changeLanguage(language);
    const { container } = render(<PasswordRules id="r" password="abc" />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
