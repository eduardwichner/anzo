// Badge medals, drawn as inline SVG: a round medal on two ribbon tails, a glyph per badge family and (when the badge
// has one) its number. Locked badges are drawn grey (CSS .badge-icon--locked) with a small lock.

const FAMILY = {
  lesson: { fill: '#3d8bfd', ring: '#1f63c7' },
  practice: { fill: '#2fbf8a', ring: '#178f63' },
  streak: { fill: '#ff9f1c', ring: '#d9790a' },
  perfect: { fill: '#f5b400', ring: '#c48d00' },
  unit: { fill: '#8d6cf0', ring: '#6646c9' },
  level: { fill: '#ef5d8f', ring: '#c43c6c' },
  words: { fill: '#18b4c9', ring: '#0e8697' },
  goal: { fill: '#f0532a', ring: '#c43d19' },
  bug: { fill: '#5b8c2a', ring: '#3f6a17' },
  unknown: { fill: '#9aa3bd', ring: '#78819c' },
};

function Glyph({ family }) {
  const white = { fill: '#fff' };
  switch (family) {
    case 'lesson': // an open book
      return <path {...white} d="M38 44c5-3 10-3 12 0v18c-3-2-8-2-12 0zM62 44c-5-3-10-3-12 0v18c3-2 8-2 12 0z" />;
    case 'practice': // two arrows in a circle
      return (
        <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round">
          <path d="M38 50a12 12 0 0 1 21-8" />
          <path d="M62 50a12 12 0 0 1-21 8" />
          <path d="M59 36v6h-6M41 64v-6h6" strokeLinejoin="round" />
        </g>
      );
    case 'streak':
      return <path {...white} d="M50 34c1 6 9 9 9 18a9 9 0 0 1-18 0c0-4 2-7 4-9 0 3 2 5 3 5-1-5 0-10 2-14z" />;
    case 'perfect':
      return <path {...white} d="M50 34l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L50 57.9l-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5z" />;
    case 'unit':
      return <path fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" d="M39 50l7 7 15-15" />;
    case 'level': // a trophy
      return <path {...white} d="M41 36h18v8a9 9 0 0 1-18 0zM37 38h4v4a4 4 0 0 1-4-4zM63 38h-4v4a4 4 0 0 0 4-4zM47 52h6v6h5v4H42v-4h5z" />;
    case 'words': // a speech bubble
      return <path {...white} d="M37 38h26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H49l-7 6v-6h-5a3 3 0 0 1-3-3V41a3 3 0 0 1 3-3z" />;
    case 'goal': // a target
      return (
        <g fill="none" stroke="#fff" strokeWidth="3.5">
          <circle cx="50" cy="49" r="13" />
          <circle cx="50" cy="49" r="6" />
          <circle cx="50" cy="49" r="1.5" fill="#fff" />
        </g>
      );
    case 'bug': // a magnifying glass over a ladybird dot
      return (
        <g>
          <circle cx="47" cy="46" r="10" fill="none" stroke="#fff" strokeWidth="4" />
          <path d="M54 53l9 9" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <circle cx="47" cy="46" r="4" fill="#fff" />
        </g>
      );
    default:
      return <circle cx="50" cy="49" r="8" fill="#fff" />;
  }
}

/** badge: { family, n?, cefr? } (describeBadge on the server). The label is the caller's job. */
export default function BadgeIcon({ badge, locked = false, className = '' }) {
  const c = FAMILY[badge.family] ?? FAMILY.unknown;
  const label = badge.family === 'level' ? badge.cefr : badge.n > 1 ? String(badge.n) : null;
  return (
    <svg
      className={`badge-icon${locked ? ' badge-icon--locked' : ''}${className ? ` ${className}` : ''}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-family={badge.family}
    >
      <path d="M34 66 L26 96 L38 90 L44 98 L50 72 Z" fill={c.ring} />
      <path d="M66 66 L74 96 L62 90 L56 98 L50 72 Z" fill={c.ring} />
      <circle cx="50" cy="48" r="34" fill={c.ring} />
      <circle cx="50" cy="48" r="29" fill={c.fill} />
      <circle cx="50" cy="48" r="29" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="3 4" />
      <Glyph family={badge.family} />
      {label && (
        <g>
          <rect x={50 - (label.length * 5 + 8)} y="66" width={label.length * 10 + 16} height="16" rx="8" fill="#fff" />
          <text x="50" y="78" textAnchor="middle" fontSize="13" fontWeight="800" fill={c.ring} fontFamily="system-ui, sans-serif">{label}</text>
        </g>
      )}
      {locked && (
        <g>
          <circle cx="78" cy="20" r="12" fill="#fff" />
          <path d="M72 20h12v9H72zM74.5 20v-3a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="#8a92ad" strokeWidth="2.6" />
        </g>
      )}
    </svg>
  );
}
