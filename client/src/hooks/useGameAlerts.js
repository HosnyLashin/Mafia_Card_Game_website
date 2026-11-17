import { useEffect, useRef } from 'react';

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    return;
  }
}

export function useGameAlerts(view) {
  const previous = useRef(null);
  const key = view ? `${view.phase}:${view.day}` : null;
  const needsAction = Boolean(view?.me.awaitingAction);

  useEffect(() => {
    if (key && previous.current && previous.current !== key) {
      vibrate(needsAction ? [120, 60, 120] : 80);
    }
    previous.current = key;
  }, [key, needsAction]);

  useEffect(() => {
    let lock = null;
    let active = true;

    async function acquire() {
      try {
        if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
        const granted = await navigator.wakeLock.request('screen');
        if (active) lock = granted;
        else granted.release?.();
      } catch {
        lock = null;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        lock?.release?.();
      } catch {
        lock = null;
      }
    };
  }, []);
}
