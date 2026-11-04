import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import { detectLanguage } from './language';
import sl from './sl.json';

// i18n sl/en (FR-000-14): statični viri, jezik brskalnika, <html lang> in naslov sledita jeziku.
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
  document.title = i18n.t('app.name');
});

void i18n.use(initReactI18next).init({
  resources: { sl: { translation: sl }, en: { translation: en } },
  lng: detectLanguage(navigator.language),
  fallbackLng: 'en',
  supportedLngs: ['sl', 'en'],
  interpolation: { escapeValue: false },
  initAsync: false,
});

export { i18n };
