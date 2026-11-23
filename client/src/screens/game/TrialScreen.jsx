import { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import Chat from '../../components/Chat.jsx';
import GameLayout from '../../components/GameLayout.jsx';

export default function TrialScreen({ view, act, busy, extraSide }) {
  const { t } = useI18n();
  const [choice, setChoice] = useState(null);
  const accused = view.players.find((player) => player.id === view.accused);
  const name = accused?.name ?? '?';
  const iAmAccused = view.me.id === view.accused;
  const counts = view.voteCounts ?? {};
  const tally = view.players.filter((player) => counts[player.id] > 0);

  let closedKey = 'chat.closed';
  if (!view.me.alive) closedKey = 'chat.dead';
  else if (view.phase === 'defense') closedKey = 'chat.defense';

  async function decide(value) {
    const result = await act({ type: 'revote', choice: value });
    if (!result.error) setChoice(value);
  }

  return (
    <GameLayout
      side={
        <>
          <Chat canSend={view.phase === 'defense' && iAmAccused && view.me.alive} closedKey={closedKey} />
          {extraSide}
        </>
      }
    >
      <section className="report-card">
        <h2>{t('trial.title', { name })}</h2>
        {tally.length > 0 && (
          <ul aria-label={t('trial.votes', { name })}>
            {tally.map((player) => (
              <li key={player.id}>
                <bdi>{player.name}</bdi>
                <span className="pill" aria-label={t('vote.countLabel', { count: counts[player.id] })}>
                  {counts[player.id]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.phase === 'defense' && <p className="prompt">{iAmAccused ? t('trial.you') : t('trial.other', { name })}</p>}

      {view.phase === 'revote' && view.canRevote && (
        <section className="decide">
          <p className="prompt">{t('revote.prompt', { name })}</p>
          <p className="hint">{t('revote.rule', { name })}</p>
          <button
            type="button"
            className="button secondary"
            aria-pressed={choice === 'keep'}
            disabled={busy}
            onClick={() => decide('keep')}
          >
            {t('revote.keep')}
          </button>
          <button
            type="button"
            className="button primary"
            aria-pressed={choice === 'switch'}
            disabled={busy}
            onClick={() => decide('switch')}
          >
            {t('revote.switch', { name })}
          </button>
          {!view.me.awaitingAction && (
            <p className="hint" role="status">
              {t('revote.locked')}
            </p>
          )}
        </section>
      )}

      {view.phase === 'revote' && !view.canRevote && <p className="prompt">{t('revote.wait', { name })}</p>}
    </GameLayout>
  );
}
