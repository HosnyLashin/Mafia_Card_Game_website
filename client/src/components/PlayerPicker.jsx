import { useI18n } from '../i18n/index.jsx';

export default function PlayerPicker({ players, selectedId, onPick, disabled, counts }) {
  const { t } = useI18n();
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
            <bdi className="name">{player.name}</bdi>
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
