# Testing

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). How the unit and browser tests are set up, what each
part covers, and what trips them.

## Settings and run time

- **The machine decides the defaults.** `server/vitest.config.js` sets the workers and timeouts from the machine
  (`scripts/lib/machine.js`: 2 workers; on a small machine — ≤ 4 vCPU or ≤ 4.5 GB — 60 s per test and 120 s per hook, else
  30 s and 60 s) and `ANZO_SEED_FILE` to `config/seed.example.json`: the tests know the generic accounts `kid1` ("Sam"),
  `kid2` ("Alex") and `admin` only, whatever the installation's `config/seed.local.json` holds (the e2e server is started the
  same way). Try the small defaults on a bigger machine with `ANZO_MACHINE_CPUS=4 ANZO_MACHINE_MEM_GB=4 taskset -c 0-3 npm test`.
  Explicit timeouts use `ms(…)` from `server/test/slow.js` (doubled on a small machine); Playwright's per-test and
  per-expectation timeouts and the e2e server's start budget are doubled there too (`e2e/playwright.config.js`,
  `scripts/e2e.js`). Loading all content and computing every pack's clips takes ≈ 10 s on an idle machine, so a `beforeAll`
  that does both needs more than vitest's default 10 s hook timeout.
- **Run time.** `npm test` takes about 13 minutes on 2 workers on 4 vCPU. The slow parts run on their own workers: the
  content job on scratch clones in three files (`content-job.test.js`, `-reject`, `-hide`; shared setup
  `content-job-scratch.js`, each file its own clone) and the pack up-to-date tests, one file per track (`packs-en/fr/nl.test.js`,
  helper `packs-current.js`, one test per pack — the content job's own test step leaves them out: it has just regenerated
  those packs). The suite stops at once when clips are missing (a job run would render them with Piper): **generate →
  `audio:render` → `npm test`**. Run one file with `npx vitest run test/<file>` in `server/` (the config sets the timeouts).
- **Without the reference files.** A fresh clone has no `content/reference/` (the reference PDFs and the word lists derived
  from them) and no review files: the tests that need them skip — the real B1 list (`wordlist-b1.test.js`), the content job
  rejecting an off-level word (`content-job-reject.test.js`; `npm run test:content-job` skips that step too) — and nothing
  else reads them. A test that imports a script must import a module without side effects (`trace-texts.js`, not the
  `content:trace` command `trace.js`, which runs and exits at import).
- **E2E run time.** Logins go through the API (`loginChild`/`loginAdmin` post `/api/auth/login`, then open `/`) except in the
  specs about the login screen (02, 06, 07, 17, 19: `{ ui: true }`; the seeded admin's forced change always goes through the
  UI). Specs 01, 05, 06, 13, 19 and 33 (server state, admin screens) run on `desktop` only (16 stays on both: it resets kid1's
  level for the specs after it). Traces are off unless `ANZO_E2E_TRACE=1` (re-run a failing spec with it). The client is
  rebuilt only when a file in `client/src`, `client/public` or its config is newer than the last e2e build
  (`ANZO_E2E_BUILD=1` forces it). The e2e runner builds into `client/dist-e2e` (`ANZO_CLIENT_OUT`) and its server serves that
  (`ANZO_CLIENT_DIST`): a test run never touches `client/dist`, which the live service serves.
- **A killed e2e run**: the runner refuses a port that already answers (a server left by a cut-off run); Ctrl-C or a kill
  stops Playwright (its own process group), the server and the temp dir at once; after a SIGKILL the next run finds the
  server's pid in `/tmp/anzo-e2e-server.json`, stops it and removes its dir.

## How the e2e server is set up

- **Login rate limit** counts failed attempts only (10/min/IP). `loginAdmin()` in the e2e helpers probes the
  seeded password (a failed login) every call, so `scripts/e2e.js` starts its server with
  `ANZO_LOGIN_RATE_LIMIT=500`; the limiter itself is covered by a unit test.
- **E2E specs share one server and run serially** in every project; specs that change state
  (passwords) restore it. Keep new specs self-restoring.
- The e2e admin password: 07-admin forces the seeded admin to change to `beheer-e2e-2026` (`ADMIN_PW` in
  `e2e/tests/helpers.js`); `loginAdmin()` handles both states. Keep admin specs after 07.
