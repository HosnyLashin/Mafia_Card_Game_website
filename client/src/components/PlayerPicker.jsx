import { useI18n } from '../i18n/index.jsx';
import { useLooks } from '../net/useLooks.js';
import Avatar from './Avatar.jsx';

export default function PlayerPicker({ players, selectedId, onPick, disabled, counts }) {
  const { t } = useI18n();
  const look = useLooks();
  return (
    <ul className="picker">
      {players.map((player) => (
        <li key={player.id}>
          <button
            type="button"
            className="pick"
            aria-pressed={player.id === selectedId}
            disabled={disabled}
            onClick={() => onPick(player.id)}
          >
            <Avatar look={look(player.id)} />
            <bdi className="name" data-color={look(player.id)?.color}>
              {player.name}
            </bdi>
            {player.role && <span className="pill">{t(`role.${player.role}`)}</span>}
            {counts?.[player.id] > 0 && (
              <span className="pill" aria-label={t('vote.countLabel', { count: counts[player.id] })}>
                {counts[player.id]}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
