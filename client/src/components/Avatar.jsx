// A user's avatar: one of the drawings in avatars/ on a round background colour token (--avatar-<bg>).
import { AVATAR_BGS, AvatarDrawing } from '../avatars/index.jsx';

export default function Avatar({ avatar, bg, className = 'avatar', label }) {
  const colour = AVATAR_BGS.includes(bg) ? bg : 'sky';
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      data-avatar={avatar}
      data-avatar-bg={colour}
    >
      <circle cx="50" cy="50" r="50" fill={`var(--avatar-${colour})`} />
      <AvatarDrawing id={avatar} />
    </svg>
  );
}
