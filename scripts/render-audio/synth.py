#!/usr/bin/env python3
"""Piper synthesis worker for the offline render pipeline (authoring time only).

Reads JSON lines on stdin:
    {"voice": "/abs/models/piper/en_GB-cori-medium.onnx", "text": "cat",
     "out": "/tmp/.../x.wav", "lengthScale": 1.1, "speaker": null,
     "seed": 123456789,                                                   (Piper's noise; the same seed = the same file)
     "slow": false,                                                       (slow speed: a longer hiatus break)
     "hiatus": ["sˈəʊfə"],                                                (optional: lexicon blocks that end in a break)
     "carrier": "The word,",                                              (optional: a short clip, content/voices.json)
     "end": "cut",                                                        (optional: cut a carrier clip after its last sound)
     "noiseScale": 0.5, "noiseW": 0.6, "trim": "tail" | "first"}          (optional: older overrides)
writes a mono 16-bit WAV to `out`, and prints one JSON result line per input line:
    {"out": ..., "ok": true, "durationMs": 612, "peak": 0.71, "clipped": 0,
     "leadMs": 40, "trailMs": 95, "sampleRate": 22050, "seed": 123456789, "gapMs": 60, "wordDb": -1.2,
     "hiatusMs": 160}
     (carrier clips: gapMs = silence kept before the word, wordDb = the word's peak under the sentence's peak; hiatusMs = the
     shortest hiatus break, below)
or {"out": ..., "ok": false, "error": "..."}.

A carrier clip is synthesized as one sentence, "<carrier> <text>." ("The word, eight."): the word is not the first thing
the voice says (a bare short word makes Piper babble on or swallow its first sound), and the comma makes a pause. The
word is cut out inside that pause, at its quietest point between the carrier's last phoneme and the word's first (Piper's
phoneme alignments, piper-tts 1.8 + onnx), keeping 40-150 ms of silence before the word, so its first sound (French j, r,
s, Dutch r) is never clipped. The word ends the sentence, so it ends as a sentence ends; `end: "cut"` (an override) cuts it
40 ms after its last phoneme (a breath after a final vowel: French "plu" heard as "pluf").

Seeded noise: Piper draws its noise inside the model (two RandomNormalLike nodes). Each model is patched in
memory so the noise is an input instead, filled from a NumPy generator seeded per clip (render.js derives the seed from the
clip's file name): rendering the same clip again gives the same samples, as long as onnxruntime runs on the same number of
threads (one per process: tools.js) on the same kind of CPU.

Sentence clips are said as Piper says them: pauses shaped from the alignments and a glottal stop against the intrusive r
were heard as worse (silence inside a word, the glottal stop as a d), so neither is used (docs/developer/audio.md, *The rules
for changing audio*). What is used is the `hiatus` of the
lexicon: a word the voice would link to the next vowel with an r of its own ("sofa is" → "sofar is") ends its block with a
comma (server/src/audio/clips.js), and the silence of that comma is made HIATUS_MS long — cut or widened only inside frames
that are silent (HIATUS_QUIET_DB under the clip's peak), never in a sound; reported as hiatusMs (the shortest break: 0 when
the voice ran through the comma).

Each voice is loaded once (PiperVoice.load with alignments) and reused for every clip that names it. onnxruntime runs on
at most 4 threads (standing rule 13; ANZO_ONNX_THREADS lowers it; tools.js runs one per process, for seeded renders).
The running app never executes this; `npm run audio:render` drives it.
"""
import json
import os
import sys
import wave

import numpy as np
import onnxruntime as _rt

_THREADS = max(1, min(4, int(os.environ.get("ANZO_ONNX_THREADS", "4"))))
_Session = _rt.InferenceSession

# Piper's two noise tensors (the duration predictor's and the flow's) become inputs of these sizes (channels, frames); the
# graph slices them to the shapes the RandomNormalLike nodes had. The first frames of a buffer depend only on the seed.
NOISE_BUFFERS = {"dp": (2, 4096), "flow": (256, 8192)}
_noise = {"seed": None}


