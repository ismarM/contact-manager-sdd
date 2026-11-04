import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { initialLanguage } from '../features/account/preferences';
import en from './en.json';
import sl from './sl.json';

// i18n sl/en (FR-000-14, FR-001-16): shranjena izbira ima prednost pred jezikom brskalnika; <html lang> sledi jeziku,
// naslov dokumenta v izbranem jeziku nastavi vsaka stran (useDocumentTitle, FR-001-18).
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

void i18n.use(initReactI18next).init({
  resources: { sl: { translation: sl }, en: { translation: en } },
  lng: initialLanguage(navigator.language),
  fallbackLng: 'en',
  supportedLngs: ['sl', 'en'],
  interpolation: { escapeValue: false },
  initAsync: false,
});

export { i18n };
