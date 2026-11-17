import { useI18n } from '../i18n/index.jsx';
import Countdown from './Countdown.jsx';

const SUITS = { mafia: '♠', doctor: '♥', police: '♦', citizen: '♣' };

export default function PhaseHeader({ view }) {
  const { t } = useI18n();
  return (
    <header className="game-head">
      <div>
        <h1>{t(`phase.${view.phase}`)}</h1>
        <p>
          {t('game.day', { day: view.day })}
          {view.deadline && (
            <>
              {' '}
              <Countdown deadline={view.deadline} />
            </>
          )}
        </p>
      </div>
      <p className="role-chip" aria-label={t('game.yourRole')}>
        <span aria-hidden="true" data-role={view.me.role}>
          {SUITS[view.me.role]}
        </span>
        {t(`role.${view.me.role}`)}
      </p>
    </header>
  );
}