def seed_noise(model):
    """Replace each RandomNormalLike node by Slice(noise input, 0, Shape(its input)); returns [(input, channels, frames)]."""
    from onnx import TensorProto, helper

    g = model.graph
    inputs = []
    for node in [n for n in g.node if n.op_type == "RandomNormalLike"]:
        key = "dp" if "/dp/" in node.name else "flow"
        name = f"anzo_noise_{key}"
        ch, fr = NOISE_BUFFERS[key]
        g.input.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, [1, ch, fr]))
        g.initializer.append(helper.make_tensor(f"{name}_rank", TensorProto.INT64, [1], [3]))
        at = list(g.node).index(node)
        g.node.remove(node)
        for k, new in enumerate([
            helper.make_node("Shape", [node.input[0]], [f"{name}_shape"], name=f"{name}/Shape"),
            helper.make_node("ConstantOfShape", [f"{name}_rank"], [f"{name}_zeros"], name=f"{name}/Zeros",
                             value=helper.make_tensor("v", TensorProto.INT64, [1], [0])),
            helper.make_node("Slice", [name, f"{name}_zeros", f"{name}_shape"], [node.output[0]], name=f"{name}/Slice"),
        ]):
            g.node.insert(at + k, new)
        inputs.append((name, ch, fr))
    return inputs


class _SeededSession:
    """The session piper-tts calls: each run gets its noise from a generator seeded with the current clip's seed."""

    def __init__(self, session, inputs):
        self._s, self._inputs = session, inputs

    def run(self, output_names, feeds, *args, **kw):
        rng = np.random.default_rng(_noise["seed"])
        feeds = dict(feeds)
        for name, ch, fr in self._inputs:
            feeds[name] = rng.standard_normal((1, ch, fr), dtype=np.float32)
        return self._s.run(output_names, feeds, *args, **kw)

    def __getattr__(self, name):
        return getattr(self._s, name)


def _capped_session(model, *args, sess_options=None, **kw):
    import onnx

    opts = sess_options or _rt.SessionOptions()
    opts.intra_op_num_threads = _THREADS
    opts.inter_op_num_threads = 1
    # no memory arena: it keeps the peak of the longest clip so far (a slow text sentence: > 1.2 GB per process —
    # four of them beside the rest can exhaust a 4 GB machine); allocation only, the samples are the same
    opts.enable_cpu_mem_arena = False
    proto = onnx.load_from_string(model) if isinstance(model, bytes) else onnx.load(model)
    inputs = seed_noise(proto)
    return _SeededSession(_Session(proto.SerializeToString(), *args, sess_options=opts, **kw), inputs)


_rt.InferenceSession = _capped_session  # piper-tts creates its session through the module attribute
from piper import PiperVoice, SynthesisConfig  # noqa: E402

SILENCE = 0.01  # |sample| below 1% of full scale counts as silence
VOLUME = 0.89   # after Piper's peak normalization: about -1 dBFS headroom so MP3 encoding cannot clip
FADE_MS = 5     # fade in/out: no click if a voice starts or stops mid-waveform
PAD_LEAD_MS = 30
PAD_TRAIL_MS = 60  # a little air at both ends; mobile browsers can swallow the first milliseconds

_voices = {}


def get_voice(path):
    if path not in _voices:
        # alignments: the model is patched in memory (needs the onnx package); the model file is unchanged
        _voices[path] = PiperVoice.load(path, include_alignments=True)
    return _voices[path]


def edge_silence_ms(samples, rate):
    loud = np.flatnonzero(np.abs(samples) >= SILENCE)
    if loud.size == 0:
        return len(samples) * 1000 // rate, len(samples) * 1000 // rate
    return int(loud[0] * 1000 // rate), int((len(samples) - 1 - loud[-1]) * 1000 // rate)


TRIM_GAP_MS = 200  # trim "tail": cut at the first pause this long after speech started (a stop closure is shorter) …
TRIM_KEEP_MS = 40  # … keeping this much of it


def trim_tail(samples, rate):
    """Keep the first spoken stretch: Piper sometimes goes on babbling after a short word, after a pause."""
    hop = rate // 100
    n = len(samples) // hop
    if n == 0:
        return samples
    frames = samples[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12))
    voiced = db > max(-45.0, float(db.max()) - 30.0)
    started = False
    quiet = 0
    for i, v in enumerate(voiced):
        if v:
            started = True
            quiet = 0
        elif started:
            quiet += 1
            if quiet * 10 >= TRIM_GAP_MS:
                cut = (i - quiet + 1) * hop + rate * TRIM_KEEP_MS // 1000
                return samples[:cut]
    return samples


