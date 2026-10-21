# Data model

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). Tables by migration, XP / streak / strength rules, reset and delete semantics, practice, daily goal, badges.

```
users           id, username UNIQUE NOCASE, password_hash (bcrypt 10), role child|admin,
                display_name, track en|fr|NULL (dropped by 008: user_courses), avatar, created_at,
                must_change_password 0|1 (002: seed admin + any admin-reset; cleared by self-service change;
                enforced for admins only — children are never blocked)
user_stats      user_id PK, xp, streak_current, streak_best, last_active_date ('YYYY-MM-DD' Amsterdam)
lesson_progress (user_id, lesson_id) PK, status 'done', best_score, times_completed, first/last_completed_at
attempts        id, user_id, lesson_id, exercise_id, item_ids JSON, correct 0|1, given_answer JSON, created_at
item_strength   (user_id, item_id) PK, strength 0..5, last_seen_at, next_review_at
schema_migrations version PK, applied_at
sessions        (better-sqlite3-session-store) sid, sess, expire
```

Rules: XP +10 first-try correct, +5 correct after retry, +20 lesson bonus (practice: +5 / +2 / +10). Score = first-try %.
Streak: one lesson or practice session per Amsterdam calendar day; missing a day resets. Item strength: +1 correct
(max 5), −1 wrong (min 0), **at most once per item and run** (a lesson run or a practice session): the item's first correct
answer in the run raises it, its first wrong answer lowers it, later answers in the run only update `last_seen_at`
(older rows, stored before this rule, were not rewritten). `next_review_at` = now + [0,1,3,7,14,30][strength] days; updated
for the exercise's `items` plus its `sentenceId`. A lesson run is keyed by the client's `startedAt` of that run, sent with
every attempt and stored in `attempts.run` (009); practice attempts use `practice_session_id`; an attempt without a run
(an old client) counts on its own.

003 (`003_users_settings.sql`) adds to `users`: `ui_lang 'nl'|'en'` (default nl), `native_lang` (CHECK `'nl'`,
reserved, not editable), `avatar_bg` (colour name), `show_on_login 0|1`, `can_self_reset 0|1`; maps the old
avatars `kid1`→`cat/sky`, `kid2`→`rabbit/peach`, others→`owl/lilac`; sets `admin.ui_lang='en'`; and creates

```
lesson_completions  id, user_id, lesson_id (NULL = XP total from before 003), score, xp, completed_at
```

`user_stats.xp` is the running total of `lesson_completions.xp` (each completion inserts a row).
`users.avatar` is an avatar id (`server/src/lib/avatars.js`: fox owl cat dog bear rabbit panda frog penguin
lion mouse koala pig hedgehog robot dino), `avatar_bg` one of sky mint sun peach lilac rose sand teal
(`--avatar-<name>` in `tokens.css`). Usernames: `^[a-z0-9_-]{2,24}$`, unique case-insensitively, never changed.

