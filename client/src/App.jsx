import { useEffect, useMemo } from 'react';
import { ConnectionProvider, useConnection } from './net/ConnectionProvider.jsx';
import { createConnection, defaultServerUrl } from './net/connection.js';
import { safeStorage } from './storage.js';
import StatusBanner from './components/StatusBanner.jsx';
import NoticeDialog from './components/NoticeDialog.jsx';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import Game from './screens/Game.jsx';

function Screen() {
  const { state } = useConnection();
  if (!state.room) return <Home />;
  if (state.room.phase === 'lobby') return <Lobby />;
  return <Game />;
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
      <div className="app">
        <StatusBanner />
        <NoticeDialog />
        <Screen />
      </div>
    </ConnectionProvider>
  );
}
