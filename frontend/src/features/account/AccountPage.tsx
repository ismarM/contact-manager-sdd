import { IconLogout } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { Language } from '../../i18n/language';
import { useDocumentTitle } from '../../shared/lib/useDocumentTitle';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { card, secondaryButton } from '../../shared/ui/styles';
import { ApiKeysSection } from '../apikeys/ApiKeysSection';
import { useAuth } from '../auth/authContext';
import { AppPasswordsSection } from './AppPasswordsSection';
import { DeleteAccountSection } from './DeleteAccountSection';
import { DisplayFormatSection } from './DisplayFormatSection';
import { MyDataSection } from './MyDataSection';
import { ProfilePhotoSection } from './ProfilePhotoSection';
import { SignInMethodsSection } from './SignInMethodsSection';
import type { Theme } from './preferences';

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
    <div className="flex max-w-3xl flex-col gap-7 px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-semibold">{t('account.heading')}</h1>

      <section
        aria-labelledby="account-profile"
        className={`${card} flex flex-col gap-5 p-4 md:p-6`}
      >
        <h2 id="account-profile" className="text-xl font-semibold">
          {t('account.profile')}
        </h2>
        <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="text-sm font-medium text-muted-foreground">{t('account.name')}</dt>
          <dd className="font-semibold break-words">{profile.name ?? profile.email}</dd>
          <dt className="text-sm font-medium text-muted-foreground">{t('account.email')}</dt>
          <dd className="break-all">{profile.email}</dd>
        </dl>
        <ProfilePhotoSection />
      </section>

      <section
        aria-labelledby="account-appearance"
        className={`${card} flex flex-col gap-5 p-4 md:p-6`}
      >
        <h2 id="account-appearance" className="text-xl font-semibold">
          {t('account.appearance')}
        </h2>
        <fieldset className="flex flex-wrap items-center justify-between gap-4">
          <legend className="float-left font-medium">{t('language.label')}</legend>
          <SegmentedControl
            label={t('language.label')}
            value={i18n.language as Language}
            segments={(['sl', 'en'] as Language[]).map((language) => ({
              value: language,
              label: t(`language.${language}`),
            }))}
            onChange={changeLanguage}
          />
        </fieldset>
        <hr className="border-border" />
        <fieldset className="flex flex-wrap items-center justify-between gap-4">
          <legend className="float-left font-medium">{t('account.theme')}</legend>
          <SegmentedControl
            label={t('account.theme')}
            value={theme ?? 'system'}
            segments={THEMES.map(({ value, key }) => ({
              value: value ?? 'system',
              label: t(`account.${key}`),
            }))}
            onChange={(next) => changeTheme(next === 'system' ? null : (next as Theme))}
          />
        </fieldset>
      </section>

      <DisplayFormatSection />

      <SignInMethodsSection />

      <MyDataSection />

      <AppPasswordsSection />

      <ApiKeysSection />

      <DeleteAccountSection />

      <div>
        <button type="button" onClick={() => void signOut()} className={secondaryButton}>
          <IconLogout aria-hidden="true" size={20} stroke={1.75} />
          {t('shell.signOut')}
        </button>
      </div>
    </div>
  );
}