**Reset semantics** (`resetProgress`, used by admin and self-service alike): scope `{track}` (a whole course: every
available pack of that track) or `{packId}` (one level); the learner may reset only courses they see, the admin any course
the user is enrolled in (hidden too); deletes that scope's `lesson_progress`, `attempts`, `lesson_completions`
(by lesson id), `item_strength` (vocabulary + sentence ids of those packs) and every `practice_sessions` row that
practised an exercise of the scope (with its attempts; a session's XP is not split per exercise); then
`xp = Σ completions + Σ practice`; the **streak, goal days and badges are never touched** (they count days and achievements); other
levels, the other courses and other users are untouched. Logged as
`msg: "progress reset"` with `by, user, scope, xpBefore, xpAfter, deleted`.

**Delete user** (`deleteUser`): one transaction over `USER_TABLES` + `sessions` (by `json_extract(sess,'$.userId')`)
+ `users`. The unit test finds every table with a `user_id` column from the schema, so a new table must be
added to `USER_TABLES` (today: `user_stats lesson_progress lesson_completions attempts item_strength practice_sessions
user_badges daily_goal_days content_reports child_messages user_courses listen_checks audio_sample_votes`). The server refuses to delete or demote the last admin and refuses self-deletion.

004 (`004_start_pack.sql`) added `users.start_pack` (the start level); since 007 it is per course (`user_courses.start_pack`).

005 (`005_practice_gamification.sql`):

```
practice_sessions  id, user_id, track, mode due|mistakes, exercise_ids JSON (play order), exercises, started_at,
                   finished_at NULL (= unfinished, xp 0), first_try_correct, xp
attempts           + practice_session_id NULL, first_try 0|1|NULL (backfilled: first attempt of the exercise after the
                   lesson's previous completion)
lesson_completions + started_at NULL (completed_at minus the clamped duration; NULL = unknown, before 005)
users              + daily_goal NULL|20|50|100 (NULL = not chosen: the app asks, 20 applies), sound_effects 0|1 (default 1)
user_badges        (user_id, badge_id) PK, earned_at, silent (1 = backfilled, never announced)
daily_goal_days    (user_id, day) PK, goal, xp, reached_at  — days the goal was reached (Amsterdam)
```

`user_stats.xp` = Σ `lesson_completions.xp` + Σ `practice_sessions.xp` (`XP_TOTAL_SQL` in `progress.js`).

**Practice** (`server/src/practice/`, on the active course: the functions read `user.active_track`, which the routes fill
with the effective active course via `withActiveTrack`): targets = items of the active course with `next_review_at <= now`, weakest first
(then longest overdue), plus items answered wrong in the last 7 days. Candidates = playable exercises of lessons the
child completed. An exercise qualifies when its items (+ `sentenceId`/`listen`) include a target; its kind should fit the
item's strength: 0–1 recognise (`multiple_choice`, `listen_choose`, `match_pairs`), 2–3 assemble (bank `fill_blank`,
`build_sentence`), 4–5 produce (typed `fill_blank`, `listen_type`); without one, the nearest kind. 12 at most, no exercise
twice, ≤ 2 per primary item (`items[0]`); fewer than 6 qualifying → top up from the most recently completed lessons;
order recognise → assemble → produce. "My mistakes": exercises with a wrong **first-try** answer in the last 14 days and no
first-try right answer since (a retry inside the same lesson is always right in the end, so it does not clear a mistake).
Attempts whose stored `item_ids` differ from the exercise's current items (an older version of the exercise) are ignored by
mistakes and by accuracy statistics (`isCurrentAttempt`). The Home button shows due **vocabulary** items. XP: +5 first try,
+2 after retry, +10 completion; the streak counts it like a lesson; `item_strength` changes as in lessons; no
`lesson_progress` row. Seed: user id + number of sessions (deterministic per session).

**Daily goal**: today's XP = lessons + practice of the Amsterdam day (`activity.js`, DST-safe: grouped in JS). When a
completion reaches the goal, a `daily_goal_days` row is written and `reachedNow: true` is returned once that day (the done
screen celebrates). Like the streak, goal days are never removed by a reset.

**Badges** (`server/src/lib/badges.js`, ids stable): `first-lesson first-practice lessons-10/50/100` (distinct lessons done)
`streak-3/7/30/100` (best streak) `perfect-lesson` (a completion at 100 %) `unit-complete` (one badge; the profile counts
units) `level-<pack id>` (every lesson of a pack) `words-50/250/500/1000` (vocabulary with strength ≥ 3; sentences don't
count) `goal-week` (7 consecutive goal days) `bug-hunter` (a 🚩 report fixed by a correction; awarded when the fix is applied).
Evaluated from stored history after every completion (`awardBadges`,
`INSERT OR IGNORE`); earned badges are never taken away, not by a reset either. Backfill = the same evaluation, `silent = 1`.