- **e2e stub runner:** the e2e server runs with `ANZO_JOB_RUNNER=stub` (corrections are marked applied at once, no file
  changes) and temp `ANZO_SPOOL_DIR`/`ANZO_LOG_DIR`/`ANZO_BACKUP_DIR`; `scripts/e2e.js` plants a log line containing the
  session secret so spec 25 proves redaction (System page and diagnostics). The Backups tile is red there, by design.
- **The e2e server runs on a fixed clock**: `scripts/e2e.js` starts it with `NODE_ENV=test`, `ANZO_FAKE_NOW` =
  10:00 Amsterdam of today's date and `ANZO_FAKE_NOW_AT` (`server/src/lib/clock.js` offsets `Date` from there; honoured only
  with `NODE_ENV=test`), so a run never crosses midnight. Specs send timestamps from `serverNow()` and run pages that play
  lessons on the same clock with `syncClock(page)` (before navigating; `helpers.js`).
- **Time-of-day unit tests:** build "now" from a fixed hour (see the progress-report test), not `new Date()` minus an hour, or
  the test fails between 00:00 and 01:00 Amsterdam.

## What the specs cover

- **The Home goal card** (`goal-card`) shows for every child with `users.daily_goal` NULL, including the seeded e2e
  children; it is inline (not a modal) so other specs are unaffected. The sleeping mascot depends on the device clock
  (≥ 17:00, nothing done today); specs pin it with `page.clock`.
- **Sound effects** (`audio/sfx.js`) wait up to 2 s for a speech clip to finish, are dropped when a new clip starts, and are
  logged to `window.__anzoSfx` (the e2e spec reads it). The AudioContext is created in `player.unlock()`.
