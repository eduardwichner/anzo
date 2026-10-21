# Extending Anzo

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). Where planned features plug in.

- **A course for another native language** (Dutch for English speakers is the model): a manifest track with `"native": "<lang>"`
  (the track id in the schema's `track` enum, `languages.<id>` in both locales, a mascot and a `--track` colour with ≥ 4.5:1
  contrast in `tokens.css`); its packs give every native-side text that key (the validator enforces the course's native
  key; `localized` only requires one key). The generator takes the meaning article and the review-lesson title from the
  native language (`MEANING_ARTICLE`, `REVIEW_TITLES`: add the new language there). Corrections, reports, the inbox and
  Copy question read the course's native key. A target language also needs its grading rules (`grading.js`: accents, number
  words), a voice in `content/voices.json`, a homophone list, a word-list builder and trace (`scripts/content/wordlist-<t>.js`,
  `trace-<t>-lib.js`) and a reviewer brief. Learners with that native language are then offered the course.
- **A variant of an existing course for another native language** (French for English speakers is the model):
  a manifest track `{ id: "<target>-<native>", target, idPrefix, native, … }` (the id in the schema's `track` enum,
  `languages.<id>`, the target's mascot and a `data-track` colour in `tokens.css`), packs listed `planned` until they exist,
  and the meanings in the target's unit sources next to the existing ones (`native: { nl, en, ro }`): `buildPack` builds
  every unit that has them, under the variant's prefix; no new voice, grading, word list or recording. Dutch for Romanian
  speakers and French for Romanian speakers are this, once `ro` is a native language (below). `docs/developer/content.md` →
  *Target language and variant courses*.
- **Another native language** (e.g. Romanian): add it to `NATIVE_LANGS` in `server/src/lib/langs.js` (no migration),
  `nativeLanguages.<code>` to both locales, and courses whose manifest `native` is it.
- **Speaking (later).** `speak` is reserved in the schema; Vosk models would live in `models/` and be
  fetched by `fetch-models.sh`. No browser SpeechRecognition (it streams audio to Apple or Google: `CONTRIBUTING.md` → *The rules*).
- New migrations: `server/src/db/migrations/NNN_<name>.sql`, the next free number; they run at startup, each in one
  transaction. Take `npm run backup:db` before restarting the service onto a new migration, and `npm run check:integrity`
  after. A new per-user table must join `USER_TABLES`. SQLite cannot drop or change a column that a CHECK names: rebuild the
  table (create `<t>_new`, `INSERT … SELECT`, `DROP TABLE <t>`, `ALTER TABLE <t>_new RENAME TO <t>`) in a file whose first
  line is `-- anzo:foreign-keys-off`. The runner then switches foreign keys off around that transaction (they cannot be
  switched inside one; with them on, dropping `users` cascade-deletes every child row) and rolls back unless
  `PRAGMA foreign_key_check` is empty (`server/test/migrations.test.js`).
