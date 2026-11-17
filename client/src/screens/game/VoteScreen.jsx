import { useI18n } from '../../i18n/index.jsx';
import PlayerPicker from '../../components/PlayerPicker.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function VoteScreen({ view, act, busy }) {
  const { t } = useI18n();
  const { me } = view;

  if (!me.alive) {
    return (
      <>
        <p className="hint">{t('vote.spectator')}</p>
        <PlayersStrip players={view.players} />
      </>
    );
  }

  const submitted = !me.awaitingAction;
  const candidates = view.players.filter((player) => player.alive && player.id !== me.id);
  return (
    <>
      <p className="prompt">{t('vote.prompt')}</p>
      <PlayerPicker
        players={candidates}
        selectedId={submitted ? me.voteChoice : null}
        disabled={busy}
        onPick={(id) => act({ type: 'vote', target: id })}
      />
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => act({ type: 'vote', target: null })}
      >
        {t('vote.skip')}
      </button>
      {submitted && (
        <p className="hint" role="status">
          {me.voteChoice ? t('vote.locked') : t('vote.skipped')}
        </p>
      )}
    </>
  );
}
