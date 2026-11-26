import { useI18n } from '../../i18n/index.jsx';
import Chat from '../../components/Chat.jsx';
import EventLog from '../../components/EventLog.jsx';
import GameLayout from '../../components/GameLayout.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';
import VoteTally from '../../components/VoteTally.jsx';

export default function SpectatorScreen({ view }) {
  const { t } = useI18n();
  const result = view.voteResult;
  const showTally = ['result', 'defense', 'revote'].includes(view.phase) && result;
  const accused = view.players.find((p) => p.id === view.accused);

  return (
    <GameLayout
      side={
        <>
          <Chat canSend={false} closedKey="spectator.note" quick={false} />
          <EventLog events={view.events.filter((e) => e.day === view.day)} players={view.players} />
          <PlayersStrip players={view.players} />
        </>
      }
    >
      <p className="hint">{t('spectator.note')}</p>
      {showTally && (
        <section className="report-card" aria-label={t('phase.result')}>
          {accused && view.phase !== 'result' && <h2>{t('trial.title', { name: accused.name })}</h2>}
          {view.phase === 'result' && (
            <h2 role="status">
              {result.tie ? t('result.tie') : t('result.accused', { name: accused?.name ?? '?' })}
            </h2>
          )}
          <VoteTally players={view.players} counts={result.counts} voters={result.voters} />
        </section>
      )}
    </GameLayout>
  );
}
