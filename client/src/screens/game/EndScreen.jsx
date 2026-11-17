import { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useConnection } from '../../net/ConnectionProvider.jsx';
import ErrorText from '../../components/ErrorText.jsx';

export default function EndScreen({ view }) {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const [error, setError] = useState(null);
  const isHost = state.room?.hostId === state.playerId;
  const over = view.events.find((event) => event.key === 'game.over');
  const myTeam = view.me.role === 'mafia' ? 'mafia' : 'citizens';

  async function back() {
    const result = await request('room:lobby', {});
    setError(result.error ?? null);
  }

  return (
    <>
      <section className="end-card">
        <h2>{t(`end.${view.winner}`)}</h2>
        {over?.params.reason && <p>{t(`end.reason.${over.params.reason}`)}</p>}
        <p className="verdict">{view.winner === myTeam ? t('end.won') : t('end.lost')}</p>
      </section>

      <section>
        <h2 className="section-title">{t('end.roles')}</h2>
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className={player.alive ? '' : 'out'}>
              <bdi className="name">{player.name}</bdi>
              {player.role && <span className="pill">{t(`role.${player.role}`)}</span>}
              {!player.alive && <span className="pill dim">{t('game.out')}</span>}
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <button type="button" className="button primary" onClick={back}>
          {t('end.back')}
        </button>
      ) : (
        <p className="hint">{t('end.waitHost')}</p>
      )}
      <ErrorText code={error} />
    </>
  );
}
