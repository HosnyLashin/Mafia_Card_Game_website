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

export function cleanProfile(profile, fallbackIndex = 0) {
  const avatar = AVATARS.includes(profile?.avatar) ? profile.avatar : AVATARS[fallbackIndex % AVATARS.length];
  const color = COLORS.includes(profile?.color) ? profile.color : COLORS[fallbackIndex % COLORS.length];
  return { avatar, color };
}
