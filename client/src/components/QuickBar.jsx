import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import { QUICK_EMOJI, QUICK_PHRASES } from '../quick.js';

export default function QuickBar() {
  const { t } = useI18n();
  const { request } = useConnection();
  const send = (id) => request('chat:quick', { id });
  return (
    <div className="quick" role="group" aria-label={t('quick.label')}>
      {QUICK_EMOJI.map((emoji) => (
        <button key={emoji} type="button" className="quick-button emoji" onClick={() => send(emoji)}>
          {emoji}
        </button>
      ))}
      {QUICK_PHRASES.map((id) => (
        <button key={id} type="button" className="quick-button" onClick={() => send(id)}>
          {t(`quick.${id}`)}
        </button>
      ))}
    </div>
  );
}
