import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { languages, defaultLanguage } from './languages.js';
import { safeStorage } from '../storage.js';

const I18nContext = createContext(null);
const STORAGE_KEY = 'mafia.lang';

export function translate(lang, key, params) {
  const text = languages[lang]?.messages[key] ?? languages[defaultLanguage].messages[key];
  if (text === undefined) return key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

function detect(storage) {
  const saved = storage.getItem(STORAGE_KEY);
  if (saved && languages[saved]) return saved;
  const browser = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  const base = browser.slice(0, 2).toLowerCase();
  return languages[base] ? base : defaultLanguage;
}

export function I18nProvider({ children, storage, initial }) {
  const store = useMemo(() => storage ?? safeStorage(), [storage]);
  const [lang, setLangState] = useState(() => initial ?? detect(store));

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = languages[lang].dir;
  }, [lang]);

  const setLang = useCallback(
    (code) => {
      if (!languages[code]) return;
      setLangState(code);
      store.setItem(STORAGE_KEY, code);
    },
    [store],
  );

  const value = useMemo(
    () => ({
      lang,
      dir: languages[lang].dir,
      languages,
      setLang,
      t: (key, params) => translate(lang, key, params),
      has: (key) => (languages[lang].messages[key] ?? languages[defaultLanguage].messages[key]) !== undefined,
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
