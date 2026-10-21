# Architecture

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). The process, its startup and reload, every source path, and the request flow of a lesson.

One Node 24 process (`server/src/index.js`) serves the API, the built React client and audio.

```
phone/tablet ──HTTPS──> reverse proxy (anzo.your-domain.example, TLS) ──────────HTTP──> 192.0.2.10:3000
                                                                                  │
                                           node server/src/index.js  (systemd: anzo.service, user anzo)
                                             ├─ /api/*     Express routes → better-sqlite3 (data/anzo.sqlite, WAL)
                                             ├─ /audio/*   pre-rendered MP3s from /opt/anzo/audio (ANZO_AUDIO_DIR), read-only
                                             └─ /*         client/dist (Vite build) with SPA fallback to index.html
```

Startup order (`index.js`): config → **`loadRuntime`: content load + validation (exit 1 on any error; instruction keys are
checked against the locale files), the id lock (a lock problem is logged, not fatal at startup; `content.retired` = exercises
hidden by corrections)** → load `audio/manifest.json` (logs `audio manifest loaded` with the count of missing clips; a missing
manifest only warns, but `/api/health` then answers 503) → open DB + run migrations → seed users if the table is empty →
if migration 005 was just applied: `backfillGamification` (silent badges + past goal days) → spool subdirs → `afterLoad`
(`markLegacyAttempts`, in-process `checkIntegrity`, `status/content.json`) → `createApp({ store })` → listen on `HOST:PORT` →
`status/service.json` + the spool result poller (2 s).

**Reload** (`systemctl reload anzo` = SIGHUP, `server/src/content/store.js`): `loadRuntime({ strictLock: true })` builds the next
`{ content, audio }` completely; any error (invalid pack, a locked id gone) keeps the old one (logged, `lastReload.ok = false` on the
System page). On success one reference is swapped, then `afterLoad` runs. Routes read `ctx.content` / `ctx.audio` **per request**
(never destructure them in a route factory: caches are `WeakMap`s keyed by the content object, so a swap refreshes them).

