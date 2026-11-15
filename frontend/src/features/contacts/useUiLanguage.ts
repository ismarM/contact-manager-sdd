import { useTranslation } from 'react-i18next';

import type { UiLanguage } from './countries';

/** Jezik vmesnika za imena držav (`sl` ali `en`). */
export function useUiLanguage(): UiLanguage {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? i18n.language).startsWith('en') ? 'en' : 'sl';
}
