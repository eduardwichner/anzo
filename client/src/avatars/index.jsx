// 16 original avatars in the app's flat style: simple faces on a 100×100 canvas, drawn to stay inside the
// round background that <Avatar> paints. Ids (ids.js) are stored per user and must never be renamed.
import { AVATAR_BGS, AVATAR_IDS } from './ids.js';

export { AVATAR_BGS, AVATAR_IDS };

const INK = '#1d2340';
const WHITE = '#ffffff';
const PINK = '#f7a1b5';

// Two round eyes with a highlight.
function Eyes({ y = 50, dx = 12, r = 4.5, cx = 50 }) {
  return (
    <g>
      <circle cx={cx - dx} cy={y} r={r} fill={INK} />
      <circle cx={cx + dx} cy={y} r={r} fill={INK} />
      <circle cx={cx - dx + r / 3} cy={y - r / 3} r={r / 3} fill={WHITE} />
      <circle cx={cx + dx + r / 3} cy={y - r / 3} r={r / 3} fill={WHITE} />
    </g>
  );
}

const Smile = ({ y = 66, w = 7, stroke = INK }) => (
  <path d={`M${50 - w} ${y} Q50 ${y + w * 0.9} ${50 + w} ${y}`} fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
);

const Cheeks = ({ y = 62, dx = 22, fill = PINK }) => (
  <g opacity="0.7">
    <ellipse cx={50 - dx} cy={y} rx="5" ry="3.2" fill={fill} />
    <ellipse cx={50 + dx} cy={y} rx="5" ry="3.2" fill={fill} />
  </g>
);

