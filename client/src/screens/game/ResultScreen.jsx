import { useI18n } from '../../i18n/index.jsx';
import GameLayout from '../../components/GameLayout.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function ResultScreen({ view, extraSide }) {
  const { t } = useI18n();
  const result = view.voteResult ?? { counts: {}, accusedId: null, tie: true };
  const rows = view.players
    .filter((player) => result.counts[player.id] > 0)
    .sort((a, b) => result.counts[b.id] - result.counts[a.id]);
  const top = rows.length ? result.counts[rows[0].id] : 1;
  const accused = view.players.find((player) => player.id === result.accusedId);

  let headline = t('result.accused', { name: accused?.name ?? '?' });
  if (result.tie) headline = rows.length === 0 ? t('result.noVotes') : t('result.tie');

  return (
    <GameLayout
      side={
        <>
          <PlayersStrip players={view.players} />
          {extraSide}
        </>
      }
    >
      <section className={result.tie ? 'report-card tie' : 'report-card'} aria-label={t('phase.result')}>
        <h2 role="status">{headline}</h2>
        {rows.length > 0 && (
          <ul className="tally" aria-label={t('result.votes')}>
            {rows.map((player) => (
              <li key={player.id}>
                <bdi>{player.name}</bdi>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${(result.counts[player.id] / top) * 100}%` }} />
                </span>
                <span className="pill" aria-label={t('vote.countLabel', { count: result.counts[player.id] })}>
                  {result.counts[player.id]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </GameLayout>
  );
}
