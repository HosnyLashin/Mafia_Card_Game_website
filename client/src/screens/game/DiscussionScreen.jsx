import { useI18n } from '../../i18n/index.jsx';
import Chat from '../../components/Chat.jsx';
import EventLog from '../../components/EventLog.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function DiscussionScreen({ view, act, busy }) {
  const { t } = useI18n();
  const todays = view.events.filter((event) => event.day === view.day);
  const { skip, me } = view;
  return (
    <>
      <EventLog events={todays} players={view.players} />
      <Chat canSend={me.alive} closedKey="chat.dead" />
      {me.alive && skip && skip.needed > 0 && (
        <section className="skip">
          <button
            type="button"
            className="button secondary"
            aria-pressed={skip.mine}
            disabled={busy}
            onClick={() => act({ type: 'skip', agree: !skip.mine })}
          >
            {skip.mine ? t('discussion.skipAgreed') : t('discussion.skip')}
          </button>
          <p className="hint" role="status">
            {t('discussion.skipCount', { agreed: skip.agreed, needed: skip.needed })}
          </p>
        </section>
      )}
      <PlayersStrip players={view.players} />
    </>
  );
}
