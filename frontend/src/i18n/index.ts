import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// i18n sl/en (FR-000-14). Ogrodje – vire in izbiro jezika doda T052.
void i18n.use(initReactI18next).init({ resources: {}, lng: 'en' });

export { i18n };
