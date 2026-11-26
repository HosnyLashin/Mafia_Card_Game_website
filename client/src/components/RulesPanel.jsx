import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import ErrorText from './ErrorText.jsx';

const TIMERS = [
  { key: 'discussionSeconds', label: 'rules.discussion', options: [30, 60, 90, 120, 180], fallback: 120 },
  { key: 'nightSeconds', label: 'rules.night', options: [20, 30, 45, 60], fallback: 30 },
  { key: 'voteSeconds', label: 'rules.vote', options: [20, 30, 45, 60], fallback: 30 },
];

export default function RulesPanel({ room, isHost, request }) {
  const { t } = useI18n();
  const { settings } = room;
  const [error, setError] = useState(null);
  const maxMafia = Math.max(1, Math.floor(((room.capacity ?? room.minPlayers) - 1) / 3));
  const mafiaOptions = ['auto', ...Array.from({ length: maxMafia }, (_, i) => i + 1)];

  async function change(patch) {
    setError(null);
    const result = await request('room:settings', patch);
    if (result.error) setError(result.error);
  }

  const mafiaLabel = (value) => (value === 'auto' ? t('rules.mafia.auto') : String(value));
  const yesNo = (value) => (value ? t('rules.yes') : t('rules.no'));

  return (
    <section className="rules" aria-label={t('rules.title')}>
      <h2>{t('rules.title')}</h2>
      {TIMERS.map(({ key, label, options, fallback }) => (
        <div className="rule" key={key}>
          <label htmlFor={`rule-${key}`}>{t(label)}</label>
          {isHost ? (
            <select
              id={`rule-${key}`}
              value={settings[key] ?? ''}
              onChange={(event) => change({ [key]: event.target.value === '' ? null : Number(event.target.value) })}
            >
              <option value="" disabled hidden>
                {t('rules.seconds', { n: fallback })}
              </option>
              {options.map((n) => (
                <option key={n} value={n}>
                  {t('rules.seconds', { n })}
                </option>
              ))}
            </select>
          ) : (
            <output id={`rule-${key}`}>{t('rules.seconds', { n: settings[key] ?? fallback })}</output>
          )}
        </div>
      ))}
      <div className="rule">
        <label htmlFor="rule-mafia">{t('rules.mafia')}</label>
        {isHost ? (
          <select
            id="rule-mafia"
            value={String(settings.mafiaCount)}
            onChange={(event) => change({ mafiaCount: event.target.value === 'auto' ? 'auto' : Number(event.target.value) })}
          >
            {mafiaOptions.map((value) => (
              <option key={value} value={String(value)}>
                {mafiaLabel(value)}
              </option>
            ))}
          </select>
        ) : (
          <output id="rule-mafia">{mafiaLabel(settings.mafiaCount)}</output>
        )}
      </div>
      <div className="rule">
        <label htmlFor="rule-public">{t('rules.publicVotes')}</label>
        {isHost ? (
          <input id="rule-public" type="checkbox" checked={settings.publicVotes} onChange={(e) => change({ publicVotes: e.target.checked })} />
        ) : (
          <output id="rule-public">{yesNo(settings.publicVotes)}</output>
        )}
      </div>
      <div className="rule">
        <label htmlFor="rule-reveal">{t('rules.revealRoles')}</label>
        {isHost ? (
          <input id="rule-reveal" type="checkbox" checked={settings.revealDeadRoles} onChange={(e) => change({ revealDeadRoles: e.target.checked })} />
        ) : (
          <output id="rule-reveal">{yesNo(settings.revealDeadRoles)}</output>
        )}
      </div>
      <ErrorText code={error} />
    </section>
  );
}
