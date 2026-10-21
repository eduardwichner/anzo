// The track mascots, drawn here as flat inline SVG: an otter (English), a fox (French) and a lion (Dutch — the Flemish
// lion), named by the manifest.
// Poses: idle (Home), happy (correct answer), encouraging (wrong answer), celebrating (lesson / practice done, goal
// reached), sleeping (Home when the streak is at risk). Motion is CSS (.mascot--<pose>) and stops with reduced motion.

export const POSES = ['idle', 'happy', 'encouraging', 'celebrating', 'sleeping'];

const SPECIES = {
  otter: { fur: '#9a6643', dark: '#6e4529', light: '#f1d9bd', nose: '#3b2a21', inner: '#c98f6a' },
  fox: { fur: '#f07b2f', dark: '#c2551a', light: '#fff4e6', nose: '#2f2420', inner: '#5a2d14' },
  lion: { fur: '#f2b13d', dark: '#c98316', light: '#fde7b6', nose: '#5b3420', inner: '#d98f2b', mane: '#b8591c', maneLight: '#d77a2a' },
};

/** The lion's mane: a scalloped ring behind the head (12 tufts), lighter tufts in between. */
function Mane({ c }) {
  const tufts = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: 60 + Math.cos(a) * 30, y: 46 + Math.sin(a) * 28, k: i };
  });
  return (
    <g>
      <ellipse cx="60" cy="46" rx="33" ry="31" fill={c.mane} />
      {tufts.map((t) => <circle key={t.k} cx={t.x.toFixed(1)} cy={t.y.toFixed(1)} r="10" fill={t.k % 2 ? c.maneLight : c.mane} />)}
    </g>
  );
}
const INK = '#2a2230';
const BLUSH = '#ff9aa2';

function Ears({ kind, c }) {
  if (kind === 'lion') {
    return (
      <g>
        <circle cx="39" cy="25" r="7" fill={c.fur} />
        <circle cx="81" cy="25" r="7" fill={c.fur} />
        <circle cx="39" cy="25" r="3.5" fill={c.inner} />
        <circle cx="81" cy="25" r="3.5" fill={c.inner} />
      </g>
    );
  }
  if (kind === 'fox') {
    return (
      <g>
        <path d="M33 38 L30 8 L54 26 Z" fill={c.fur} />
        <path d="M87 38 L90 8 L66 26 Z" fill={c.fur} />
        <path d="M35 31 L33 14 L47 25 Z" fill={c.inner} />
        <path d="M85 31 L87 14 L73 25 Z" fill={c.inner} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="36" cy="27" r="8" fill={c.fur} />
      <circle cx="84" cy="27" r="8" fill={c.fur} />
      <circle cx="36" cy="27" r="4" fill={c.inner} />
      <circle cx="84" cy="27" r="4" fill={c.inner} />
    </g>
  );
}

function Tail({ kind, c }) {
  if (kind === 'lion') {
    return (
      <g className="mascot-tail">
        <path d="M84 104 C100 106 108 96 108 84" fill="none" stroke={c.fur} strokeWidth="6" strokeLinecap="round" />
        <path d="M108 84 C100 80 101 70 108 66 C115 70 116 80 108 84 Z" fill={c.mane} />
      </g>
    );
  }
  if (kind === 'fox') {
    return (
      <g className="mascot-tail">
        <path d="M84 100 C108 98 116 76 106 58 C120 66 122 92 104 106 C96 111 86 109 84 100 Z" fill={c.fur} />
        <path d="M106 58 C114 62 117 72 116 80 C111 74 107 68 106 58 Z" fill={c.light} />
      </g>
    );
  }
  return <path className="mascot-tail" d="M82 104 C100 108 112 100 114 88 C116 98 108 112 90 114 C84 114 80 110 82 104 Z" fill={c.dark} />;
}

/** Arms per pose: [left, right] as rotated rounded rectangles around the shoulders. */
const ARMS = {
  idle: [{ x: 33, y: 76, r: 18 }, { x: 87, y: 76, r: -18 }],
  happy: [{ x: 33, y: 76, r: 18 }, { x: 87, y: 72, r: -150 }],
  encouraging: [{ x: 33, y: 76, r: 18 }, { x: 87, y: 74, r: -118 }],
  celebrating: [{ x: 32, y: 74, r: 140 }, { x: 88, y: 74, r: -140 }],
  sleeping: [{ x: 42, y: 86, r: 70 }, { x: 78, y: 86, r: -70 }],
};

function Eyes({ pose }) {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 3.5, strokeLinecap: 'round' };
  if (pose === 'happy' || pose === 'celebrating') {
    return (
      <g {...stroke}>
        <path d="M42 46 Q48 39 54 46" />
        <path d="M66 46 Q72 39 78 46" />
      </g>
    );
  }
  if (pose === 'sleeping') {
    return (
      <g {...stroke}>
        <path d="M42 45 Q48 50 54 45" />
        <path d="M66 45 Q72 50 78 45" />
      </g>
    );
  }
  return (
    <g>
      {pose === 'encouraging' && (
        <g {...stroke} strokeWidth="2.5">
          <path d="M42 35 L53 33" />
          <path d="M67 33 L78 35" />
        </g>
      )}
      <circle cx="48" cy="44" r="5" fill={INK} />
      <circle cx="72" cy="44" r="5" fill={INK} />
      <circle cx="49.6" cy="42.4" r="1.8" fill="#fff" />
      <circle cx="73.6" cy="42.4" r="1.8" fill="#fff" />
    </g>
  );
}

