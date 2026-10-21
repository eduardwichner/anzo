// Large grid of the 16 avatars plus a row of the 8 background colours. Used in Settings and the admin user form.
import { AVATAR_BGS, AVATAR_IDS } from '../avatars/index.jsx';
import { t } from '../i18n/index.js';
import Avatar from './Avatar.jsx';

export default function AvatarPicker({ avatar, bg, onChange, idPrefix = 'avatar', disabled = false }) {
  return (
    <div className="avatar-picker">
      <div className="avatar-grid" role="radiogroup" aria-labelledby={`${idPrefix}-label`} data-testid="avatar-grid">
        {AVATAR_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            className="avatar-choice"
            aria-checked={avatar === id}
            aria-label={t(`avatars.${id}`)}
            data-testid={`avatar-${id}`}
            disabled={disabled}
            onClick={() => onChange({ avatar: id, avatarBg: bg })}
          >
            <Avatar avatar={id} bg={bg} />
          </button>
        ))}
      </div>
      <div className="colour-row" role="radiogroup" aria-label={t('settings.avatarColour')} data-testid="avatar-colours">
        {AVATAR_BGS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            className={`colour-swatch colour-swatch--${c}`}
            aria-checked={bg === c}
            aria-label={t(`colours.${c}`)}
            data-testid={`avatar-bg-${c}`}
            disabled={disabled}
            onClick={() => onChange({ avatar, avatarBg: c })}
          />
        ))}
      </div>
    </div>
  );
}
