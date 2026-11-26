import { useEffect, useRef } from 'react';
import { useSettings } from '../settings/SettingsContext.jsx';
import { playCue } from '../settings/audio.js';

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    return;
  }
}

function cueFor(view) {
  if (view.phase === 'night') return 'night';
  if (view.phase === 'report') return 'morning';
  if (view.phase === 'vote') return 'vote';
  if (view.phase === 'result') return 'result';
  if (view.phase === 'ended' && view.me.role) {
    const team = view.me.role === 'mafia' ? 'mafia' : 'citizens';
    return view.winner === team ? 'win' : 'lose';
  }
  return null;
}

export function useGameAlerts(view) {
  const { settings } = useSettings();
  const previous = useRef(null);
  const key = view ? `${view.phase}:${view.day}` : null;
  const needsAction = Boolean(view?.me.awaitingAction);

  useEffect(() => {
    if (key && previous.current && previous.current !== key) {
      if (settings.vibration) vibrate(needsAction ? [120, 60, 120] : 80);
      const cue = cueFor(view);
      if (settings.sound && cue) playCue(cue);
    }
    previous.current = key;
  }, [key]);

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
