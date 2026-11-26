import { useI18n } from '../i18n/index.jsx';
import { useLooks } from '../net/useLooks.js';
import Avatar from './Avatar.jsx';

export default function PlayersStrip({ players }) {
  const { t } = useI18n();
  const look = useLooks();
  return (
    <section aria-label={t('game.players')}>
      <ul className="strip">
        {players.map((player) => (
          <li key={player.id} className={player.alive ? '' : 'out'}>
            <Avatar look={look(player.id)} />
            <bdi data-color={look(player.id)?.color}>{player.name}</bdi>
            {player.role && <span className="pill">{t(`role.${player.role}`)}</span>}
            {!player.alive && <span className="pill dim">{t('game.out')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
