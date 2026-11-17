import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

const ConnectionContext = createContext(null);

export function ConnectionProvider({ connection, children }) {
  return <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const connection = useContext(ConnectionContext);
  const state = useSyncExternalStore(connection.subscribe, connection.getState);
  return useMemo(
    () => ({ state, request: connection.request, dismissNotice: connection.dismissNotice }),
    [state, connection],
  );
}