Seed (idempotent; at startup when `users` is empty, and `npm run seed`; `server/src/lib/seed.js`): the accounts of
`config/seed.local.json` (this installation's own, gitignored), else `config/seed.example.json` (committed, generic: `kid1/kid1`
"Sam" (en, cat/sky) and `kid2/kid2` "Alex" (fr, rabbit/peach) on the login grid, `admin/admin` (ui_lang en, owl/lilac, not on
the grid)); `ANZO_SEED_FILE` names another file (the unit tests and the e2e server use the example). A seeded admin must
always change the password at the first login. Password minimum: 4 (child), 8 (admin).
Item strength is also updated for a listening exercise's `listen` id.

006 (`006_corrections_reports.sql`):

```
attempts            + legacy 0|1 (an earlier version of the exercise: other items now, or hidden; set by markLegacyAttempts)
content_corrections id, kind edit|hide|undo, author (username), track, pack_id, unit_id, target_kind vocabulary|sentence|exercise,
                    target_id, before_json, after_json (changed fields only), reason, summary, undo_of, report_exercise,
                    status queued|applied|rejected ('running' is derived from status/content-job.json), result_reason (plain),
                    detail (technical), commit_hash, undone_by, created_at, finished_at
content_reports     id, user_id, exercise_id, lesson_id, pack_id, unit_id, track, reason native|target|audio|other, note (≤ 200),
                    snapshot JSON, ui_lang, status open|closed, resolution correct|fixed|dismissed, correction_id, created/updated/closed_at
child_messages      id, user_id, kind checked|fixed, text (in the child's language or the admin's own), report_id, exercise_id,
                    created_at, shown_at
```

