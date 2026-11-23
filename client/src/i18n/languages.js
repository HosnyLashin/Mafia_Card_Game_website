import en from './en.js';
import ar from './ar.js';

export const languages = {
  en: { code: 'en', name: 'English', dir: 'ltr', messages: en },
  ar: { code: 'ar', name: 'مصري', dir: 'rtl', messages: ar },
};

export const defaultLanguage = 'en';
