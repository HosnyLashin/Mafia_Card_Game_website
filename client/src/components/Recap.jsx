import { useI18n } from '../i18n/index.jsx';

export default function Recap({ recap, players }) {
  const { t } = useI18n();
  if (!recap || recap.length === 0) return null;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? '?';

  return (
    <section className="recap" aria-label={t('recap.title')}>
      <h2 className="section-title">{t('recap.title')}</h2>
      <ol>
        {recap.map((round) => {
          let outcome = t('recap.noVote');
          if (round.outcome === 'kicked') outcome = t('recap.kicked', { name: nameOf(round.kickedId) });
          if (round.outcome === 'spared') outcome = t('recap.spared', { name: nameOf(round.vote?.accusedId) });
          if (round.outcome === 'tie') outcome = t('recap.tie');
          return (
            <li key={round.day}>
              <h3>{t('recap.night', { day: round.day })}</h3>
              <ul>
                <li>{round.mafiaPick ? t('recap.mafia', { name: nameOf(round.mafiaPick) }) : t('recap.mafiaNone')}</li>
                <li>{round.doctorPick ? t('recap.doctor', { name: nameOf(round.doctorPick) }) : t('recap.doctorNone')}</li>
                <li>
                  {round.policeSuspect
                    ? t('recap.police', {
                        name: nameOf(round.policeSuspect),
                        result: t(round.policeResult === 'right' ? 'recap.right' : 'recap.wrong'),
                      })
                    : t('recap.policeNone')}
                </li>
                <li>
                  {round.victimId
                    ? t('recap.killed', { name: nameOf(round.victimId) })
                    : round.saved
                      ? t('recap.saved', { name: nameOf(round.mafiaPick) })
                      : t('recap.noDeath')}
                </li>
                {round.vote !== null || round.outcome ? <li>{outcome}</li> : null}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
