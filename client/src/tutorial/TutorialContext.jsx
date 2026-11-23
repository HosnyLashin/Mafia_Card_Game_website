import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { safeStorage } from '../storage.js';

const TutorialContext = createContext({ open: () => {}, isOpen: false, close: () => {} });
const SEEN_KEY = 'mafia.tutorialSeen';

export function TutorialProvider({ children }) {
  const [storage] = useState(safeStorage);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (!storage.getItem(SEEN_KEY)) setOpen(true);
  }, [storage]);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    storage.setItem(SEEN_KEY, '1');
    setOpen(false);
  }, [storage]);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  return useContext(TutorialContext);
}
