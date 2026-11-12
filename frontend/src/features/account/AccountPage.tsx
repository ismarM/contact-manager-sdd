import { useTranslation } from 'react-i18next';

import type { Language } from '../../i18n/language';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { useAuth } from '../auth/authContext';
import { DeleteAccountSection } from './DeleteAccountSection';
import { MyDataSection } from './MyDataSection';
import type { Theme } from './preferences';

const radio =
  'size-5 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const option = 'flex min-h-11 items-center gap-3 pointer-coarse:min-h-12';
const fieldset = 'flex flex-col gap-1 rounded-md border border-border p-4';
const legend = 'px-1 font-bold';

const THEMES: { value: Theme | null; key: 'themeSystem' | 'themeLight' | 'themeDark' }[] = [
  { value: null, key: 'themeSystem' },
  { value: 'light', key: 'themeLight' },
  { value: 'dark', key: 'themeDark' },
];

/** Moj račun – Profil in Videz (design.md 9.9; FR-001-14, -15, -17, -19, -09). */
export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { profile, theme, changeLanguage, changeTheme, signOut } = useAuth();
  useDocumentTitle(t('title.account'));

  if (!profile) return null;

  return (
    <div className="mx-auto flex max-w-[70ch] flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('account.heading')}</h1>

      <section aria-labelledby="account-profile" className="flex flex-col gap-3">
        <h2 id="account-profile" className="text-xl font-bold">
          {t('account.profile')}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t('account.name')}</dt>
          <dd className="break-words">{profile.name ?? profile.email}</dd>
          <dt className="text-muted-foreground">{t('account.email')}</dt>
          <dd className="break-all">{profile.email}</dd>
        </dl>
      </section>

      <section aria-labelledby="account-appearance" className="flex flex-col gap-4">
        <h2 id="account-appearance" className="text-xl font-bold">
          {t('account.appearance')}
        </h2>
        <fieldset className={fieldset}>
          <legend className={legend}>{t('language.label')}</legend>
          {(['sl', 'en'] as Language[]).map((language) => (
            <label key={language} className={option} lang={language}>
              <input
                type="radio"
                name="language"
                value={language}
                checked={i18n.language === language}
                onChange={() => changeLanguage(language)}
                className={radio}
              />
              {t(`language.${language}`)}
            </label>
          ))}
        </fieldset>
        <fieldset className={fieldset}>
          <legend className={legend}>{t('account.theme')}</legend>
          {THEMES.map(({ value, key }) => (
            <label key={key} className={option}>
              <input
                type="radio"
                name="theme"
                value={value ?? 'system'}
                checked={theme === value}
                onChange={() => changeTheme(value)}
                className={radio}
              />
              {t(`account.${key}`)}
            </label>
          ))}
        </fieldset>
      </section>

      <MyDataSection />

      <DeleteAccountSection />

      <div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-11 rounded-md border border-border bg-card px-4 font-bold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-12"
        >
          {t('shell.signOut')}
        </button>
      </div>
    </div>
  );
}