- **Courses** (spec 26): kid1 adds French (or brings it back on the second project's run), plays the current French lesson
  and ends with English active and French *hidden* (its progress kept); kid2 gets English from the admin with a start level and
  ends with it hidden again. Specs that create learners send `course: { track }` (no `track` field exists). Start levels are
  per course: `PUT /api/admin/users/:id/courses/:track { startPack }`.
- **Spec 27 (Dutch)** creates the adult learner `e2e-dutch` (native English, Dutch from A2) through the admin API and deletes
  it in `afterAll`; it opens lessons below the start level by URL (`/lesson/<id>`). `txt()` resolves `{ en }` meanings too.
- **Specs 28–29**: 28 taps every audio control hundreds of times (desktop, mobile and mobile-webkit; it answers nothing; it
  forces its warm-up taps, since a playing speaker pulses and Playwright waits for animations to stop); 29 creates the learner
  `e2e-end-screen` (native English, Dutch from Start), plays two lessons (end screen, < 60 % line, Continue → the next lesson), checks
  the avatar and goal grids at 320–1280 px, the empty course sheet and the error screen (a context with `serviceWorkers:
  'block'` so `page.route` sees every request), and deletes the learner. Before a user is loaded the error screen speaks the
  device's language (`loginLang`).
- **Specs 30–31 (texts)**: 30 plays the Dutch pilot unit as admin in Admin → Levels → Preview — reading (glossary popover,
  ▶ highlights the current sentence, ■ stops, the text folds), the stepped text screen ("Question 2 of 5", the text is the
  same element, it folds on a phone and sits beside the question on desktop), the cloze with a wrong first gap (per-gap
  feedback; it comes back), ordering, the dialogue, listening (transcript after the text's last listening question) — then
  checks the test DB counts did not change and that a learner gets a `roadmap` row and a 404 for a preview pack; 31 (also
  mobile-webkit) plays the dialogue and expects A's clip, then B's in the second voice. A pulsing (animated) button never
  becomes "stable" for Playwright: the text ■ is static.
- **Specs 32–34**: 32 (also mobile-webkit) rearranges placed answers in Admin → Levels → Preview — build the sentence (tap:
  select, swap, move to an insert marker, send back; keyboard arrows; mouse drag; a finger drag), the word-bank fill-in, the
  ordering (tap swap, mouse drag) and a word-bank cloze (the B1 cloze is typed: the spec gives it `options` with
  `page.route`, so the context blocks service workers). Playwright has no touch-move: `touchDrag` dispatches pointer events
  with `pointerType: 'touch'`, rests 320 ms (the app's long press) and moves. Keep both drag ends on screen and off the sticky
  Check bar (a drop under it lands on the bar). 33 lets the admin take Dutch (native language English, *Learn a language
  yourself*, the course sheet), play a lesson, see his progress in Admin → Users and reset it; it restores everything. 34
  writes its own lines into the e2e log directory (`ANZO_E2E_LOG_DIR`), acknowledges one and all, checks a new occurrence and
  the 14-day limit, and ends with a fresh copy of the line spec 25 expects to be the newest problem.
- **Spec 35 (Dutch B1, also mobile-webkit)** creates the adult learner `e2e-b1` (native English, Dutch from B1), checks that B1
  follows A2 in the level sheet and is `available`, plays the reading lesson of nl-b1-u02 to the end (every question stepped
  through, the cloze typed, the ordering) at 100 %, and plays the dialogue of nl-b1-u03 expecting a clip of speaker A and one
  of B; the learner is deleted in `afterAll`.
- **B2** (specs 38–39): 38 plays every B2 exercise kind on the nl-b2 pilot in Admin → Levels → Preview (desktop, mobile,
  mobile-webkit); 39 creates three learners (a Dutch adult from nl-b2, English and French from B1), checks that the branches
  follow the B2 core on the path and in the level sheet (`data-branch`, `data-optional`), plays a branch lesson and an English
  and a French B2 text lesson to the end and a French B2 dialogue in two voices, and deletes the learners. Both use
  `answerB2(page, byId)` from `helpers.js`, which answers any B2, text or vocabulary exercise from the pack on disk. Unit side:
  `server/test/b2.test.js` (rules, grading, branch packs, `transformsFirst` order of en-b2 and fr-b2).
- **Spec 40 (family board)**: kid1's Home card (everyone up to five; a family of seven mocked with `page.route`: the top five
  and "+2 meer") and the full board (sorted by XP, the goal bar is the sum, 7 day dots with today marked), the Settings switch
  off and on, the admin's goal form (an invalid goal, then 200) and hiding kid2 in Admin → Users (desktop only), and that the
  former Audio lab is gone (`/api/admin/lab` 404). It restores the goal (500) and every account on the board. The crown needs
  last week's XP, which a spec cannot write: its rules are unit-tested (`server/test/family.test.js`, also both DST weeks); a
  screenshot sets one member's `crown` with `page.route` (and checks the crown's label and the legend under the list, which shows only while someone wears a crown).
- **Spec 41 (Listen check)**: OK, then Bad with a reason and a note (the fix queue counts it), the state survives a reload, the
  strata table; a learner's 403. Verdicts stay in the e2e server's temporary database (counts compared before/after). Unit
  side: `server/test/listen.test.js` (bounds: rule of three, Clopper–Pearson; sampler and serving order; fix queue; the Audio
  quality table; routes; the queue as `audio:check` reads it).
- **Spec 42 (rules page)**: Admin → What counts as correct — collapsed sections, one opened, the French chip, search, no match;
  four answers wrong only by spacing graded right through `/api/admin/preview/attempt` (nothing stored). Unit side:
  `server/test/rules-page.test.js` (the page's JSON is compiled from `docs/grading-rules.md` section 8; every example graded),
  `server/test/grading-spacing.test.js` (spacing, dictation variants, build tiles old and new).
- **Spec 43** (desktop, mobile): a wrong French dictation with its word marks (they follow the grade's leniencies) and the
  capitals line, a Dutch compound typed as two words (both in Admin → Levels → Preview: nothing stored), *Record again* on an
  audio report in the Inbox (stub runner: review, Keep new, Keep old; the report is dismissed afterwards), the Listen check's
  pooled view.
- **Spec 44** (mobile): Audio quality, *How this works* in the admin's language, *Record again* on a Bad clip of the fix queue
  (stub runner, Keep old), the Corrections line and explanation; `fe-a1-1` in Preview with English options and French text.
- **Spec 45** (desktop, mobile): an English-speaking learner (made and deleted by the spec) adds French, plays
  `fe-a1-1-u01-l01` and, from start level A2, `fe-a2-u01-l01`; a Corrections edit of `fe.bonjour`'s meaning with the
  shared-French note (stub runner); the Listen check without the former compare round (its routes 404).
- **Spec 46** (desktop, mobile): an English-speaking learner from start level B1 plays the first B1 text lesson (English title
  and hints, the translation after the questions), then from B2 the first B2 lesson and a key word transformation whose
  English meaning appears after checking.
- **Spec 47** (desktop, mobile): Settings → Theme (System / Light / Dark, saved per account, never another theme on the first
  paint — a MutationObserver on the document from an init script —, the login screen follows the device) and axe-core's
  `color-contrast` rule on every screen — login, Home and its sheets, every exercise kind with both result strips, the done
  screen, practice, profile, settings, the family board, a message, the error screen; every B1/B2 kind in Admin → Levels →
  Preview; every admin screen — in light and dark under each course's accent (`data-track` set per pass), 0 violations.
  Home's path is audited on its first 30 items (all ~800 take axe minutes); animations off (`reducedMotion`).

## Unit tests by area

- **Audio**: `audio-check-shape.test.js` (the check's rules, the 13 reported clips in `fixtures/reported-clips.json`, the lexicon,
  the carrier and pins in the hash, `synth.py`'s cut inside the pause); `audio-listen-fixes.test.js` (the lexicon entries, the targeted
  overrides, `pause`/`hiatus` only listed, no take for a pronunciation remark, the bulk guard, `cap_hiatus` on a synthetic
  signal, `seedOf`, and a seeded render twice: same samples); `audio-overrides.test.js` (overrides); `audio-lexicon-sections.test.js` (lexicon
  `initial`, `beforeVowel: hurry`, the override `hiatus` with `say`); `rerecord.test.js` (request checks, the next take, the
  service's states with the stub and with spool files).
- **Grading**: `grading-word-marks.test.js` (word marks, the capitals line, Dutch compounds) next to the grading tests per language.
- **Courses**: `course-target.test.js` (manifest `target`/`idPrefix` and the validator, the `en` meaning layer, `buildPack` and
  `withPrefix`, the loader/clips/grading by target, Coming soon and the offering rule, removed-lesson tracks, the content
  job's affected packs); `corrections-variant.test.js` (fe items found next to fr items with their course, target and meaning
  language and `sharedWith`; the English meaning edited from `content/src/fr`, only the `en` value written; ids mapped to the
  sources (`sourceSide`); affected packs by the target; a hide applies to the course that hid it); `fr-en-b1-b2.test.js`
  (fe-b1/fe-b2 sources with `en` everywhere; texts, glossaries and cloze hints in English; the transform lines in fe-b2 and
  none in fr-b2; the French packs for Dutch speakers byte-identical; no new clips; `typedAlso` → `acceptAlso` on typed
  fill-ins of one course only).
- **The rest**: `theme-sample-archive.test.js` (the theme setting, the live audio-check tile, the fix queue's note, *Heard OK now*, Keep
  old vs *Neither*, the archive's room check, the French tap forms, the seed files, *Before release*, the colon rule);
  `publish-check.test.js` (the only file with planted secrets, addresses and names: `publish:check` skips it);
  `colour-literals.test.js` (no colour outside `tokens.css` but the allow-listed illustrations; every dark token overrides a
  light one); `backup.test.js` (manual backups); `docs.test.js` (every Markdown link in a tracked file resolves to a tracked
  file).

## Gotchas

- Headless WebKit reports some cancelled media loads as response status 0 (a newer clip replaced them).
- **Races that tracing hides.** With traces off the specs run faster: `isVisible()` does not wait (wait with
  `expect(a.or(b)).toBeVisible()` before branching on it: specs 26, 27, 33), and WebKit settles the page a moment after a
  scroll (spec 32 waits two animation frames before measuring a drag). A spec that passes only with `ANZO_E2E_TRACE=1` has
  such a race.
- **undici keep-alive:** a test client idle for > 5 s (the server's keep-alive timeout) may hit "other side closed" on its
  next request; `scripts/jobs/integration.js` retries once.
- **Scratch clones** (`scripts/jobs/scratch.js`): a symlink is a *file* to git, so `dir/` ignore patterns miss the symlinked
  `node_modules`, `content/reference/extracted` etc.; the helper adds them to `.git/info/exclude` (else the job sees a dirty
  `content/`). The audio copy is hard links; `manifest.json` is a real copy because the renderer rewrites it in place.
- Every `npm run build` (also inside `test:e2e`) leaves a `/tmp/<32-hex>/sw.js` staging dir from workbox, and Vitest leaves
  `/tmp/<random>/ssr` caches; Piper/WebKit runs also leave empty `/tmp/mat-debug-*.log`, a `/tmp/pulse-*` dir and `/tmp/.ses`;
  plus `/tmp/node-compile-cache` and `/tmp/playwright-transform-cache-1000`. Remove them after a session.
- **The README's images** (`docs/images/*.png`) are chosen phone screenshots of an e2e run (`e2e/screenshots/`, gitignored and
  rewritten by every run, generic accounts only), each looked at for a real name, domain or LAN address, then shrunk to 360 px
  wide and palette-compressed with sharp.