function Mouth({ pose }) {
  if (pose === 'celebrating') return <path d="M52 60 Q60 72 68 60 Z" fill={INK} />;
  if (pose === 'sleeping') return <circle cx="60" cy="62" r="2.4" fill={INK} />;
  const d = pose === 'happy' ? 'M51 60 Q60 69 69 60' : 'M54 61 Q60 66 66 61';
  return <path d={d} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
}

function Extras({ pose }) {
  if (pose === 'celebrating') {
    return (
      <g className="mascot-sparkles">
        <path d="M14 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" fill="#ffc83d" />
        <path d="M104 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#ff8fab" />
        <path d="M108 50 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" fill="#5ec8f2" />
      </g>
    );
  }
  if (pose === 'sleeping') {
    return (
      <g className="mascot-zz" fill="none" stroke="#7b86b5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M88 22 h9 l-9 10 h9" />
        <path d="M101 6 h6 l-6 7 h6" strokeWidth="2.4" />
      </g>
    );
  }
  if (pose === 'encouraging') {
    return <path d="M100 30 c-3 -5 -11 -2 -8 4 l8 8 8 -8 c3 -6 -5 -9 -8 -4 Z" fill="#ff6b81" />;
  }
  return null;
}

/**
 * kind: 'otter' | 'fox' | 'lion' (from the manifest; anything else is an otter); pose: one of POSES.
 * Decorative: pair it with text. data-pose lets tests see the pose.
 */
export default function Mascot({ kind = 'otter', pose = 'idle', className = 'mascot', testId = 'mascot' }) {
  const species = SPECIES[kind] ? kind : 'otter';
  const c = SPECIES[species];
  const p = POSES.includes(pose) ? pose : 'idle';
  return (
    <svg
      className={`${className} mascot--${p}`}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      data-kind={species}
      data-pose={p}
    >
      <g className="mascot-figure">
        <Tail kind={species} c={c} />
        {/* feet */}
        <ellipse cx="46" cy="112" rx="10" ry="6" fill={c.dark} />
        <ellipse cx="74" cy="112" rx="10" ry="6" fill={c.dark} />
        {/* body and belly */}
        <ellipse cx="60" cy="88" rx="29" ry="25" fill={c.fur} />
        <ellipse cx="60" cy="92" rx="18" ry="17" fill={c.light} />
        {/* head */}
        {species === 'lion' && <Mane c={c} />}
        <Ears kind={species} c={c} />
        {species === 'lion' ? (
          <>
            <ellipse cx="60" cy="47" rx="27" ry="24" fill={c.fur} />
            <ellipse cx="60" cy="59" rx="15" ry="11" fill={c.light} />
          </>
        ) : species === 'fox' ? (
          <>
            <path d="M28 44 C28 22 92 22 92 44 C92 58 78 72 60 72 C42 72 28 58 28 44 Z" fill={c.fur} />
            <path d="M30 48 C38 52 48 54 60 66 C72 54 82 52 90 48 C88 62 76 73 60 73 C44 73 32 62 30 48 Z" fill={c.light} />
          </>
        ) : (
          <>
            <ellipse cx="60" cy="46" rx="31" ry="27" fill={c.fur} />
            <ellipse cx="60" cy="58" rx="17" ry="12" fill={c.light} />
          </>
        )}
        <Eyes pose={p} />
        {(p === 'happy' || p === 'celebrating') && (
          <g fill={BLUSH} opacity="0.7">
            <ellipse cx="40" cy="55" rx="5" ry="3.5" />
            <ellipse cx="80" cy="55" rx="5" ry="3.5" />
          </g>
        )}
        <ellipse cx="60" cy="54" rx="5" ry="3.6" fill={c.nose} />
        <Mouth pose={p} />
        {species === 'otter' && (
          <g stroke={c.dark} strokeWidth="1.6" strokeLinecap="round">
            <path d="M44 57 L33 55" />
            <path d="M44 61 L33 62" />
            <path d="M76 57 L87 55" />
            <path d="M76 61 L87 62" />
          </g>
        )}
        {/* arms, in front so a raised paw is never hidden by the head */}
        <g className="mascot-arms">
          {ARMS[p].map((a, i) => (
            <rect key={i} x={a.x - 6} y={a.y - 4} width="12" height="24" rx="6" fill={c.dark} transform={`rotate(${a.r} ${a.x} ${a.y})`} />
          ))}
        </g>
      </g>
      <Extras pose={p} />
    </svg>
  );
}
