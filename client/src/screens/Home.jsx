import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import { safeStorage } from '../storage.js';
import ErrorText from '../components/ErrorText.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

const NAME_KEY = 'mafia.name';
const CODE_LENGTH = 4;

export const normalizeCode = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, CODE_LENGTH);

const codeFromUrl = () => normalizeCode(new URLSearchParams(window.location.search).get('room'));

export default function Home() {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const [storage] = useState(safeStorage);
  const [name, setName] = useState(() => storage.getItem(NAME_KEY) ?? '');
  const [code, setCode] = useState(codeFromUrl);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const online = state.status === 'connected';

  async function submit(event, payload) {
    const clean = name.trim();
    if (!clean) {
      setError('INVALID_NAME');
      return;
    }
    storage.setItem(NAME_KEY, clean);
    setBusy(true);
    setError(null);
    const result = await request(event, { ...payload, name: clean });
    setBusy(false);
    if (result.error) setError(result.error);
  }

  return (
    <main className="screen home">
      <header className="topbar">
        <LanguageSwitcher />
      </header>

      <h1 className="wordmark">{t('app.name')}</h1>
      <p className="tagline">{t('home.tagline')}</p>

      <div className="field">
        <label htmlFor="player-name">{t('home.name.label')}</label>
        <input
          id="player-name"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder={t('home.name.placeholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="button primary"
        disabled={!online || busy}
        onClick={() => submit('room:create', {})}
      >
        {t('home.create')}
      </button>

      <section className="join">
        <h2>{t('home.join.heading')}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit('room:join', { code });
          }}
        >
          <div className="field">
            <label htmlFor="room-code">{t('home.join.label')}</label>
            <input
              id="room-code"
              className="code-input"
              dir="ltr"
              value={code}
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
            />
          </div>
          <button
            type="submit"
            className="button secondary"
            disabled={!online || busy || code.length !== CODE_LENGTH}
          >
            {t('home.join')}
          </button>
        </form>
      </section>

      <ErrorText code={error} />
    </main>
  );
}
