import Chat from '../../components/Chat.jsx';
import EventLog from '../../components/EventLog.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function DiscussionScreen({ view }) {
  const todays = view.events.filter((event) => event.day === view.day);
  return (
    <>
      <EventLog events={todays} players={view.players} />
      <Chat canSend={view.me.alive} closedKey="chat.dead" />
      <PlayersStrip players={view.players} />
    </>
  );
}
