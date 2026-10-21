// Real synthesizer (Piper via synth.py in tools/piper-venv) and encoder (lame) for the render scripts.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from './collect.js';

export const VENV_PYTHON = path.join(ROOT, 'tools', 'piper-venv', 'bin', 'python');
export const PIPER_DIR = path.join(ROOT, 'models', 'piper');
const SYNTH = path.join(ROOT, 'scripts', 'render-audio', 'synth.py');

// onnxruntime cannot pin threads inside a container and says so once per loaded voice; the message is harmless.
const HARMLESS = /pthread_setaffinity_np failed/;

export function modelPath(voice) {
  const p = path.join(PIPER_DIR, `${voice}.onnx`);
  if (!fs.existsSync(p)) throw new Error(`voice model ${p} is missing; run scripts/fetch-models.sh`);
  return p;
}

/**
 * Jobs split over `workers` synth.py processes (at most 4), sorted by voice and cut into contiguous slices, so each process
 * loads few voices (≈ 310 MB for one, + 190 MB per further voice). Each process runs onnxruntime on one thread (≤ 4 in all,
 * standing rule 13): a seeded clip renders to the same samples only on the same number of threads, and four
 * single-thread processes render ≈ 1.6 × faster than one with 4 threads.
 */
export function splitJobs(jobs, workers) {
  const n = Math.max(1, Math.min(4, workers, jobs.length));
  const sorted = [...jobs].sort((a, b) => a.voice.localeCompare(b.voice));
  const size = Math.ceil(sorted.length / n);
  return Array.from({ length: n }, (_, i) => sorted.slice(i * size, (i + 1) * size)).filter((x) => x.length);
}

/** One long-lived synth.py process per worker: each voice is loaded once, clips stream through stdin/stdout. */
export const piperSynthesizer = {
  async synthesize(jobs, { workers = 1 } = {}) {
    const slices = splitJobs(jobs, workers);
    const parts = await Promise.all(slices.map((slice) => this.run(slice, 1)));
    return parts.flat();
  },
  run(jobs, threads = 4) {
    if (!fs.existsSync(VENV_PYTHON)) {
      return Promise.reject(new Error(`${VENV_PYTHON} is missing; run scripts/fetch-models.sh`));
    }
    return new Promise((resolve, reject) => {
      const child = spawn(VENV_PYTHON, [SYNTH], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ANZO_ONNX_THREADS: String(threads) } });
      const results = [];
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        if (line.trim()) results.push(JSON.parse(line));
      });
      readline.createInterface({ input: child.stderr }).on('line', (line) => {
        if (!HARMLESS.test(line)) process.stderr.write(`[synth.py] ${line}\n`);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) reject(new Error(`synth.py exited with ${code}`));
        else resolve(results);
      });
      // every synthesis field: the carrier sentence of a short clip, the noise seed, the speed class, the lexicon's hiatus
      // breaks; an override (content/audio-overrides.json) may set `end` and — older entries only — noiseScale,
      // noiseW, trim
      for (const { voice, text, out, lengthScale, speaker, noiseScale, noiseW, trim, carrier, end, seed, slow, hiatus } of jobs) {
        child.stdin.write(`${JSON.stringify({ voice, text, out, lengthScale, speaker, noiseScale, noiseW, trim, carrier, end, seed, slow, hiatus })}\n`);
      }
      child.stdin.end();
    });
  },
};

/** WAV -> MP3, mono voice preset (~56 kbps). */
export function lameEncode(wav, mp3) {
  return new Promise((resolve, reject) => {
    const child = spawn('lame', ['--quiet', '--preset', 'voice', '-m', 'm', wav, mp3], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`lame not found (${e.message}); apt install lame`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`lame failed (${code}): ${err.trim()}`))));
  });
}