const DRAWINGS = {
  fox: () => (
    <g>
      <path d="M20 42 L26 12 L46 30 Z" fill="#f07a2b" />
      <path d="M80 42 L74 12 L54 30 Z" fill="#f07a2b" />
      <path d="M26 34 L29 20 L39 30 Z" fill="#5a2a10" />
      <path d="M74 34 L71 20 L61 30 Z" fill="#5a2a10" />
      <path d="M16 46 Q18 26 50 26 Q82 26 84 46 Q84 66 50 86 Q16 66 16 46 Z" fill="#f07a2b" />
      <path d="M18 52 Q34 58 50 60 Q66 58 82 52 Q76 74 50 86 Q24 74 18 52 Z" fill="#fff4ea" />
      <Eyes y={47} dx={14} />
      <ellipse cx="50" cy="64" rx="5.5" ry="4" fill={INK} />
      <Smile y={71} w={5} />
    </g>
  ),
  owl: () => (
    <g>
      <path d="M22 30 L30 16 L38 30 Z" fill="#8a5a3b" />
      <path d="M78 30 L70 16 L62 30 Z" fill="#8a5a3b" />
      <ellipse cx="50" cy="56" rx="32" ry="32" fill="#8a5a3b" />
      <ellipse cx="50" cy="68" rx="20" ry="18" fill="#e8c9a0" />
      <circle cx="37" cy="46" r="12" fill={WHITE} />
      <circle cx="63" cy="46" r="12" fill={WHITE} />
      <Eyes y={46} dx={13} r={6} />
      <path d="M45 56 L55 56 L50 65 Z" fill="#f5a524" />
      <path d="M40 74 Q44 78 48 74 M52 74 Q56 78 60 74" fill="none" stroke="#b8926a" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  cat: () => (
    <g>
      <path d="M20 44 L24 14 L44 30 Z" fill="#9aa3b5" />
      <path d="M80 44 L76 14 L56 30 Z" fill="#9aa3b5" />
      <path d="M25 36 L27 22 L37 30 Z" fill={PINK} />
      <path d="M75 36 L73 22 L63 30 Z" fill={PINK} />
      <ellipse cx="50" cy="56" rx="33" ry="29" fill="#9aa3b5" />
      <path d="M40 30 L42 38 M50 28 L50 37 M60 30 L58 38" stroke="#7a8397" strokeWidth="3" strokeLinecap="round" />
      <Eyes y={52} dx={13} r={5} />
      <path d="M46 61 L54 61 L50 66 Z" fill={PINK} />
      <path d="M50 66 Q46 71 42 68 M50 66 Q54 71 58 68" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 58 L32 61 M14 66 L32 65 M86 58 L68 61 M86 66 L68 65" stroke={INK} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </g>
  ),
  dog: () => (
    <g>
      <ellipse cx="50" cy="54" rx="29" ry="30" fill="#e3b27a" />
      <path d="M24 30 Q10 34 14 62 Q20 70 28 60 Z" fill="#8a5a3b" />
      <path d="M76 30 Q90 34 86 62 Q80 70 72 60 Z" fill="#8a5a3b" />
      <ellipse cx="62" cy="44" rx="9" ry="8" fill="#c98f55" />
      <ellipse cx="50" cy="68" rx="16" ry="12" fill="#f6dfc0" />
      <Eyes y={48} dx={12} />
      <ellipse cx="50" cy="63" rx="6" ry="4.5" fill={INK} />
      <path d="M50 67 L50 71 M44 71 Q50 76 56 71" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M47 74 Q50 82 53 74 Z" fill="#f26b7a" />
    </g>
  ),
  bear: () => (
    <g>
      <circle cx="25" cy="30" r="11" fill="#8b5e3c" />
      <circle cx="75" cy="30" r="11" fill="#8b5e3c" />
      <circle cx="25" cy="30" r="5.5" fill="#c99a70" />
      <circle cx="75" cy="30" r="5.5" fill="#c99a70" />
      <circle cx="50" cy="56" r="32" fill="#8b5e3c" />
      <ellipse cx="50" cy="68" rx="15" ry="12" fill="#e2c29f" />
      <Eyes y={50} dx={13} />
      <ellipse cx="50" cy="63" rx="6" ry="4.2" fill={INK} />
      <Smile y={70} w={5} />
    </g>
  ),
  rabbit: () => (
    <g>
      <ellipse cx="37" cy="24" rx="8" ry="20" fill="#eef0f5" />
      <ellipse cx="63" cy="24" rx="8" ry="20" fill="#eef0f5" />
      <ellipse cx="37" cy="26" rx="4" ry="14" fill={PINK} />
      <ellipse cx="63" cy="26" rx="4" ry="14" fill={PINK} />
      <ellipse cx="50" cy="60" rx="28" ry="26" fill="#eef0f5" />
      <Eyes y={55} dx={11} />
      <Cheeks y={65} dx={18} />
      <path d="M46 63 L54 63 L50 67 Z" fill={PINK} />
      <path d="M50 67 Q46 72 43 69 M50 67 Q54 72 57 69" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <rect x="47" y="71" width="6" height="6" rx="1.5" fill={WHITE} stroke="#c9cedb" strokeWidth="1" />
    </g>
  ),
  panda: () => (
    <g>
      <circle cx="24" cy="30" r="11" fill={INK} />
      <circle cx="76" cy="30" r="11" fill={INK} />
      <circle cx="50" cy="56" r="32" fill="#fbfbfd" />
      <ellipse cx="37" cy="52" rx="9" ry="11" fill={INK} transform="rotate(-25 37 52)" />
      <ellipse cx="63" cy="52" rx="9" ry="11" fill={INK} transform="rotate(25 63 52)" />
      <circle cx="38" cy="51" r="3.5" fill={WHITE} />
      <circle cx="62" cy="51" r="3.5" fill={WHITE} />
      <ellipse cx="50" cy="65" rx="5" ry="3.8" fill={INK} />
      <Smile y={71} w={5} />
    </g>
  ),
  frog: () => (
    <g>
      <circle cx="33" cy="32" r="13" fill="#5cc26b" />
      <circle cx="67" cy="32" r="13" fill="#5cc26b" />
      <ellipse cx="50" cy="60" rx="36" ry="26" fill="#5cc26b" />
      <circle cx="33" cy="32" r="8" fill={WHITE} />
      <circle cx="67" cy="32" r="8" fill={WHITE} />
      <Eyes y={33} dx={17} r={4.5} />
      <path d="M28 62 Q50 82 72 62" fill="none" stroke="#1f6b35" strokeWidth="3" strokeLinecap="round" />
      <Cheeks y={60} dx={27} fill="#f79ab0" />
      <circle cx="45" cy="50" r="1.6" fill="#1f6b35" />
      <circle cx="55" cy="50" r="1.6" fill="#1f6b35" />
    </g>
  ),
  penguin: () => (
    <g>
      <ellipse cx="50" cy="56" rx="32" ry="33" fill="#2f3a5c" />
      <path d="M50 42 Q38 28 28 42 Q22 62 34 76 Q42 84 50 84 Q58 84 66 76 Q78 62 72 42 Q62 28 50 42 Z" fill="#fbfbfd" />
      <Eyes y={52} dx={11} />
      <path d="M43 60 L57 60 L50 69 Z" fill="#f5a524" />
      <Cheeks y={64} dx={17} />
    </g>
  ),
  lion: () => (
    <g>
      <g fill="#c8741f">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={50 + Math.cos(a) * 30} cy={54 + Math.sin(a) * 30} r="12" />;
        })}
      </g>
      <circle cx="50" cy="54" r="27" fill="#f4bf4f" />
      <circle cx="31" cy="34" r="6" fill="#f4bf4f" />
      <circle cx="69" cy="34" r="6" fill="#f4bf4f" />
      <Eyes y={50} dx={11} />
      <ellipse cx="50" cy="66" rx="12" ry="9" fill="#fbe3a6" />
      <path d="M45 61 L55 61 L50 66 Z" fill="#8b4a1c" />
      <path d="M50 66 Q46 71 43 68 M50 66 Q54 71 57 68" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  mouse: () => (
    <g>
      <circle cx="26" cy="32" r="16" fill="#b8bfcc" />
      <circle cx="74" cy="32" r="16" fill="#b8bfcc" />
      <circle cx="26" cy="32" r="10" fill={PINK} />
      <circle cx="74" cy="32" r="10" fill={PINK} />
      <path d="M22 56 Q22 34 50 34 Q78 34 78 56 Q74 80 50 84 Q26 80 22 56 Z" fill="#b8bfcc" />
      <Eyes y={54} dx={11} />
      <circle cx="50" cy="68" r="4" fill={PINK} />
      <path d="M26 64 L42 67 M26 72 L42 70 M74 64 L58 67 M74 72 L58 70" stroke={INK} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <Smile y={74} w={4} />
    </g>
  ),
  koala: () => (
    <g>
      <circle cx="21" cy="38" r="15" fill="#9aa3b5" />
      <circle cx="79" cy="38" r="15" fill="#9aa3b5" />
      <circle cx="21" cy="38" r="8.5" fill="#eef0f5" />
      <circle cx="79" cy="38" r="8.5" fill="#eef0f5" />
      <ellipse cx="50" cy="56" rx="28" ry="29" fill="#9aa3b5" />
      <Eyes y={48} dx={13} r={4} />
      <ellipse cx="50" cy="62" rx="8" ry="10" fill="#3a3f55" />
      <Smile y={76} w={5} />
    </g>
  ),
  pig: () => (
    <g>
      <path d="M22 38 L26 18 L42 30 Z" fill="#f59ab0" />
      <path d="M78 38 L74 18 L58 30 Z" fill="#f59ab0" />
      <circle cx="50" cy="56" r="31" fill="#f8b4c4" />
      <Eyes y={48} dx={13} r={4} />
      <ellipse cx="50" cy="64" rx="12" ry="9" fill="#f59ab0" />
      <ellipse cx="46" cy="64" rx="2.4" ry="3.4" fill="#b34d6b" />
      <ellipse cx="54" cy="64" rx="2.4" ry="3.4" fill="#b34d6b" />
      <Smile y={77} w={5} stroke="#b34d6b" />
    </g>
  ),
  hedgehog: () => (
    <g>
      <path
        d="M14 64 L10 48 L20 50 L16 34 L28 40 L28 24 L38 32 L44 16 L50 30 L58 16 L62 32 L72 24 L72 40 L84 34 L80 50 L90 48 L86 64 Z"
        fill="#7a5236"
      />
      <path d="M22 62 Q22 40 50 40 Q78 40 78 62 Q74 84 50 86 Q26 84 22 62 Z" fill="#f1d3ad" />
      <Eyes y={58} dx={11} />
      <circle cx="50" cy="69" r="4.5" fill={INK} />
      <Cheeks y={70} dx={19} />
      <Smile y={75} w={4} />
    </g>
  ),
  robot: () => (
    <g>
      <line x1="50" y1="12" x2="50" y2="26" stroke="#7c86a3" strokeWidth="3" />
      <circle cx="50" cy="12" r="5" fill="#ff6b61" />
      <rect x="20" y="26" width="60" height="54" rx="12" fill="#b9c3d9" />
      <rect x="12" y="44" width="8" height="18" rx="3" fill="#7c86a3" />
      <rect x="80" y="44" width="8" height="18" rx="3" fill="#7c86a3" />
      <rect x="28" y="38" width="44" height="22" rx="8" fill="#2f3a5c" />
      <rect x="35" y="44" width="10" height="10" rx="3" fill="#6fe3ff" />
      <rect x="55" y="44" width="10" height="10" rx="3" fill="#6fe3ff" />
      <rect x="34" y="66" width="32" height="7" rx="3.5" fill="#7c86a3" />
      <path d="M42 66 V73 M50 66 V73 M58 66 V73" stroke="#b9c3d9" strokeWidth="2" />
    </g>
  ),
  dino: () => (
    <g>
      <path d="M30 30 L36 16 L42 28 L48 12 L54 28 L60 16 L66 30 Z" fill="#f5a524" />
      <path d="M20 58 Q18 28 50 28 Q82 28 82 54 Q84 80 50 84 Q20 84 20 58 Z" fill="#6cc3a0" />
      <ellipse cx="50" cy="70" rx="24" ry="12" fill="#a7e0c6" />
      <Eyes y={48} dx={14} />
      <circle cx="44" cy="66" r="1.8" fill="#2d7a5c" />
      <circle cx="56" cy="66" r="1.8" fill="#2d7a5c" />
      <path d="M36 74 Q50 82 64 74" fill="none" stroke="#2d7a5c" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M44 76 L46 80 L48 77 M52 77 L54 80 L56 76" fill={WHITE} />
    </g>
  ),
};

/** The drawing of one avatar (no background). Unknown ids fall back to the owl. */
export function AvatarDrawing({ id }) {
  const Drawing = DRAWINGS[id] ?? DRAWINGS.owl;
  return <Drawing />;
}
