import { useI18n } from '../i18n/index.jsx';

export default function LanguageSwitcher() {
  const { lang, languages, setLang, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      {Object.values(languages).map((language) => (
        <button
          key={language.code}
          type="button"
          lang={language.code}
          aria-pressed={language.code === lang}
          onClick={() => setLang(language.code)}
        >
          {language.name}
        </button>
      ))}
    </div>
  );
}
