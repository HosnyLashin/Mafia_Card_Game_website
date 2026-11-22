import { useI18n } from '../i18n/index.jsx';

export function describeEvent(event, players, t) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '?';
  const { key, params } = event;
  const withRole = (text) => (params.role ? `${text} ${t('event.role', { role: t(`role.${params.role}`) })}` : text);
  switch (key) {
    case 'night.died':
      return withRole(t('event.night.died', { name: nameOf(params.playerId) }));
    case 'vote.kicked':
      return withRole(t('event.vote.kicked', { name: nameOf(params.playerId) }));
    case 'vote.accused':
    case 'defense.spared':
      return t(`event.${key}`, { name: nameOf(params.playerId) });
    case 'night.nobody_died':
    case 'police.right':
    case 'police.wrong':
    case 'vote.tied':
    case 'discussion.skipped':
      return t(`event.${key}`);
    default:
      return null;
  }
}

export default function EventLog({ events, players }) {
  const { t } = useI18n();
  const lines = events
    .map((event) => ({ event, text: describeEvent(event, players, t) }))
    .filter((line) => line.text);
  if (lines.length === 0) return null;
  return (
    <section className="story" aria-label={t('game.story')}>
      <ul>
        {lines.map(({ event, text }) => (
          <li key={event.seq}>{text}</li>
        ))}
      </ul>
    </section>
  );
}
