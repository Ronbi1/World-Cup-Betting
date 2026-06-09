// i18n bootstrap — single layer, two locales (en, he). The `useDirection`
// hook keeps <html dir lang> in sync with the active language, satisfying the
// project rule that Hebrew renders RTL.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import he from './locales/he.json';

export const SUPPORTED_LANGUAGES = ['en', 'he'];
export const RTL_LANGUAGES = new Set(['he', 'ar', 'fa', 'ur']);
export const STORAGE_KEY = 'wc_lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

// Keep <html dir lang> in sync whenever the language changes.
function applyDirection(lng) {
  const root = document.documentElement;
  root.lang = lng;
  root.dir = RTL_LANGUAGES.has(lng) ? 'rtl' : 'ltr';
}

applyDirection(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDirection);

export default i18n;
