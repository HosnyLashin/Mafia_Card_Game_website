import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';

export default function NoticeDialog() {
  const { t } = useI18n();
  const { state, dismissNotice } = useConnection();
  if (!state.notice) return null;
  return (
    <div className="notice" role="alertdialog" aria-live="assertive">
      <p>{t(`notice.${state.notice}`)}</p>
      <button type="button" className="button secondary" onClick={dismissNotice}>
        {t('common.dismiss')}
      </button>
    </div>
  );
}
