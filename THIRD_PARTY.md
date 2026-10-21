# Third-party material and attributions

Anzo's own code is MIT licensed (`LICENSE`); its lessons — everything in `content/` — are CC BY-NC-SA 4.0
(`content/LICENSE`). This file lists everything else Anzo uses or was built from, with its licence and the attribution it
asks for. It is a record kept by the project, not legal advice.

## Reference material used to build the lessons (not in the repository)

The lesson sources (`content/src/`) and the generated lessons (`content/packs/`) were written for Anzo. The official
documents below were used to choose and level the vocabulary and as models for tasks; they are kept outside the repository, in
`content/reference/` (gitignored), and no text was copied from them: a check of every lesson sentence and text segment
(11,652) against all extracted reference text finds no shared run of 12 words, and 25 everyday sentences that share a run of
8 (*can you put me through to the manager*, *je n'aime pas l'hiver, il fait trop froid* …).

| Source | Publisher | Used for | Notes |
|---|---|---|---|
| Cambridge English Young Learners (Pre A1 Starters, A1 Movers, A2 Flyers) word lists and handbook | Cambridge University Press & Assessment | which English words are taught at which level (Pre-A1–A2) | © Cambridge; the English packs teach every word of these lists, each in one unit |
| B1 Preliminary (for Schools) vocabulary list, B2 First for Schools sample paper | Cambridge University Press & Assessment | the English B1 word list; B2 words attested in the sample paper | © Cambridge |
| DELF Prim A1.1, A1, A2 sample papers; DELF B1 and B2 junior / scolaire sample papers | France Éducation international | the derived French word list (words attested in the papers), task models | © France Éducation international |
| NT2Lex (Tack, François, Desmet & Fairon, 2018) | CENTAL (UCLouvain) / ITEC (KU Leuven) | the CEFR level at which each Dutch word is first observed: the Dutch word list's levels | **CC BY-NC-SA 4.0**: see below |
| *Naar Nederland* (handleiding 2014; werkboek and fotoboek, Boom 2015) | Netherlands Ministry of Social Affairs and Employment; Boom | Dutch Start/A1 attestations | all rights reserved |
| CNaVT sample exams (A2 INFO, B1 FORM, B2 PROF / STRT): task sheets, assessment models | Certificaat Nederlands als Vreemde Taal | Dutch attestations, task models | all rights reserved |
| Staatsexamen NT2 programme I/II public exams (2025) | DUO / College voor Toetsen en Examens | Dutch B1/B2 attestations, task models | all rights reserved |
| *Leerplan NT2 Richtgraad* 1–3 (Waystage, Threshold, Vantage; 2015) | Flemish adult education (CVO) | the Dutch syllabus: domains, roles, tasks per level | all rights reserved |

**NT2Lex attribution** (required by CC BY-NC-SA 4.0 for material derived from it): *Tack, A., François, T., Desmet, P. &
Fairon, C. (2018). NT2Lex: A CEFR-Graded Lexical Resource for Dutch as a Foreign Language Linked to Open Dutch WordNet.
Proceedings of BEA 2018.* Licensed under CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/). The level at
which a Dutch word is taught in Anzo is derived from NT2Lex's first-observed level (`content/src/nl/wordlist-sources.yaml`,
`content/src/nl/WORDLIST.md`, and the Dutch lessons built from them); changes: Belgian standard forms and topic words added,
words moved to other levels with a reason.

## Voices and recordings

Neither voices nor recordings are in the repository. The voices are Piper voices, downloaded by `scripts/fetch-models.sh`;
the exact licence text of each is its `MODEL_CARD`, recorded in `models/manifest.json`. The recordings are made from the
lessons with these voices on the server (`npm run audio:render`), and the published set is offered as a separate download,
`anzo-audio-v<version>.zip` on the repository's GitHub Releases. Each recording carries the licence of the voice that
spoke it:

| Voice | Used for | Licence | Dataset / attribution |
|---|---|---|---|
| `en_GB-cori-medium` | English | public domain | LibriVox recordings (https://librivox.org) |
| `en_GB-vctk-medium` (speaker p258) | English dialogues, second voice | CC BY 4.0 | CSTR VCTK Corpus, University of Edinburgh (https://datashare.ed.ac.uk/handle/10283/3443) |
| `fr_FR-siwis-medium` | French | CC BY 4.0 | SIWIS French Speech Synthesis Database, University of Edinburgh (https://datashare.is.ed.ac.uk/handle/10283/2353) |
| `fr_FR-upmc-medium` (speaker *pierre*) | French dialogues, second voice | CC BY-SA 4.0 | UPMC Pierre recordings, MaryTTS (https://github.com/marytts/upmc-pierre-data); recordings made with it are shared under the same licence, with attribution |
| `nl_BE-rdh-medium` | Dutch | CC0 1.0 | dutch-vl-tts (https://github.com/r-dh/dutch-vl-tts) |
| `nl_BE-nathalie-medium` | Dutch dialogues, second voice | CC0 | dataset-voice-nathalie (https://github.com/rhasspy/dataset-voice-nathalie) |

**Attribution for the recordings archive:** the English recordings (cori) are public domain and the Dutch ones (rdh,
nathalie) CC0; the English dialogue recordings of the second voice are made with the VCTK voice (CC BY 4.0, CSTR VCTK
Corpus, University of Edinburgh), the French recordings with the SIWIS voice (CC BY 4.0, SIWIS French Speech Synthesis
Database, University of Edinburgh), and the **French dialogue recordings of the second voice with *upmc pierre*: CC BY-SA
4.0** (UPMC Pierre recordings, MaryTTS) — those recordings are shared under CC BY-SA 4.0 too, with this attribution. All
were spoken by the Piper speech synthesizer (https://github.com/rhasspy/piper). The archive's `manifest.json` names the
voices of each language and lists the second voice's recordings under `dialogue-normal` and `dialogue-slow`.

## Authoring tools (run on the server only, never shipped with Anzo)

| Tool | Licence | Used for |
|---|---|---|
| Piper (`piper-tts` 1.8.0) and espeak-ng (its phonemizer) | GPL-3.0 | rendering the recordings (`npm run audio:render`) |
| onnxruntime, onnx, numpy | MIT, Apache-2.0, BSD-3-Clause | Piper's runtime |
| Vosk (`vosk` 0.3.45) and the small Vosk models en-us 0.15, fr 0.22, nl 0.22 | Apache-2.0 | the audio check (`npm run audio:check`) |
| lame | LGPL-2.0 | MP3 encoding |
| Playwright, axe-core (`@axe-core/playwright`) | Apache-2.0, MPL-2.0 | browser tests, the contrast check |
| sharp, yaml, vitest, supertest, Vite, vite-plugin-pwa (Workbox) | Apache-2.0, ISC, MIT | icons, sources, tests, the client build |

## Libraries the app runs with (installed by npm, not in the repository)

| Package | Licence |
|---|---|
| express, express-session, express-rate-limit, compression, helmet, pino, ajv, bcrypt, better-sqlite3 | MIT |
| better-sqlite3-session-store | **GPL-3.0-only** — kept, see below |
| react, react-dom, react-router-dom | MIT |

**The GPL-3.0 library.** `better-sqlite3-session-store` keeps the login sessions in the app's SQLite database. It is
installed by npm (`server/package.json`) and is not part of this repository, so Anzo's own code stays MIT. It stays because
it works, is small, and replacing it would change how every login is stored for no gain to the learners; it may be
replaced one day by a small session store of Anzo's own on the same `sessions` table. Anyone who
distributes Anzo *together with* its installed dependencies (a container image, a `node_modules` folder) distributes this
GPL-3.0 component too and must follow its terms for it.

## Images and sounds

Every icon, avatar, mascot (otter, fox, lion), badge and flag is an original inline SVG drawn for Anzo; the PWA icons are
generated from `client/public/*.svg`. Sound effects are synthesized in the browser (Web Audio); there are no sound files.
No third-party trademarks, logos or graphics are used.