`content_reports` and `child_messages` are in `USER_TABLES`; a reset removes those of the scope's lessons/exercises.
`content_corrections` has no `user_id` (it keeps the author's username when the account goes).

- **Practice, badges, daily goal** are described under the data model (005). The client resolves practice
  exercise ids in the packs it already loaded (`findExercise`); a new exercise type must get a `PRACTICE_TYPES` entry and a
  band in `practice/select.js`. A new badge: add it to `BADGES` (stable id) with locale keys `badges.<id>.title/.condition`
  in both files, and a `family` drawing in `BadgeIcon.jsx` if new.

009 (`009_attempt_run.sql`): `attempts.run` (TEXT NULL, the lesson run's `startedAt`) + index `(user_id, run)`. A later
answer in the same run updates `last_seen_at` and keeps `next_review_at` no earlier than it (older rows may have a strength-0 item with `next_review_at <
last_seen_at`, which `check:integrity` accepts at strength 0: due at once either way).

010 (`010_autoplay.sql`): `users.autoplay` 0|1 (default 1) — *Settings → Play words automatically* (`PATCH /api/auth/me
{autoplay}`); before it, a per-device switch in the lesson header.

011 (`011_problem_acks.sql`): `problem_acks (key PK, acked_at, acked_by, message)` — Admin → System → Problems *Acknowledge* /
*Acknowledge all*. `key` = the log source + the message with every number as `#` (`problemKey` in `ops/logs.js`); an entry
stays hidden while its key has an acknowledgement at or after its time (the newest occurrence shown, if a log's clock runs
ahead), so a new occurrence shows again. No `user_id` (the admin's username as text); rows older than 30 days are deleted when a
new one is written. The logs are never edited.

012 (`012_completion_run.sql`): `lesson_completions.run` (the run key the client sent, as `attempts.run`) with an index
`(user_id, lesson_id, run)`: the same run completed twice is stored once (the ±2 s rule on the clamped start remains for rows
without a run); index `attempts_practice (practice_session_id, exercise_id)`.

013 (`013_family_board.sql`): `users.show_on_board` 0|1 (default 1: *Settings → Show me on the family board*),
`users.board_hidden` 0|1 (default 0: the admin hides an account, Admin → Users), and

```
app_settings  key PK, value, updated_at, updated_by (the admin's username as text)   — familyGoal: the family's XP per week (absent = 500)
```

014 (`014_audio_lab.sql`) created `lab_votes`, the votes of a former Admin → Audio lab; 015 (`015_lab_both_bad.sql`, a table
rebuild) widened its `vote`; 018 (`018_drop_lab_votes.sql`) drops it.

016 (`016_listen_checks.sql`): `listen_checks (id, user_id, file, track, speed, text, kind word|short|sentence|text,
rerendered, verdict ok|bad, reason?, note?, heard_at)` — Admin → Listen check, one row per clip heard (in `USER_TABLES`). `file`
is the clip as heard: the latest verdict per file counts; a clip whose current file's latest verdict is Bad is the fix queue
(`server/src/lib/listen.js`, `scripts/audio-check/listen.js`). The Listen check's Audio quality table is computed from it
(`server/src/lib/quality.js`), and an authoring session can read it for a round of improvements.

021 (`021_theme.sql`): `users.theme` `'system'|'light'|'dark'` (default `system`, CHECK) — *Settings → Theme*
(`PATCH /api/auth/me {theme}`); the client mirrors it in `localStorage['anzo.theme']` so `client/public/theme.js` paints it
before the first frame, and forgets it at logout (the login screen follows the device).

022 (`022_audio_sample_votes.sql`): `audio_sample_votes (id, sample, row_id, user_id, vote new|old|neither, note?,
voted_at, UNIQUE (sample, row_id, user_id))` — Admin → Listen check → *Before release*: an admin's choice per row of a sample of
new recordings (the sample itself is the spool file `status/audio-sample.json`; `server/src/routes/sample.js`). In `USER_TABLES`.

019 (`019_listen_compare.sql`) created `listen_compare`, the votes of a former voice compare round; 020
(`020_drop_listen_compare.sql`) drops it.

017 (`017_clip_rerecords.sql`): `clip_rerecords (id, author, track, speed, text, old_file, new_file?, entry_json?, unpin,
flags_old?, flags_new?, status making|review|keeping|kept|dropping|dropped|failed, result_reason?, detail?, commit_hash?,
report_exercise?, created_at, finished_at?)` — *Record again*, one row per request (`server/src/ops/rerecord.js`). `author` is
a username (no user id: like `content_corrections`, the history outlives an account).

**Family board** (`server/src/lib/board.js`): this week only, Monday–Sunday on Amsterdam calendar days (`weekOf`, pure date
arithmetic, so DST never moves a day); per member: XP this week (lessons + practice, `activityRows`), the 7 days with a finished
lesson or practice session, the effective streak; sorted by XP (equal XP shares a rank and is listed alphabetically by display name). The
crown: last week's highest XP above 0 among today's members (each of a tie). Members: `show_on_board = 1 AND board_hidden = 0`;
the family goal counts the members' XP. Nothing is stored per week: the board is computed from the completions, so it "resets"
every Monday by itself, and a progress reset (which removes completions) lowers that week's XP as it lowers the total.

**Texts** (B1): reading, dialogue, listening, order and cloze exercises are recorded like any exercise (one question = one
exercise for the first-try score, XP and practice). A cloze moves the strength of its `items` (its gap words); a comprehension
question or an ordering (`TEXT_QUESTION_TYPES`) only marks the text's words as seen (`recordAttempt` `touchOnly`: `last_seen_at`,
no strength move, never "recently wrong"); "My mistakes" counts and plays only `PRACTICE_TYPES`; practice may pick a cloze, never
the others (`PRACTICE_TYPES`). **Preview packs** never hold progress: learners cannot reach them, admin preview play stores
nothing, and course resets, the admin's progress view and report, practice candidates and level badges leave them out. A level
moved back from available to preview keeps its progress: practice skips it and `check:integrity` warns. A lesson
open across a content reload completes with any playable count it had before (`knownCounts` in `store.js`).

**Branch packs** (manifest `branch`, `after`): progress rows like any pack's; course progress (`/api/courses`, Admin →
Users) counts the core packs only (`corePackIds`); a branch is never a `start_pack` (`checkStartPack`, the seed check, the admin's
start-level select); its level badge `level-<pack>` is earned like any level's; resets by pack or course include it.

**Extra lessons** (`lesson.extra`, *Extra oefening*): optional. Progress per level (`/api/content/tracks`, `/api/courses`,
the admin report) counts `requiredLessonIds` (the pack's lessons without extra ones); unit and level badges ignore extra
lessons; a reset of a level or course removes their progress like any lesson's (`lessonIds` keeps them).

## Courses (007, 008)

```
user_courses  (user_id, track) PK, start_pack NULL (= the course's first available level), enrolled_at, hidden 0|1
users         + active_track NULL, can_self_enroll 0|1 (default 1), audience 'child'|'adult' (default child; admins adult)
              − track, − start_pack (008 rebuilds the table; native_lang keeps no CHECK: NATIVE_LANGS in lib/langs.js)
```

- **007** enrolled every learner in their `track` with its `start_pack` (active), and every other course they had progress
  in (an earlier track: lesson/attempt/item/practice rows) as a *hidden* enrolment, so all progress belongs to a course.
- **008** rebuilt `users` without `track`/`start_pack` (a CHECK named `track`), in a `-- anzo:foreign-keys-off` migration.
- **Course** = a manifest track + its `native` + its `target` (the language it teaches: `fr-en` teaches `fr` to
  English speakers — `docs/developer/content.md` → *Target language and variant courses*). Progress, enrolment and ids key on the
  track id; grading, clips, trace and word list on the target. `offeredCourses(content, nativeLang)`: courses whose `native` is the
  learner's, with at least one available level; `comingCourses`: those without one yet (the course sheet's *Coming soon*:
  for English speakers, a course whose levels are all still `planned`). `visibleCourses`: enrolments not hidden *and* offered (an enrolment in a course
  not offered — the native language changed — stays in the table, invisible, and returns when the language does).
  `activeCourse`: `users.active_track` when visible, else the first visible enrolment, else none (`lib/courses.js`).
- **Rules:** learners (role `child`) and the admin (`canLearn`, `LEARNER_ROLES` in `lib/courses.js`) enrol by
  the same offering rule (their `native_lang`: an admin whose native language is English is offered Dutch); adding needs
  `can_self_enroll` for a learner (an admin may always, also for himself);
  "remove" = `hidden = 1` (progress kept; adding again restores, keeping the start level); hiding the active course makes
  the next visible one active; switching (`PUT /api/courses/active`) is always allowed between visible courses.
- **Per course:** path, lessons, level header and sheet, start level, practice (`practice_sessions.track` = the active course),
  words learned, level badges (`level-<pack>`, listed for the visible courses plus any earned elsewhere), the admin's lesson
  table and report (`?track=`), reset scope. **Per learner:** total XP (= Σ completions + Σ practice), streak, daily goal and
  goal days, the other badges. XP per course (`xpByTrack`): completions by the lesson's track (content, else the track whose
  id prefix the lesson id starts with — `fe-` → `fr-en`) + practice sessions by their track.
- **The admin as a learner:** his own Home (`/`, and `/my-levels` for his level sheet; his `/levels` stays the every-track page
  with previews), lessons, practice, profile and self-reset work as for any learner; `/api/content/tracks?mine=1` gives him the
  learner view; his 🚩 is hidden (reports go to the admin). Admin → Users shows his courses and progress like anyone's. Integrity,
  reset and deletion treat his rows like a learner's.
- **Integrity:** every progress row's course is one the user is (or was: hidden) enrolled in; `active_track` is enrolled and
  not hidden; enrolments name manifest tracks and start levels of that track; `native_lang` is in `NATIVE_LANGS`.
- **Audience:** `messageKey(kind, audience)` (`ops/reports.js`, client `lib/audience.js`): `messages.<kind>Adult` for adults;
  the 🚩 ⓘ text is `report.infoTextAdult`. Both locales have every variant.