def trim_first(samples, rate):
    """Keep the first of two words ("road, road."): cut at the longest pause that overlaps the middle of the
    voiced span (30-70 %); Piper's pause after a comma is sometimes short, so no fixed length is required."""
    hop = rate // 100
    n = len(samples) // hop
    if n == 0:
        return samples
    frames = samples[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12))
    voiced = np.flatnonzero(db > max(-45.0, float(db.max()) - 30.0))
    if voiced.size < 2:
        return samples
    first, last = int(voiced[0]), int(voiced[-1])
    lo, hi = first + 0.3 * (last - first), first + 0.7 * (last - first)
    best = None
    k = first
    is_voiced = np.zeros(n, dtype=bool)
    is_voiced[voiced] = True
    while k <= last:
        if not is_voiced[k]:
            start = k
            while k <= last and not is_voiced[k]:
                k += 1
            if start <= hi and k >= lo and (best is None or k - start > best[1] - best[0]):
                best = (start, k)
        k += 1
    if best is None:
        return samples
    return samples[: best[0] * hop + rate * TRIM_KEEP_MS // 1000]


PAUSE = set(",;:—…")  # the carrier's last mark: the pause the word is cut out of
NOT_A_SOUND = PAUSE | {" ", "ˈ", "ˌ", "^", "$", "_"}
CUT_FRAME_MS = 5
KEEP_MIN_MS = 50   # silence kept before the word, at least … (audio:check asks 40 ms, measured in 10 ms frames)
KEEP_MAX_MS = 150  # … and at most
QUIET_DB = 40      # "silence": more than this under the word's loudest frame (as audio:check measures the onset)


def with_stop(text):
    # a phoneme block that ends the text: its own last mark counts ("[[ wˈiːkɛndz. ]]"; "[[ dʒˈɔp ]]" gets a full stop)
    t = text.rstrip()
    last = t[:-2].rstrip()[-1:] if t.endswith("]]") else t[-1:]
    return text if last in ".?!…" else f"{text}."


def frame_db(audio, rate, frame_ms=CUT_FRAME_MS):
    hop = max(1, rate * frame_ms // 1000)
    n = len(audio) // hop
    frames = audio[: n * hop].reshape(n, hop) if n else np.zeros((0, hop), dtype=np.float32)
    return 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)), hop


def carrier_cut(audio, rate, alignments):
    """(start sample, kept silence ms): where the word begins, cut inside the pause after the carrier."""
    if not alignments:
        raise ValueError("no phoneme alignments (is the onnx package installed?)")
    spans = []
    pos = 0
    for a in alignments:
        spans.append((a.phoneme, pos))
        pos += int(a.num_samples)
    pause = next((k for k, (ph, _) in enumerate(spans) if ph in PAUSE), None)
    if pause is None:
        raise ValueError("the carrier has no pause mark")
    word = next((k for k in range(pause + 1, len(spans)) if spans[k][0] not in NOT_A_SOUND), None)
    if word is None:
        raise ValueError("no word after the carrier")
    a, b = spans[pause][1], spans[word][1]
    db, hop = frame_db(audio, rate)
    if not len(db):
        raise ValueError("no audio")
    fa, fb = a // hop, max(a // hop + 1, b // hop)
    m = fa + int(np.argmin(db[fa:fb]))  # the quietest point of the pause
    # relative to the word's own peak, not the sentence's: the word is normalized on its own after the cut, so a soft first
    # sound under a loud carrier would otherwise count as silence (30 ms measured where 45 ms would be reported)
    quiet = float(db[m:].max()) - QUIET_DB
    onset = next((k for k in range(m, len(db)) if db[k] >= quiet), len(db))  # the word's first audible frame
    s = m
    while s > fa and db[s - 1] < quiet:  # the silence the quietest point lies in
        s -= 1
    ms = 1000 / rate * hop
    lo, hi = max(s, onset - int(KEEP_MAX_MS / ms)), onset - int(np.ceil(KEEP_MIN_MS / ms))
    # the quietest point that keeps 50-150 ms of silence before the word; a pause shorter than that is cut where its
    # silence begins (gapMs < 40: audio:check flags it as onset, audio:fix tries another carrier)
    cut = lo + int(np.argmin(db[lo : hi + 1])) if hi >= lo else s
    return cut * hop, int(round((onset - cut) * ms))


