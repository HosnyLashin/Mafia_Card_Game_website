import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import { useGameAlerts } from '../hooks/useGameAlerts.js';
import ErrorText from '../components/ErrorText.jsx';
import PhaseHeader from '../components/PhaseHeader.jsx';
import NightScreen from './game/NightScreen.jsx';
import ReportScreen from './game/ReportScreen.jsx';
import DiscussionScreen from './game/DiscussionScreen.jsx';
import VoteScreen from './game/VoteScreen.jsx';
import TrialScreen from './game/TrialScreen.jsx';
import EndScreen from './game/EndScreen.jsx';

export default function Game() {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const { view } = state;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useGameAlerts(view);

  useEffect(() => {
    setError(null);
  }, [view?.phase, view?.day]);

  if (!view) {
    return (
      <main className="screen">
        <p>{t('common.loading')}</p>
      </main>
    );
  }

  async function act(action) {
    setBusy(true);
    setError(null);
    const result = await request('game:action', { action });
    setBusy(false);
    if (result.error) setError(result.error);
    return result;
  }

  const props = { view, act, busy };
  let body = null;
  switch (view.phase) {
    case 'night':
      body = <NightScreen {...props} />;
      break;
    case 'report':
      body = <ReportScreen {...props} />;
      break;
    case 'discussion':
      body = <DiscussionScreen {...props} />;
      break;
    case 'vote':
      body = <VoteScreen {...props} />;
      break;
    case 'defense':
    case 'revote':
      body = <TrialScreen key={`${view.day}:${view.accused}`} {...props} />;
      break;
    default:
      body = <EndScreen {...props} />;
  }

  return (
    <main className="screen game">
      <PhaseHeader view={view} />
      {body}
      <ErrorText code={error} />
    </main>
  );
}
