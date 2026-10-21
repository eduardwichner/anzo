// One shared HTMLAudioElement for the whole app. iOS Safari only allows programmatic play() after
// the element has played once inside a user gesture, so the tap that opens a lesson calls unlock(),
// which plays a silent clip. Starting a clip stops the previous one. State: { playing, url }.
import { setSpeechProbe, stopSfx, unlockSfx } from './sfx.js';

const SILENCE = '/silence.mp3';

let el = null;
let unlocked = false;
let state = { playing: false, url: null, sequence: null }; // sequence: { key, index } while a text plays
const listeners = new Set();

function set(next) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

function element() {
  if (el) return el;
  el = document.createElement('audio');
  el.id = 'anzo-audio'; // tests hook its events
  el.preload = 'auto';
  el.hidden = true;
  el.addEventListener('playing', () => set({ playing: el.currentSrc && !el.currentSrc.endsWith(SILENCE) }));
  el.addEventListener('pause', () => {
    set({ playing: false });
    // paused from outside (an iOS call, the screen locked, a headset button): the sequence waits for ▶
    if (selfPauses > 0) {
      selfPauses -= 1;
      return;
    }
    if (seq && !el.ended) holdSequence();
  });
  el.addEventListener('ended', () => {
    set({ playing: false, url: null });
    if (seq) advance();
  });
  el.addEventListener('error', () => {
    set({ playing: false, url: null });
    // a clip that cannot load (404, the network dropped) is skipped: the rest of the text still plays
    if (seq && !seq.paused) advance();
  });
  document.body.appendChild(el);
  return el;
}

/** Call synchronously inside a tap/click handler. Safe to call repeatedly. Also unlocks the sound effects. */
export function unlock() {
  unlockSfx();
  if (unlocked) return;
  const a = element();
  a.src = SILENCE;
  const p = a.play();
  unlocked = true;
  if (p && p.catch) {
    p.catch((err) => {
      // AbortError = a real clip started right away (fine); NotAllowedError = the browser refused.
      if (err?.name === 'NotAllowedError') unlocked = false;
    });
  }
}

export function isUnlocked() {
  return unlocked;
}

const sameSrc = (a, url) => {
  try {
    return Boolean(a.getAttribute('src')) && new URL(a.src, location.href).href === new URL(url, location.href).href;
  } catch {
    return false;
  }
};

/**
 * Play a clip. Resolves true if playback started, false if the browser refused or there is no URL.
 * Safe under any sequence of taps: a new clip stops the current one; the same clip again restarts it from the start
 * without loading it again (WebKit would otherwise fetch the file on every tap); a play() interrupted by the next tap
 * resolves false and never throws.
 */
export async function play(url) {
  if (!url) return false;
  cancelSequence();
  return playOne(url);
}

// Pauses the player makes itself (a new clip, stop, ⏸) are not interruptions; the `pause` event arrives later (a task), so
// they are counted: only a playing element fires it.
let selfPauses = 0;
const pauseQuietly = (a) => {
  if (!a.paused) selfPauses += 1;
  a.pause();
};

async function playOne(url) {
  stopSfx(); // speech has priority over sound effects
  const a = element();
  pauseQuietly(a);
  if (sameSrc(a, url) && a.readyState > 0) {
    try {
      a.currentTime = 0;
    } catch {
      a.src = url;
    }
  } else {
    a.src = url;
  }
  set({ url, playing: false });
  try {
    await a.play();
    return true;
  } catch {
    if (state.url === url) set({ playing: false, url: null });
    return false;
  }
}

export function stop() {
  cancelSequence();
  if (el) pauseQuietly(el);
  set({ playing: false, url: null });
}

// ---- sequences: a text read sentence by sentence (texts, dialogues, listening) --------------------------------------
// items: [{ url, pauseMs }] — each clip, then a pause (short between sentences, longer between paragraphs or turns).
// Any other play() or stop() ends the sequence. state.sequence = { key, index, total, paused } drives the highlight of the
// current sentence and the progress ("3 / 24"); a long text can be paused and resumed. Turns of speaker B
// carry the dialogue voice's clip URLs, so two voices alternate. A clip that fails is skipped; an interruption holds.
let seq = null;
let timer = null;

const publish = (s) => set({ sequence: s ? { key: s.key, index: s.index, total: s.items.length, paused: Boolean(s.paused) } : null });

function cancelSequence() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (seq) {
    seq = null;
    set({ sequence: null });
  }
}

/** Start the clip at seq.index; a refusal (no gesture, aborted) holds the sequence, a load error skips the clip. */
async function playCurrent(s) {
  const ok = await playOne(s.items[s.index].url);
  if (ok || seq !== s) return ok;
  if (el?.error) advance();
  else holdSequence();
  return false;
}

function advance() {
  const s = seq;
  if (!s) return;
  const pause = s.items[s.index]?.pauseMs ?? 0;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (seq !== s || s.paused) return;
    s.index += 1;
    if (s.index >= s.items.length) {
      seq = null;
      set({ sequence: null });
      return;
    }
    publish(s);
    playCurrent(s);
  }, pause);
}

function holdSequence() {
  if (!seq) return;
  if (timer) clearTimeout(timer);
  timer = null;
  seq.paused = true;
  publish(seq);
}

/** Play clips one after another. Resolves when the first clip starts (true) or the browser refused (false). */
export async function playSequence(key, items) {
  const list = (items || []).filter((x) => x?.url);
  stop();
  if (!list.length) return false;
  const s = { key, items: list, index: 0, paused: false };
  seq = s;
  publish(s);
  const ok = await playOne(list[0].url);
  if (!ok && seq === s) {
    if (el?.error && list.length > 1) {
      advance();
      return true;
    }
    cancelSequence();
  }
  return ok;
}

/** ⏸ a running text: the current sentence stops; ▶ (resumeSequence) starts it again. */
export function pauseSequence() {
  if (!seq || seq.paused) return;
  if (el) pauseQuietly(el);
  holdSequence();
}

/** ▶ after ⏸ (or an interruption): the current sentence from its start, then on. Call inside a tap (iOS). */
export function resumeSequence() {
  const s = seq;
  if (!s || !s.paused) return Promise.resolve(false);
  s.paused = false;
  publish(s);
  return playCurrent(s);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

setSpeechProbe(() => state.playing);