SOUNDLESS = NOT_A_SOUND | set(".?!")  # alignment tokens that are not a sound of the voice
END_KEEP_MS = 40      # end "cut": kept after a carrier clip's last phoneme, then faded out
END_FADE_MS = 15
HIATUS_MS = 160       # a hiatus break (normal speed); a shorter silence between two vowels sounds like a stop (t, d) …
HIATUS_SLOW = 1.5     # … and this much longer at slow speed
HIATUS_QUIET_DB = 45  # silent: 5 ms frames this far under the clip's loudest; only such frames are cut or widened …
HIATUS_MIN_RUN_MS = 20  # … and a break is widened only when it has this much silence already


def spans_of(alignments, offset=0, rate=22050):
    out = []
    pos = offset
    for a in alignments or []:
        out.append((a.phoneme, pos, pos + int(a.num_samples)))
        pos += int(a.num_samples)
    return out


def cap_hiatus(audio, rate, spans, hiatus, slow):
    """Make the break after each hiatus word's comma ("[[ sˈəʊfə, ]] is") HIATUS_MS long: a longer silence is shortened in
    its middle; a shorter one is lengthened in its middle, but only when it has HIATUS_MIN_RUN_MS of silent frames — silence
    is never put inside a sound. Returns (audio, shortest break ms: 0 = the voice ran
    through, the clip is listed for a listener)."""
    if not hiatus or not spans:
        return audio, None
    db, hop = frame_db(audio, rate)
    if not len(db):
        return audio, None
    silent = db < float(db.max()) - HIATUS_QUIET_DB
    ms = 1000 / rate * hop
    want = HIATUS_MS * (HIATUS_SLOW if slow else 1.0)
    seq = [ph for ph, _, _ in spans]
    edits, kept = [], []
    for word in hiatus:
        w = list(word)  # a block reaches the voice one code point per phoneme, stress marks included
        for k in range(len(seq) - len(w)):
            end = k + len(w)
            if seq[k:end] != w or seq[end] != ",":
                continue
            nxt = next((j for j in range(end + 1, len(seq)) if seq[j] not in SOUNDLESS), None)
            if nxt is None:
                continue
            lo, hi = spans[end - 1][2] // hop, min(spans[nxt][1] // hop, len(silent) - 1)  # last sound's end … next start
            run = None  # the longest silent run between them
            i = lo
            while i <= hi:
                if silent[i]:
                    j = i
                    while j + 1 <= hi and silent[j + 1]:
                        j += 1
                    if run is None or j - i > run[1] - run[0]:
                        run = (i, j + 1)
                    i = j + 1
                else:
                    i += 1
            have = (run[1] - run[0]) * ms if run else 0.0
            mid = (run[0] + run[1]) // 2 * hop if run else None
            if have > want:
                n = int((have - want) / 1000 * rate)
                edits.append(("cut", mid - n // 2, n))
                have = want
            elif have >= HIATUS_MIN_RUN_MS and have < want:
                edits.append(("add", mid, int((want - have) / 1000 * rate)))
                have = want
            kept.append(have if have >= HIATUS_MIN_RUN_MS else 0.0)
    for kind, at, n in sorted(set(edits), key=lambda e: e[1], reverse=True):  # from the end: earlier positions stay valid
        if kind == "cut":
            audio = np.concatenate([audio[:at], audio[at + n :]])
        else:
            audio = np.concatenate([audio[:at], np.zeros(n, dtype=np.float32), audio[at:]])
    return audio, (int(round(min(kept))) if kept else None)


def render(job):
    voice = get_voice(job["voice"])
    extra = {}
    if job.get("noiseScale") is not None:
        extra["noise_scale"] = job["noiseScale"]
    if job.get("noiseW") is not None:
        extra["noise_w_scale"] = job["noiseW"]
    cfg = SynthesisConfig(
        length_scale=job.get("lengthScale"), speaker_id=job.get("speaker"), normalize_audio=True, volume=VOLUME, **extra
    )
    seed = job.get("seed")
    if seed is None:
        seed = int.from_bytes(os.urandom(4), "big")
    _noise["seed"] = int(seed)
    chunks = []
    rate = voice.config.sample_rate
    carrier = job.get("carrier")
    text = f"{carrier} {with_stop(job['text'])}" if carrier else job["text"]
    spans = []
    pos = 0
    for chunk in voice.synthesize(text, syn_config=cfg, include_alignments=True):
        rate = chunk.sample_rate
        # every sentence's alignments, placed at its offset (the carrier and its pause are in the first sentence)
        spans.extend(spans_of(chunk.phoneme_alignments, pos, rate))
        chunks.append(chunk.audio_int16_array)
        pos += len(chunk.audio_int16_array)
    if not chunks:
        raise ValueError("no audio produced")
    pcm = np.concatenate(chunks).astype(np.int16)
    gap = None
    word_db = None
    shaped = {}
    if carrier:
        al = [type("A", (), {"phoneme": ph, "num_samples": e - s})() for ph, s, e in spans]
        start, gap = carrier_cut(pcm.astype(np.float32) / 32768.0, rate, al)
        stop = len(pcm)
        if job.get("end") == "cut":
            last = max((e for ph, s, e in spans if ph not in SOUNDLESS), default=len(pcm))
            stop = min(len(pcm), last + rate * END_KEEP_MS // 1000)
        word = pcm[start:stop].astype(np.float32)
        if job.get("end") == "cut":
            n = min(len(word), rate * END_FADE_MS // 1000)
            word[len(word) - n :] *= np.linspace(1.0, 0.0, n, dtype=np.float32)
        peak = float(np.max(np.abs(word))) if len(word) else 0.0
        if peak <= 0:
            raise ValueError("nothing after the carrier")
        # how loud the word came out next to its carrier (dB under the sentence's peak): a whispered word is far under
        word_db = round(20 * np.log10(peak / max(1.0, float(np.max(np.abs(pcm.astype(np.float32)))))), 1)
        pcm = np.clip(np.round(word / peak * VOLUME * 32767.0), -32768, 32767).astype(np.int16)  # the word at full level
    elif job.get("hiatus") and not job.get("trim"):
        out, kept = cap_hiatus(pcm.astype(np.float32) / 32768.0, rate, spans, job["hiatus"], bool(job.get("slow")))
        pcm = np.clip(np.round(out * 32768.0), -32768, 32767).astype(np.int16)
        shaped = {"hiatusMs": kept}
    # Measurements describe Piper's raw output (diagnostic); the file gets fades and padding.
    norm = pcm.astype(np.float32) / 32768.0
    if job.get("trim") in ("tail", "first"):
        norm = trim_tail(norm, rate) if job["trim"] == "tail" else trim_first(norm, rate)
        pcm = pcm[: len(norm)]
    lead, trail = edge_silence_ms(norm, rate)
    shaped_audio = norm.copy()
    fade = min(len(shaped_audio) // 2, rate * FADE_MS // 1000)
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        shaped_audio[:fade] *= ramp
        shaped_audio[-fade:] *= ramp[::-1]
    shaped_audio = np.concatenate([
        np.zeros(rate * PAD_LEAD_MS // 1000, dtype=np.float32),
        shaped_audio,
        np.zeros(rate * PAD_TRAIL_MS // 1000, dtype=np.float32),
    ])
    out = np.clip(np.round(shaped_audio * 32768.0), -32768, 32767).astype(np.int16)
    with wave.open(job["out"], "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(out.tobytes())
    return {
        "durationMs": int(len(out) * 1000 // rate),
        "rawDurationMs": int(len(pcm) * 1000 // rate),
        "peak": round(float(np.max(np.abs(norm))), 3),
        "clipped": int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767)),
        "leadMs": lead,
        "trailMs": trail,
        "sampleRate": rate,
        "seed": int(seed),
        **({"gapMs": gap, "wordDb": word_db} if gap is not None else {}),
        **{k: v for k, v in shaped.items() if v is not None},
    }


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        try:
            result = {"out": job["out"], "ok": True, **render(job)}
        except Exception as err:  # report per clip; the driver decides what to do
            result = {"out": job.get("out"), "ok": False, "error": f"{type(err).__name__}: {err}"}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
