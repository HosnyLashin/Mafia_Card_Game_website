import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';

const WAKE_DELAY_MS = 4000;

export default function StatusBanner() {
  const { t } = useI18n();
  const { state } = useConnection();
  const [slow, setSlow] = useState(false);
  const waiting = state.status !== 'connected';

  useEffect(() => {
    if (!waiting) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), WAKE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (!waiting) return null;
  let key = 'status.connecting';
  if (state.everConnected) key = 'status.offline';
  else if (slow) key = 'status.waking';
  return (
    <p className="banner" role="status">
      {t(key)}
    </p>
  );
}
