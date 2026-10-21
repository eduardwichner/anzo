// Flat, child-friendly inline SVG icons. All decorative (aria-hidden); pair them with text or aria-label.
const base = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 32 32', 'aria-hidden': true, focusable: 'false' };

export function IconStar(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M16 2.8l3.9 8 8.8 1.2-6.4 6.1 1.6 8.7L16 22.6l-7.9 4.2 1.6-8.7-6.4-6.1 8.8-1.2z" />
    </svg>
  );
}

/** Last week's top learner on the family board. */
export function IconCrown(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M4 10l6.5 5.5L16 6l5.5 9.5L28 10l-2.5 14h-19z" />
      <rect x="6.5" y="25.5" width="19" height="3" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconFlame(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M16 2c1 5.5 7.5 8.3 7.5 16.1A7.6 7.6 0 0 1 16 30a7.6 7.6 0 0 1-7.5-7.9c0-3.6 1.8-6 3.6-7.8.3 2.4 1.4 3.9 2.9 4.5C14.2 13.4 14.4 7.6 16 2z" />
      <path fill="var(--icon-highlight)" opacity="0.55" d="M16 18.5c.5 2.6 3.4 3.6 3.4 6.4a3.4 3.4 0 0 1-6.8 0c0-1.9 1.3-3 2.3-3.9.1 1 .5 1.6 1.1 1.8-.4-1.5-.3-3 0-4.3z" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" d="M6.5 16.5l6 6L25.5 9.5" />
    </svg>
  );
}

export function IconCross(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" d="M9 9l14 14M23 9L9 23" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...base} {...props}>
      <rect x="6.5" y="14" width="19" height="14" rx="4" fill="currentColor" />
      <path fill="none" stroke="currentColor" strokeWidth="3.5" d="M11 14.5V11a5 5 0 0 1 10 0v3.5" />
    </svg>
  );
}

export function IconSpeaker(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M4 12h5l7-6v20l-7-6H4z" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M20.5 11.5a6 6 0 0 1 0 9M24 8a11 11 0 0 1 0 16" />
    </svg>
  );
}

export function IconSpeakerOff(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M4 12h5l7-6v20l-7-6H4z" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M20.5 12.5l7 7M27.5 12.5l-7 7" />
    </svg>
  );
}

export function IconTurtle(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="14" cy="17" rx="10" ry="7.5" fill="currentColor" />
      <path fill="var(--icon-highlight)" opacity="0.45" d="M8 16.5l3-4h6l3 4-3 4h-6z" />
      <circle cx="26.5" cy="16" r="3.5" fill="currentColor" />
      <rect x="6.5" y="22" width="4" height="5" rx="2" fill="currentColor" />
      <rect x="16" y="22" width="4" height="5" rx="2" fill="currentColor" />
      <path fill="currentColor" d="M4.5 17.5l-2.5 1.5 2.8.8z" />
    </svg>
  );
}

export function IconBack(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M19.5 6.5L10 16l9.5 9.5" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" d="M8 8l16 16M24 8L8 24" />
    </svg>
  );
}

export function IconPlus(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" d="M16 6v20M6 16h20" />
    </svg>
  );
}

export function IconChevron(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M12 7l9 9-9 9" />
    </svg>
  );
}

export function IconArrowDown(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M16 5v21M7.5 17.5L16 26l8.5-8.5" />
    </svg>
  );
}

export function IconGear(props) {
  return (
    <svg {...base} {...props}>
      <path
        fill="currentColor"
        d="M13.6 2.5h4.8l.7 3.7a10 10 0 0 1 2.6 1.5l3.5-1.3 2.4 4.2-2.9 2.4a10 10 0 0 1 0 3l2.9 2.4-2.4 4.2-3.5-1.3a10 10 0 0 1-2.6 1.5l-.7 3.7h-4.8l-.7-3.7a10 10 0 0 1-2.6-1.5l-3.5 1.3-2.4-4.2 2.9-2.4a10 10 0 0 1 0-3L4.4 10.6l2.4-4.2 3.5 1.3a10 10 0 0 1 2.6-1.5zM16 11.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"
      />
    </svg>
  );
}

