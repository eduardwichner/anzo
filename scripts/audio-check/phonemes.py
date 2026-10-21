#!/usr/bin/env python3
"""espeak-ng phonemes of clip texts for npm run audio:check (authoring time only; runs in tools/piper-venv).

Reads JSON lines on stdin:  {"id": ..., "espeak": "en", "text": "Anna is my friend."}
prints one JSON line per input:  {"id": ..., "ok": true, "phonemes": "ˈanəɹ ɪz maɪ fɹˈɛnd."}
The phonemes are what Piper hands the voice: espeak-ng with the voice's own espeak language; a `[[ … ]]` block in the text
(a pronunciation from the lexicon, docs/developer/audio.md) is passed through as written, exactly as piper-tts does. Sentences are
joined with a space. The check's rules (lib.js) read the first and last sound, the vowel count and an intrusive /ɹ/ from it.
"""
import json
import re
import sys

from piper.phonemize_espeak import EspeakPhonemizer

BLOCK = re.compile(r"\[\[(.*?)\]\]")
_ph = EspeakPhonemizer()


def phonemize(voice, text):
    out = []
    pos = 0
    for m in BLOCK.finditer(text):
        before = text[pos : m.start()]
        if before.strip():
            out.append(" ".join("".join(s) for s in _ph.phonemize(voice, before)))
        out.append(m.group(1).strip())
        pos = m.end()
    rest = text[pos:]
    if rest.strip():
        out.append(" ".join("".join(s) for s in _ph.phonemize(voice, rest)))
    return " ".join(x.strip() for x in out if x.strip())


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job = json.loads(line)
        try:
            result = {"id": job["id"], "ok": True, "phonemes": phonemize(job["espeak"], job["text"])}
        except Exception as err:  # per text; the driver reports it
            result = {"id": job.get("id"), "ok": False, "error": f"{type(err).__name__}: {err}"}
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
