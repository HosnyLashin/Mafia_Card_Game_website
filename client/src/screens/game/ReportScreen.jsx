import { useI18n } from '../../i18n/index.jsx';
import { describeEvent } from '../../components/EventLog.jsx';
import PlayersStrip from '../../components/PlayersStrip.jsx';

export default function ReportScreen({ view }) {
  const { t } = useI18n();
  const lines = view.events
    .filter((event) => event.day === view.day && (event.key.startsWith('night.') || event.key.startsWith('police.')))
    .map((event) => ({ event, text: describeEvent(event, view.players, t) }))
    .filter((line) => line.text);

  return (
    <>
      <section className="report-card" aria-label={t('phase.report')}>
        <ul>
          {lines.map(({ event, text }) => (
            <li key={event.seq}>{text}</li>
          ))}
        </ul>
      </section>
      <PlayersStrip players={view.players} />
    </>
  );
}
