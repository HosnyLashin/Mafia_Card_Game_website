import { useI18n } from '../../i18n/index.jsx';
import GameLayout from '../../components/GameLayout.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';
import VoteTally from '../../components/VoteTally.jsx';

export default function ResultScreen({ view, extraSide }) {
  const { t } = useI18n();
  const result = view.voteResult ?? { counts: {}, accusedId: null, tie: true };
  const hasVotes = Object.values(result.counts).some((n) => n > 0);
  const accused = view.players.find((player) => player.id === result.accusedId);

  let headline = t('result.accused', { name: accused?.name ?? '?' });
  if (result.tie) headline = hasVotes ? t('result.tie') : t('result.noVotes');

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
        <VoteTally players={view.players} counts={result.counts} voters={result.voters} />
      </section>
    </GameLayout>
  );
}
