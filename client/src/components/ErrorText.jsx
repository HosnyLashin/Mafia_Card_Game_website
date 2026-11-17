import { useI18n } from '../i18n/index.jsx';

export default function ErrorText({ code }) {
  const { t, has } = useI18n();
  if (!code) return null;
  const key = has(`errors.${code}`) ? `errors.${code}` : 'errors.UNKNOWN';
  return (
    <p className="error" role="alert">
      {t(key)}
    </p>
  );
}
