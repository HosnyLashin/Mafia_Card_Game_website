import { useI18n } from '../../i18n/index.jsx';
import { describeEvent } from '../../components/EventLog.jsx';
import GameLayout from '../../components/GameLayout.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function ReportScreen({ view, extraSide }) {
  const { t } = useI18n();
  const lines = view.events
    .filter((event) => event.day === view.day && (event.key.startsWith('night.') || event.key.startsWith('police.')))
    .map((event) => ({ event, text: describeEvent(event, view.players, t) }))
    .filter((line) => line.text);

  return (
    <GameLayout
      side={
        <>
          <PlayersStrip players={view.players} />
          {extraSide}
        </>
      }
    >
      <section className="report-card" aria-label={t('phase.report')}>
        <ul>
          {lines.map(({ event, text }) => (
            <li key={event.seq}>{text}</li>
          ))}
        </ul>
      </section>
    </GameLayout>
  );
}
