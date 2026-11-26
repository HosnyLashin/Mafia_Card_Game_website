import { useMemo } from 'react';
import { useConnection } from './ConnectionProvider.jsx';

export function useLooks() {
  const { state } = useConnection();
  return useMemo(() => {
    const map = new Map();
    state.room?.players.forEach((p) => map.set(p.id, p));
    state.room?.spectators?.forEach((s) => map.set(s.id, s));
    return (id) => map.get(id) ?? null;
  }, [state.room]);
}
