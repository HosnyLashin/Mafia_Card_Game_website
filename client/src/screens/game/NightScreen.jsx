import { useI18n } from '../../i18n/index.jsx';
import PlayerPicker from '../../components/PlayerPicker.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

const SUITS = { mafia: '♠', doctor: '♥', police: '♦', citizen: '♣' };

function candidatesFor(view) {
  const { me } = view;
  return view.players.filter((player) => {
    if (!player.alive) return false;
    if (me.role === 'doctor') return true;
    if (player.id === me.id) return false;
    return !(me.role === 'mafia' && player.role === 'mafia');
  });
}

export default function NightScreen({ view, act, busy }) {
  const { t } = useI18n();
  const { me } = view;

  if (!me.alive) {
    return (
      <>
        <p className="hint">{t('night.spectator')}</p>
        <PlayersStrip players={view.players} />
      </>
    );
  }

  const submitted = !me.awaitingAction;
  return (
    <>
      {view.day === 1 && (
        <section className="role-card" aria-label={t('game.yourRole')}>
          <span className="suit" aria-hidden="true" data-role={me.role}>
            {SUITS[me.role]}
          </span>
          <p className="role-label">{t('game.yourRole')}</p>
          <p className="role-name">{t(`role.${me.role}`)}</p>
        </section>
      )}
      <p className="prompt">{t(`night.prompt.${me.role}`)}</p>
      <PlayerPicker
        players={candidatesFor(view)}
        selectedId={submitted ? me.nightChoice : null}
        disabled={busy}
        onPick={(id) => act({ type: 'night', target: id })}
      />
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => act({ type: 'night', target: null })}
      >
        {t('night.skip')}
      </button>
      {submitted && (
        <p className="hint" role="status">
          {me.nightChoice ? t('night.locked') : t('night.skipped')}
        </p>
      )}
    </>
  );
}
