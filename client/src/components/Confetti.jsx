// CSS confetti: a few dozen falling pieces, positioned and timed per piece. Purely decorative; hidden entirely with
// prefers-reduced-motion (base.css).
const COLOURS = [1, 2, 3, 4, 5, 6].map((n) => `var(--confetti-${n})`); // tokens.css
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  duration: 1.8 + ((i * 29) % 12) / 10,
  colour: COLOURS[i % COLOURS.length],
  spin: (i * 47) % 360,
  wide: i % 3 === 0,
}));

export default function Confetti() {
  return (
    <div className="confetti" aria-hidden="true" data-testid="confetti">
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={`confetti-piece${p.wide ? ' confetti-piece--wide' : ''}`}
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, background: p.colour, transform: `rotate(${p.spin}deg)` }}
        />
      ))}
    </div>
  );
}
