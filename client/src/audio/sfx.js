// Sound effects synthesized with the Web Audio API (oscillators and envelopes; no audio files): a chime on a correct
// answer, a soft low tone on a wrong one, a little fanfare when a lesson or practice is done.
// The AudioContext is created and resumed inside the same tap that unlocks speech (player.unlock), which iOS requires.
// Speech has priority: no effect starts while a clip plays, and a clip that starts silences any effect.
// Per user on/off (users.sound_effects), set by AuthContext through setSfxEnabled().
let ctx = null;
let master = null;
let enabled = true;
let speaking = () => false;

const NOTES = {
  correct: [{ f: 880, t: 0, d: 0.13 }, { f: 1318.5, t: 0.1, d: 0.22 }],
  wrong: [{ f: 233, t: 0, d: 0.18, type: 'triangle' }, { f: 196, t: 0.14, d: 0.3, type: 'triangle' }],
  done: [
    { f: 523.3, t: 0, d: 0.14 }, { f: 659.3, t: 0.12, d: 0.14 }, { f: 784, t: 0.24, d: 0.14 },
    { f: 1046.5, t: 0.38, d: 0.5 }, { f: 784, t: 0.38, d: 0.5 }, { f: 659.3, t: 0.38, d: 0.5 },
  ],
};
const VOLUME = { correct: 0.18, wrong: 0.14, done: 0.12 };

export function setSfxEnabled(on) {
  enabled = Boolean(on);
}

/** player.js tells us how to see whether speech is playing (avoids an import cycle). */
export function setSpeechProbe(fn) {
  speaking = fn;
}

/** Call inside a user gesture (player.unlock does). Safe to call repeatedly. */
export function unlockSfx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      // iOS suspends ("interrupted") the context after a call or an app switch: resume it on the next tap, or when the
      // app is visible again (allowed when the context was unlocked before).
      const wake = () => {
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
      };
      document.addEventListener('click', wake, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // A one-sample silent buffer, played inside the gesture, unlocks output on iOS.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(master);
    src.start(0);
  } catch {
    ctx = null; // no Web Audio: effects stay silent
  }
}

const WAIT_FOR_SPEECH_MS = 2000;
let pending = null;

/** Silence any effect at once and drop a waiting one (a speech clip starts: the moment has passed). */
export function stopSfx() {
  if (pending) clearInterval(pending.timer);
  pending = null;
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(0, now);
  // Fresh output for the next effect; the old voices end on their own.
  master.disconnect();
  master = ctx.createGain();
  master.connect(ctx.destination);
}

/**
 * name: 'correct' | 'wrong' | 'done'. While speech plays, the effect waits for it to end (at most 2 s, then it is
 * dropped); a newer effect, or a new clip, replaces a waiting one.
 */
export function playSfx(name) {
  if (!enabled || !NOTES[name] || !ctx) return;
  if (pending) clearInterval(pending.timer);
  pending = null;
  if (!speaking()) {
    sound(name);
    return;
  }
  const until = Date.now() + WAIT_FOR_SPEECH_MS;
  const timer = setInterval(() => {
    if (speaking() && Date.now() < until) return;
    clearInterval(timer);
    pending = null;
    if (!speaking()) sound(name);
  }, 100);
  pending = { timer };
}

function sound(name) {
  const notes = NOTES[name];
  if (!enabled || !ctx || ctx.state !== 'running') return false;
  if (typeof window !== 'undefined') (window.__anzoSfx ??= []).push(name); // tests read this
  const start = ctx.currentTime + 0.01;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.f;
    const t0 = start + n.t;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(VOLUME[name], t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + n.d + 0.05);
  }
  return true;
}