export function IconLevels(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="19" width="7" height="9" rx="2" fill="currentColor" />
      <rect x="12.5" y="12" width="7" height="16" rx="2" fill="currentColor" />
      <rect x="21" y="5" width="7" height="23" rx="2" fill="currentColor" />
    </svg>
  );
}

export function IconPractice(props) {
  return (
    <svg {...base} {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 15a9 9 0 0 1 15.5-6.2" />
        <path d="M25 17a9 9 0 0 1-15.5 6.2" />
        <path d="M23 4v5h-5M9 28v-5h5" />
      </g>
    </svg>
  );
}

export function IconPaw(props) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="16" cy="21.5" rx="7" ry="6" fill="currentColor" />
      <circle cx="7.5" cy="13" r="3" fill="currentColor" />
      <circle cx="12.5" cy="7.5" r="3" fill="currentColor" />
      <circle cx="19.5" cy="7.5" r="3" fill="currentColor" />
      <circle cx="24.5" cy="13" r="3" fill="currentColor" />
    </svg>
  );
}

export function IconFamily(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="8" r="4" fill="currentColor" />
      <circle cx="22" cy="8" r="4" fill="currentColor" />
      <circle cx="16" cy="17" r="3" fill="currentColor" />
      <path fill="currentColor" d="M4 26c0-7 2.7-11 6-11s4 2 4 2l-2 9zM28 26c0-7-2.7-11-6-11s-4 2-4 2l2 9zM11.5 28c0-4 2-6.5 4.5-6.5s4.5 2.5 4.5 6.5z" />
    </svg>
  );
}

export function IconBook(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M4 6.5C8 5 12 5.5 15 8v19c-3-2.5-7-3-11-1.5zM28 6.5C24 5 20 5.5 17 8v19c3-2.5 7-3 11-1.5z" />
    </svg>
  );
}

const UNIT_ICONS = { animals: IconPaw, family: IconFamily };

/** Icon for a unit's `icon` field in the content pack; falls back to a book. */
export function UnitIcon({ name, ...props }) {
  const Icon = UNIT_ICONS[name] || IconBook;
  return <Icon {...props} />;
}

export function IconFlag(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M8 29V4" />
      <path fill="currentColor" d="M9 5h15l-3.5 5.5L24 16H9z" />
    </svg>
  );
}

export function IconInfo(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="16" cy="10" r="2.1" fill="currentColor" />
      <path stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" d="M16 15v8" />
    </svg>
  );
}

export function IconInbox(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" d="M4 18l4-12h16l4 12v8H4z" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" d="M4 18h7l1.5 3h7l1.5-3h7" />
    </svg>
  );
}

export function IconPencil(props) {
  return (
    <svg {...base} {...props}>
      <path fill="currentColor" d="M21.5 4.5l6 6L12 26l-7.5 1.5L6 20z" />
      <path fill="var(--icon-highlight)" opacity="0.45" d="M19 7l6 6-2 2-6-6z" />
    </svg>
  );
}

export function IconPulse(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M3 17h6l3-8 5 15 4-11 2 4h6" />
    </svg>
  );
}

export function IconHeadphones(props) {
  return (
    <svg {...base} {...props}>
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M6 20v-4a10 10 0 0 1 20 0v4" />
      <rect fill="currentColor" x="4" y="18" width="6" height="9" rx="2" />
      <rect fill="currentColor" x="22" y="18" width="6" height="9" rx="2" />
    </svg>
  );
}

export function IconCopy(props) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="10" width="17" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="3" />
      <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M6 21V7a3 3 0 0 1 3-3h12" />
    </svg>
  );
}
