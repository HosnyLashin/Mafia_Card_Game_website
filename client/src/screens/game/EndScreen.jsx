import { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useConnection } from '../../net/ConnectionProvider.jsx';
import { useLooks } from '../../net/useLooks.js';
import Avatar from '../../components/Avatar.jsx';
import ErrorText from '../../components/ErrorText.jsx';
import GameLayout from '../../components/GameLayout.jsx';
import Recap from '../../components/Recap.jsx';

export default function EndScreen({ view }) {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const look = useLooks();
  const [error, setError] = useState(null);
  const isHost = state.room?.hostId === state.playerId;
  const over = view.events.find((event) => event.key === 'game.over');
  const myTeam = view.me.role === 'mafia' ? 'mafia' : 'citizens';

  async function run(event) {
    const result = await request(event, {});
    setError(result.error ?? null);
  }

  return (
    <GameLayout side={<Recap recap={view.recap} players={view.players} />}>
      <section className="end-card">
        <h2>{t(`end.${view.winner}`)}</h2>
        {over?.params.reason && <p>{t(`end.reason.${over.params.reason}`)}</p>}
        {view.me.role && <p className="verdict">{view.winner === myTeam ? t('end.won') : t('end.lost')}</p>}
      </section>

      <section>
        <h2 className="section-title">{t('end.roles')}</h2>
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className={player.alive ? '' : 'out'}>
              <Avatar look={look(player.id)} />
              <bdi className="name" data-color={look(player.id)?.color}>
                {player.name}
              </bdi>
              {player.role && <span className="pill">{t(`role.${player.role}`)}</span>}
              {!player.alive && <span className="pill dim">{t('game.out')}</span>}
            </li>
          ))}
        </ul>
      </section>

      {view.me.role && isHost && (
        <>
          <button type="button" className="button primary" onClick={() => run('room:rematch')}>
            {t('end.playAgain')}
          </button>
          <button type="button" className="button secondary" onClick={() => run('room:lobby')}>
            {t('end.back')}
          </button>
        </>
      )}
      {view.me.role && !isHost && <p className="hint">{t('end.waitHost')}</p>}
      <ErrorText code={error} />
    </GameLayout>
  );
}
