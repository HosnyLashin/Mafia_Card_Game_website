import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import { useGameAlerts } from '../hooks/useGameAlerts.js';
import DeadChat from '../components/DeadChat.jsx';
import ErrorText from '../components/ErrorText.jsx';
import HowToButton from '../components/HowToButton.jsx';
import PhaseHeader from '../components/PhaseHeader.jsx';
import NightScreen from './game/NightScreen.jsx';
import ReportScreen from './game/ReportScreen.jsx';
import DiscussionScreen from './game/DiscussionScreen.jsx';
import VoteScreen from './game/VoteScreen.jsx';
import ResultScreen from './game/ResultScreen.jsx';
import TrialScreen from './game/TrialScreen.jsx';
import EndScreen from './game/EndScreen.jsx';

function LeaveControl({ onLeave }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="button quiet" onClick={() => setAsking(true)}>
        {t('game.leave')}
      </button>
    );
  }
  return (
    <div className="confirm" role="alertdialog" aria-label={t('game.leave')}>
      <p>{t('game.leaveConfirm')}</p>
      <button type="button" className="button primary" onClick={onLeave}>
        {t('game.leaveYes')}
      </button>
      <button type="button" className="button secondary" onClick={() => setAsking(false)}>
        {t('game.leaveNo')}
      </button>
    </div>
  );
}

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

  async function leave() {
    const result = await request('room:leave', {});
    if (result.error) setError(result.error);
  }

  const extraSide = !view.me.alive && view.phase !== 'ended' ? <DeadChat /> : null;
  const props = { view, act, busy, extraSide };
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
    case 'result':
      body = <ResultScreen {...props} />;
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
      <HowToButton />
      {view.phase !== 'ended' && <LeaveControl onLeave={leave} />}
    </main>
  );
}
