import { useEffect, useMemo } from 'react';
import { ConnectionProvider, useConnection } from './net/ConnectionProvider.jsx';
import { createConnection, defaultServerUrl } from './net/connection.js';
import { safeStorage } from './storage.js';
import StatusBanner from './components/StatusBanner.jsx';
import NoticeDialog from './components/NoticeDialog.jsx';
import { SettingsProvider } from './settings/SettingsContext.jsx';
import { useI18n } from './i18n/index.jsx';
import { TutorialProvider } from './tutorial/TutorialContext.jsx';
import Tutorial from './tutorial/Tutorial.jsx';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import Game from './screens/Game.jsx';

function Screen() {
  const { state } = useConnection();
  if (!state.room) return <Home />;
  if (state.room.phase === 'lobby') return <Lobby />;
  return <Game />;
}

function SkipLink() {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main">
      {t('a11y.skip')}
    </a>
  );
}

export default function App({ connection }) {
  const active = useMemo(
    () => connection ?? createConnection({ url: defaultServerUrl(), storage: safeStorage() }),
    [connection],
  );

  useEffect(() => {
    active.connect();
  }, [active]);

  return (
    <ConnectionProvider connection={active}>
      <SettingsProvider>
        <TutorialProvider>
          <div className="app">
            <SkipLink />
            <StatusBanner />
            <NoticeDialog />
            <Screen />
            <Tutorial />
          </div>
        </TutorialProvider>
      </SettingsProvider>
    </ConnectionProvider>
  );
}
