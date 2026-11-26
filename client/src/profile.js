import { useCallback, useState } from 'react';
import { safeStorage } from './storage.js';

export const AVATARS = [
  '😀',
  '😎',
  '🤠',
  '🥸',
  '🧐',
  '😼',
  '🦊',
  '🐺',
  '🦁',
  '🐯',
  '🐼',
  '🐸',
  '🦉',
  '🦅',
  '🐙',
  '🦄',
  '👻',
  '🤖',
  '🎭',
  '👑',
  '🧙',
  '🥷',
  '🧛',
  '🐲',
];

export const COLORS = ['red', 'orange', 'gold', 'green', 'teal', 'blue', 'purple', 'pink'];

const KEY = 'mafia.profile';
const FALLBACK = { avatar: AVATARS[0], color: COLORS[4] };

function read(storage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    return {
      avatar: AVATARS.includes(saved?.avatar) ? saved.avatar : FALLBACK.avatar,
      color: COLORS.includes(saved?.color) ? saved.color : FALLBACK.color,
    };
  } catch {
    return FALLBACK;
  }
}

export function useProfile() {
  const [storage] = useState(safeStorage);
  const [profile, setProfile] = useState(() => read(storage));
  const update = useCallback(
    (patch) => {
      setProfile((current) => {
        const next = { ...current, ...patch };
        storage.setItem(KEY, JSON.stringify(next));
        return next;
      });
    },
    [storage],
  );
  return { profile, update };
}
