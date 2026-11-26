import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

export default function Announcer({ view }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const key = `${view.phase}:${view.day}:${view.me.awaitingAction}`;

  useEffect(() => {
    const phase = t(`phase.${view.phase}`);
    const base = t('a11y.phase', { phase, day: view.day });
    setText(view.me.awaitingAction ? `${base}. ${t('a11y.yourTurn')}` : base);
  }, [key]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
      {text}
    </div>
  );
}
