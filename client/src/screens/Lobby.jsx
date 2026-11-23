import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import ErrorText from '../components/ErrorText.jsx';
import HowToButton from '../components/HowToButton.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function Lobby() {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const { room, playerId } = state;
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const isHost = room.hostId === playerId;
  const count = room.players.length;
  const capacity = room.capacity ?? room.minPlayers;
  const enough = count >= room.minPlayers;
  const hasEmptySeats = count < capacity;
  const smallest = Math.max(room.minPlayers, count);

  async function act(event, payload) {
    setBusy(true);
    setError(null);
    const result = await request(event, payload);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t('app.name'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="screen lobby">
      <header className="topbar">
        <LanguageSwitcher />
      </header>

      <section className="code-block">
        <h2>{t('lobby.code.label')}</h2>
        <div className="deal" dir="ltr" role="img" aria-label={`${t('lobby.code.label')}: ${room.code}`}>
          {[...room.code].map((letter, index) => (
            <span key={index} className="tile" style={{ '--i': index }}>
              {letter}
            </span>
          ))}
        </div>
        <button type="button" className="button secondary" onClick={share}>
          {t('lobby.share')}
        </button>
        {copied && <p role="status">{t('lobby.copied')}</p>}
      </section>

      <section className="stepper" role="group" aria-label={t('lobby.capacity')}>
        <span className="stepper-label">{t('lobby.capacity')}</span>
        <div className="stepper-controls">
          {isHost && (
            <button
              type="button"
              className="step"
              aria-label={t('lobby.capacity.less')}
              disabled={busy || capacity <= smallest}
              onClick={() => act('room:settings', { capacity: capacity - 1 })}
            >
              −
            </button>
          )}
          <output dir="ltr">{capacity}</output>
          {isHost && (
            <button
              type="button"
              className="step"
              aria-label={t('lobby.capacity.more')}
              disabled={busy || capacity >= room.maxPlayers}
              onClick={() => act('room:settings', { capacity: capacity + 1 })}
            >
              +
            </button>
          )}
        </div>
        {isHost && <p className="hint">{t('lobby.capacityHint')}</p>}
      </section>

      <section>
        <div className="list-head">
          <h2>{t('lobby.players')}</h2>
          <span dir="ltr">{t('lobby.count', { count, capacity })}</span>
        </div>
        <ul className="players">
          {room.players.map((player) => (
            <li key={player.id}>
              <bdi className="name">{player.name}</bdi>
              {player.id === playerId && <span className="pill">{t('lobby.you')}</span>}
              {player.id === room.hostId && <span className="pill">{t('lobby.host')}</span>}
              {player.isBot && <span className="pill">{t('lobby.bot')}</span>}
              {!player.isBot && !player.connected && <span className="pill dim">{t('lobby.offline')}</span>}
              {isHost && player.id !== playerId && !player.isBot && (
                <button
                  type="button"
                  className="kick"
                  aria-label={t('lobby.kick', { name: player.name })}
                  disabled={busy}
                  onClick={() => act('room:kick', { playerId: player.id })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isHost && enough && !confirming && (
        <>
          <button type="button" className="button primary" disabled={busy} onClick={() => act('room:start', {})}>
            {t('lobby.start')}
          </button>
          {hasEmptySeats && (
            <button type="button" className="button secondary" onClick={() => setConfirming(true)}>
              {t('lobby.fillBots')}
            </button>
          )}
        </>
      )}

      {isHost && !enough && !confirming && (
        <>
          <p>{t('lobby.need', { min: room.minPlayers })}</p>
          <button type="button" className="button primary" onClick={() => setConfirming(true)}>
            {t('lobby.startBots')}
          </button>
        </>
      )}

      {isHost && confirming && (
        <div className="confirm">
          <p>{t('lobby.botsHint', { size: Math.max(room.minPlayers, capacity) })}</p>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => act('room:start', { fillWithBots: true })}
          >
            {t('lobby.confirmBots')}
          </button>
          <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
            {t('lobby.cancel')}
          </button>
        </div>
      )}

      {!isHost && <p>{t('lobby.waitHost')}</p>}

      <ErrorText code={error} />

      <HowToButton />
      <button type="button" className="button quiet" disabled={busy} onClick={() => act('room:leave', {})}>
        {t('lobby.leave')}
      </button>
    </main>
  );
}
