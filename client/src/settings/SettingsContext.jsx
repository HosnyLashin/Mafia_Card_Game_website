import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { safeStorage } from '../storage.js';

const KEY = 'mafia.settings';
const SIZES = ['normal', 'large', 'xlarge'];

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function read(storage) {
  let saved = {};
  try {
    saved = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }
  return {
    sound: saved.sound ?? true,
    vibration: saved.vibration ?? true,
    textSize: SIZES.includes(saved.textSize) ? saved.textSize : 'normal',
    reduceMotion: saved.reduceMotion ?? prefersReducedMotion(),
  };
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [storage] = useState(safeStorage);
  const [settings, setSettings] = useState(() => read(storage));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = settings.textSize;
    root.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings]);

  const update = useCallback(
    (patch) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        storage.setItem(KEY, JSON.stringify(next));
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
