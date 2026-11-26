import { useI18n } from '../i18n/index.jsx';

export default function VoteTally({ players, counts, voters }) {
  const { t } = useI18n();
  const rows = players.filter((player) => counts[player.id] > 0).sort((a, b) => counts[b.id] - counts[a.id]);
  if (rows.length === 0) return null;
  const top = counts[rows[0].id];
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '?';
  return (
    <ul className="tally" aria-label={t('result.votes')}>
      {rows.map((player) => (
        <li key={player.id}>
          <bdi>{player.name}</bdi>
          <span className="bar" aria-hidden="true">
            <span style={{ width: `${(counts[player.id] / top) * 100}%` }} />
          </span>
          <span className="pill" aria-label={t('vote.countLabel', { count: counts[player.id] })}>
            {counts[player.id]}
          </span>
          {voters?.[player.id] && (
            <span className="voters">{voters[player.id].map(nameOf).join('، ')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