| Path | What |
|---|---|
| `server/src/config.js` | env → config; loads `/opt/anzo/.env` itself unless `ANZO_DOTENV=0` (existing env wins) |
| `server/src/app.js` | Express factory `createApp({ db, content, audio, store, config, logger })` (production passes `store`, tests `content` + `audio`); helmet CSP, same-origin check on writes, rolling sessions, routes, static, SPA fallback |
| `server/src/middleware/` | `requireAuth` (sets `req.user`), `requireAdmin` (403 `forbidden`; 403 `must_change_password` until a seeded/reset admin password is changed) |
| `server/src/db/` | `openDb`, `openMemoryDb` (tests), `runMigrations`; SQL in `migrations/NNN_name.sql`, applied in order, recorded in `schema_migrations` |
| `server/src/content/validate.js` | ajv (2020-12) schema check + cross-field rules (incl. v2: answer sides, instruction keys in every locale); shared by server, CLI and tests |
| `server/src/content/instructions.js` | exercise → default i18n instruction key; reads `client/src/i18n/*.json` for the validator |
| `server/src/content/localized.js` | `nativeText({nl}, lang)`: native-side text in the user's native language (falls back to `nl`) |
| `server/src/content/loader.js` | builds the in-memory index (packs, lessons, exercises); `publicPack(…, {audio, nativeLang})` strips answers, resolves native text, adds `instruction` keys |
| `server/src/content/grading.js` | pure grading of all exercise types (English, French and Dutch typing rules; build order by `orderKey`; text questions, order, per-gap cloze) |
| `server/src/content/texts.js` | pure rules of texts (reading/dialogue, questions, glossary, cloze gaps) and the cloze text cut at its gaps; shared by the validator, the YAML reader and the generator |
| `server/src/lib/clock.js` | `installTestClock`: with `NODE_ENV=test` and `ANZO_FAKE_NOW`, a shifted `Date` (midnight-proof e2e); never in production |
| `server/src/ops/proxy.js` | the last login through the proxy (peer, trusted, Secure cookie) for the System page, from memory or `app.log` |
| `server/src/audio/clips.js` | pure: text normalization, word tokens, content-addressed clip names, which texts of a pack need clips (`clipsForPacks`); shared by server and render scripts |
| `server/src/audio/manifest.js` | runtime: reads `audio/manifest.json`, text → `/audio/...` URL (only for files on disk), missing-clip count |
| `server/src/lib/gamification.js` | pure XP (lessons + practice) / streak (Europe/Amsterdam days) / item-strength / daily-goal / duration-clamp arithmetic |
| `server/src/lib/activity.js` | XP and minutes per Amsterdam day (lessons + practice), today's XP, daily goal reached (`daily_goal_days`), the 7-day goal week |
| `server/src/lib/badges.js` | badge definitions (ids stable), facts from history, `awardBadges` (idempotent), `badgeList` (profile), `backfillGamification` (after migration 005, silent) |
| `server/src/lib/rewards.js` | `afterXpEarned`: daily goal then badges, after every lesson / practice completion |
| `server/src/lib/board.js` | the family board: `weekOf` (Monday–Sunday, calendar arithmetic), `familyBoard` (members, ranks, days, crown, family goal), `familyGoal` / `setFamilyGoal` (`app_settings`) |
| `server/src/lib/report.js` | admin progress report: summary, 30 days of XP/minutes, accuracy by type (first tries), 20 weakest items |
| `server/src/practice/` | `select.js` (pure selection rules, "My mistakes"), `index.js` (candidates, summary, start / complete a session, `isCurrentAttempt`) |
| `server/src/lib/users.js` | accounts: seed (with enrolments), validation (`validateUserInput`, mirrored in `client/src/lib/userRules.js`), create/update/delete (+ `USER_TABLES`), preferences, login profiles, `deleteSessions` |
| `server/src/lib/seed.js` | the seed accounts: `config/seed.local.json` (gitignored) else `config/seed.example.json`, or `ANZO_SEED_FILE` |
| `server/src/lib/langs.js` | the one list of native languages (`NATIVE_LANGS`), interface languages, audiences |
| `server/src/lib/courses.js` | courses and enrolment: `offeredCourses`, `enrolments`, `visibleCourses`, `activeCourse`/`activeTrack`, `learnsTrack`, `enrol`, `hideCourse`, `setActiveTrack`, `setStartPack`, `xpByTrack`, `withActiveTrack` |
| `server/src/lib/limiter.js` | in-memory failure limiter (wrong passwords per account) |
| `server/src/lib/integrity.js` | read-only progress-vs-content check (`npm run check:integrity`): orphan lesson/exercise/item ids, XP = Σ completions, streak dates; `errors` / `warnings` / `info` (legacy attempts and attempts on retired exercises are info) |
| `server/src/lib/legacy.js` | `attempts.legacy`: `markLegacyAttempts(db, content)` (both directions, at every load) |
| `server/src/content/store.js` | `loadRuntime`, `createContentStore` (atomic reload), `lockProblemsFor` |
| `server/src/content/idlock.js` | id-lock logic incl. `retired` (re-exported by `scripts/content/idlock.js`) |
| `server/src/ops/` | `spool.js` (atomic JSON files), `corrections.js` (search, item detail, preview, queue, `recordResult`, poller), `reports.js` (reports, inbox, messages), `system.js` (`gitCommit`, `collectSystem` tiles), `logs.js` (problems from all logs), `diagnostics.js` (`redact`, `buildDiagnostics`, 25 KB cap) |
| `server/src/lib/progress.js` | attempts, lesson completion (+ `lesson_completions` row), item strength, `resetProgress(db, content, userId, scope)` |
| `server/src/lib/avatars.js` | avatar ids + colour names (= `client/src/avatars/ids.js`, unit-tested) |
| `server/src/routes/` | `health auth users content progress practice profile courses corrections reports system family listen rerecord admin` (`family`: the board and its goal; `listen`: Admin → Listen check; `rerecord`: *Record again*, `ops/rerecord.js`; `sample`: the Listen check's *Before release*
sample) (`courses.js` also exports `coursesView`, used by Admin → Users) |
| `client/src/` | React 18 + React Router 6; `screens/` (incl. `Practice`, `Profile`, `AdminProgress`, `AdminPreview` (Admin → Levels → Preview: a pack's lessons, a lesson played with `/api/admin/preview/attempt`)), `exercises/` (`SessionPlayer.jsx`: the one runner of lessons and practice — a text's questions are stepped through under one text or listening player (`lib/textSteps.js`; `TextPanel` / `ListeningPanel` in `TextQuestion.jsx`, side by side from 900 px, folded on a phone after the first question); texts: `TextQuestion.jsx` (one question), `OrderParagraphs.jsx`, `Cloze.jsx`; rearranging placed answers: `PlacedSequence.jsx` (build, ordering), slots in `Cloze.jsx` / `FillBlank.jsx`, pure rules in `lib/arrange.js`, pointer drag in `useDrag.js`; `components/TextView.jsx`: a text with tappable words, glossary popover, ▶/🐢 sentence by sentence), `components/` (incl. `CourseSheet` + `Flag` (the course chip on Home), `LevelBar`, `LevelSheet`, `Mascot` (otter/fox × 5 poses), `BadgeIcon`, `GoalRing`, `GoalPicker`, `PracticeSheet`, `Confetti`, `CountUp`), `icons/` + `avatars/` (inline SVG), `api/`, `audio/` (`player.js` speech, `sfx.js` Web Audio effects), `i18n/` (`nl.json`, `en.json`, runtime), `lib/` (`path.js`: Home path lesson states incl. start level, `packProgress`, `currentPosition`, unit-tested from the server; `lines.js` mascot lines; `badges.js` badge texts; `audience.js` adult wording keys; `dates.js`), `styles/` |
| `client/public/theme.js` + `client/src/lib/theme.js` | Settings → Theme: the pre-paint script (a file, not inline: CSP) sets `<html data-theme>` from the choice remembered on the device or the device's setting; `lib/theme.js` follows the account after login and the device after logout. Colours: only `client/src/styles/tokens.css` (light and dark values); `server/test/colour-literals.test.js` with `client/colour-literals.allow.json` |
| `config/` | `seed.example.json` (committed seed accounts), `seed.local.json` (this installation's, gitignored), `publish.local.json` (gitignored: the installation's own `publish:check` terms and allowed lesson names) |
| `scripts/lib/machine.js` | CPUs and memory (`ANZO_MACHINE_CPUS`, `ANZO_MACHINE_MEM_GB` simulate another size) → worker defaults of the unit suite, `audio:check` and `audio:render` |
| `content/` | `schema/`, `ids.lock.json` (id stability lock, see the content procedure), `packs/` (manifest + packs; all packs are **generated**), `src/<track>/<level>/` (unit sources: `pack.yaml` + `NN-<topic>.yaml`; `src/en/PLAN.md`, `src/fr/PLAN.md`, `src/nl/PLAN.md`), `src/fr|nl/wordlist-sources.yaml` + `WORDLIST.md` (French and Dutch word list sources and counts), `src/nl/SOURCES.md` (every Dutch reference file and its use), `src/nl/homophones.yaml`; not in the repository: `reference/` (the reference PDFs + extracted text incl. `wordlist-en.json`, `wordlist-fr.json`, `wordlist-nl.json`; `reference/dutch/` with NT2Lex — supplied by whoever authors lessons, `docs/developer/content.md` → *Reference files*) and `STATUS.md` (per-unit status, written by `npm run content:status`) |
| `scripts/jobs/` | `content-job.js` (the systemd job: spool requests → results), `content-job-lib.js` (steps + rollback), `scratch.js` (scratch clone for tests), `integration.js` (`npm run test:content-job`) |
| `scripts/ops/` | `watchdog(-lib).js`, `disk-check.js`, `cleanup(-lib).js`, `backup-full.js` + `archive-lib.js`, `publish-check.js`, `joblog.js` (JSON-lines job logger) |
| `scripts/` | `install-ops.sh restore-full.sh install-system.sh validate-content.js seed-users.js e2e.js dev.js generate-icons.js fetch-models.sh models-manifest.js format-packs.js backup-db.sh restore-db.sh generate-pack.js check-integrity.js` |
| `scripts/content/` | `sources.js` (read + validate unit YAML, id shorthands, `lowerLevelVocab`), `generator.js` (deterministic exercise generator), `wordlist.js` → `wordlist-en.js` / `wordlist-fr.js` / `wordlist-nl.js` (`content:wordlist [-- fr|nl]`), `french.js` (French tokenizer + forward morphology: agreement, conjugation, elision/contraction tables), `dutch.js` (Dutch tokenizer + morphology: 't kofschip, stems, irregular verbs, separable verbs, plurals, diminutives, comparatives, number words), `trace-lib.js` (en) + `trace-fr-lib.js` (fr) + `trace-nl-lib.js` (nl) + `trace.js` (`content:trace -- en|fr|nl`), `status.js` (`content:status`), `idlock.js` + `lock.js` (`content:lock`) |
| `scripts/render-audio/` | `collect.js` (clip list), `synth.py` (Piper worker), `render.js` (diff/encode/orphans/manifest core), `tools.js` (Piper + lame adapters), `index.js` (`audio:render`) |
| `content/voices.json` | the one voice per track (+ speaker, `lengthScale`, `slowLengthScale`, `sample` sentence for Admin → Voices) — single source of truth |
| `tools/` | `piper-venv/` (gitignored Python venv, authoring only) + `requirements.txt` (pinned, committed) |
| `models/` | `piper/` voices + MODEL_CARDs (gitignored), `manifest.json` (committed: sizes, sha256, licences) |
| `audio/` | rendered clips `en/`, `fr/`, `nl/`, `manifest.json` (gitignored build artifact) |
| `deploy/` | `anzo.service` (+ `ExecReload`), `anzo.logrotate`, `anzo-jobs.sudoers`, `anzo-{backup,full-backup,integrity,disk,watchdog,cleanup}.{service,timer}`, `anzo-content-job.{path,service}` (installed by `scripts/install-ops.sh` into `/etc`) |
| `e2e/` | Playwright config + specs; `screenshots/` output is gitignored |

## Request flow of a lesson
1. Client loads `GET /api/content/tracks` (manifest + % done) and `GET /api/content/packs/:id`
   (**answers stripped**: MC options without `correct`, build tokens shuffled into `bank`, no `answer`;
   native-side text resolved to strings in `users.native_lang`; each exercise carries an `instruction`
   i18n key that the client renders in `users.ui_lang` — `{language}` is filled with `languages.<track>`).
2. Each check → `POST /api/progress/attempt {lessonId, exerciseId, answer, firstTry}`; the server grades
   (`grading.js`), stores the attempt, updates `item_strength`, returns
   `{correct, correctAnswer?, note?, audio?, audioSlow?}` — the answer's clip arrives only now, so
   nothing audible gives the answer away beforehand. `note` is `accents` or `spelling`.
3. Wrong exercises are re-queued client-side until right. At the end:
   `POST /api/progress/lesson/:id/complete {firstTryCorrect, total, startedAt}`; the server checks `total`
   equals the lesson's playable exercise count, awards XP, updates streak and `lesson_progress`, stores the duration
   (clamped 1 s … 60 min), then records the daily goal and awards badges; the response carries `{badges, dailyGoal}`.
   A practice session runs through the same `SessionPlayer` with `/api/practice/:id/attempt` and `/complete`.
