#!/usr/bin/env python3
"""Clip analysis worker for npm run audio:check (authoring time only; runs in tools/vosk-venv).

Reads JSON lines on stdin:  {"id": ..., "path": "/abs/audio/en/x.mp3", "track": "en"}
prints one JSON line per input:
  {"id": ..., "ok": true, "durationMs", "leadMs", "trailMs", "voicedStartMs", "voicedEndMs", "voicedMs", "peak", "clipped",
   "segments": [[startMs, endMs], ...], "onsetMs", "vowelStartMs", "vowelEndMs", "afterVowelMs", "quietTailMs",
   "transcript": "...", "words": [{"w", "start", "end", "conf"}]}
Energy: 10 ms frames, voiced when the RMS is above both -45 dBFS and 30 dB under the clip's loudest frame; voiced runs
closer than 80 ms are merged. Shape: onset = the first frame within 40 dB of the loudest (the first audible
sound); vowel-like frames = within 20 dB of the loudest with at most 30 zero crossings per 10 ms (a fricative or a hiss has
many more); afterVowel = audible frames after the last vowel-like one; quietTail = frames 30-55 dB under the loudest after
the voiced span (a murmur the voiced threshold does not see). Recognition: Vosk small model of the track
(models/vosk/<name>), loaded once, free decoding (no grammar), so extra babble shows as extra words.
"""
import json
import os
import subprocess
import sys
import wave
import io

import numpy as np
from vosk import KaldiRecognizer, Model, SetLogLevel

SetLogLevel(-1)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONFIG = json.load(open(os.path.join(ROOT, "tools", "vosk-models.json")))["models"]
_models = {}
_recognizers = {}


def model_for(track):
    if track not in _models:
        _models[track] = Model(os.path.join(ROOT, "models", "vosk", CONFIG[track]["name"]))
    return _models[track]


def decode(path):
    wav = subprocess.run(["lame", "--quiet", "--decode", path, "-"], check=True, capture_output=True).stdout
    with wave.open(io.BytesIO(wav)) as w:
        rate = w.getframerate()
        ch = w.getnchannels()
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    if ch > 1:
        pcm = pcm.reshape(-1, ch)[:, 0].copy()
    return pcm, rate


def shape(db, zc, thr):
    """onset, vowel span, sound after the last vowel and a quiet murmur after the voice, in ms (10 ms frames)."""
    out = {"onsetMs": None, "vowelStartMs": None, "vowelEndMs": None, "afterVowelMs": 0, "quietTailMs": 0}
    if not len(db):
        return out
    top = float(db.max())
    audible = np.flatnonzero((db >= top - 40) & (db >= -60))
    vowel = np.flatnonzero((db >= top - 20) & (zc <= 30))
    voiced = np.flatnonzero(db > thr)
    if len(audible):
        out["onsetMs"] = int(audible[0]) * 10
    if len(vowel):
        v0, v1 = int(vowel[0]), int(vowel[-1])
        out["vowelStartMs"], out["vowelEndMs"] = v0 * 10, (v1 + 1) * 10
        rest = db[v1 + 1 :]
        out["afterVowelMs"] = int(np.count_nonzero(rest >= top - 40)) * 10
    if len(voiced):
        rest = db[int(voiced[-1]) + 1 :]
        out["quietTailMs"] = int(np.count_nonzero((rest >= top - 55) & (rest >= -70))) * 10
    return out


def energy(pcm, rate):
    x = pcm.astype(np.float32) / 32768.0
    hop = rate // 100
    n = len(x) // hop
    if n == 0:
        return [], x, shape(np.zeros(0), np.zeros(0), 0)
    frames = x[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    zc = np.count_nonzero(np.diff(np.signbit(frames), axis=1), axis=1)
    thr = max(-45.0, float(db.max()) - 30.0)
    voiced = db > thr
    segs = []
    start = None
    for i, v in enumerate(voiced):
        if v and start is None:
            start = i
        if not v and start is not None:
            segs.append([start * 10, i * 10])
            start = None
    if start is not None:
        segs.append([start * 10, n * 10])
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < 80:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return merged, x, shape(db, zc, thr)


def analyze(job):
    pcm, rate = decode(job["path"])
    segs, x, form = energy(pcm, rate)
    dur = int(len(pcm) * 1000 // rate)
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    out = {
        "durationMs": dur,
        "peak": round(peak, 3),
        "clipped": int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767)),
        "segments": segs,
        "voicedStartMs": segs[0][0] if segs else None,
        "voicedEndMs": segs[-1][1] if segs else None,
        "voicedMs": sum(e - s for s, e in segs),
        "leadMs": segs[0][0] if segs else dur,
        "trailMs": dur - segs[-1][1] if segs else dur,
        **form,
    }
    key = (job["track"], rate)
    if key not in _recognizers:  # building a recognizer is the expensive part: one per language and rate, reset per clip
        _recognizers[key] = KaldiRecognizer(model_for(job["track"]), rate)
        _recognizers[key].SetWords(True)
    rec = _recognizers[key]
    data = pcm.tobytes()
    step = rate * 2 * 2  # feed 2 s chunks
    for i in range(0, len(data), step):
        rec.AcceptWaveform(data[i : i + step])
    res = json.loads(rec.FinalResult())
    rec.Reset()
    out["transcript"] = res.get("text", "")
    out["words"] = [
        {"w": w["word"], "start": int(w["start"] * 1000), "end": int(w["end"] * 1000), "conf": round(w.get("conf", 0), 2)}
        for w in res.get("result", [])
    ]
    return out


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        try:
            result = {"id": job["id"], "ok": True, **analyze(job)}
        except Exception as err:  # per clip; the driver reports it
            result = {"id": job.get("id"), "ok": False, "error": f"{type(err).__name__}: {err}"}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
