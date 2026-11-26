import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

export default function HintBar({ view }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  const key = view.phase === 'night' ? `practice.hint.night.${view.me.role}` : `practice.hint.${view.phase}`;

  return (
    <aside className="hint-bar" aria-label={t('practice.badge')}>
      {visible ? (
        <>
          <p role="note">{t(key)}</p>
          <button type="button" className="button quiet" onClick={() => setVisible(false)}>
            {t('practice.hide')}
          </button>
        </>
      ) : (
        <button type="button" className="button quiet" onClick={() => setVisible(true)}>
          {t('practice.show')}
        </button>
      )}
    </aside>
  );
}
