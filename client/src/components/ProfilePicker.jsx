import { useI18n } from '../i18n/index.jsx';
import { AVATARS, COLORS } from '../profile.js';
import Avatar from './Avatar.jsx';

export default function ProfilePicker({ profile, onChange }) {
  const { t } = useI18n();
  return (
    <details className="profile-picker">
      <summary>
        <Avatar look={profile} />
        <span>{t('profile.title')}</span>
      </summary>
      <div role="group" aria-label={t('profile.avatar')} className="avatar-grid">
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            className="avatar-choice"
            aria-pressed={profile.avatar === avatar}
            aria-label={avatar}
            onClick={() => onChange({ avatar })}
          >
            {avatar}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t('profile.color')} className="color-row">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="color-choice"
            data-color={color}
            aria-pressed={profile.color === color}
            aria-label={t(`color.${color}`)}
            onClick={() => onChange({ color })}
          />
        ))}
      </div>
    </details>
  );
}
