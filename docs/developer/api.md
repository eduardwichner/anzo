# API

Part of the developer docs (`CONTRIBUTING.md` → *Developer docs*). Every route, the shapes of answers and how typed answers are graded.

An admin who must still replace a seeded or reset password gets 403 `must_change_password` on every route but `/api/auth/*`
(his learner routes too). Every `/api` answer carries `Cache-Control: no-cache` (revalidated: an unchanged pack costs a 304) and every error answer
(status ≥ 400) `no-store`, so no browser, service worker or proxy keeps an error (a cached error once kept a working app looking broken). Request log lines
carry the client `ip`. Every write (POST/PATCH/DELETE) whose `Origin` header names another host is refused with 403 `bad_origin` (requests without
`Origin`, e.g. curl and the tests, pass). Only the peer named by `ANZO_TRUST_PROXY` (default loopback; in production: the reverse proxy)
may set `X-Forwarded-For`/`-Proto`. Sessions roll: every answer extends the login by 30 days. A password change (own, or by the
admin) logs that account out on every other device. An attempt on an exercise hidden by an admin correction after the
lesson or practice session opened answers `{ correct: true, retired: true }` and is not stored; a practice session completes
without it.

```
GET  /api/live                                     public  200 { ok: true } — process + event loop only (a reverse proxy health check, watchdog)
GET  /api/health                                   public  200 { ok: true, version, packs } | 503 { ok: false, version, problems: [string] }
                                                           (DB SELECT 1 + users readable; every available pack loaded and the audio manifest
                                                           with 0 missing clips — per request, from the current content)
GET  /api/users/profiles                           public  login grid (show_on_login = 1, by display name) { profiles: [{username, displayName, avatar, avatarBg, uiLang}] }
POST /api/auth/login {username,password,uiLang?}   public  { user } | 401 | 429 (10 failed/min/IP, or 20 per account per 15 min); a valid uiLang is
                                                           saved to THIS user only on success
POST /api/auth/logout                                      204
GET  /api/auth/me                                          { user (incl. mustChangePassword, uiLang, nativeLang, audience, activeTrack (the effective active course),
                                                           avatar, avatarBg, canSelfReset, canSelfEnroll, showOnLogin, dailyGoal (null = not chosen), soundEffects, autoplay), stats }
PATCH /api/auth/me {uiLang?,avatar?,avatarBg?,dailyGoal? (20|50|100),soundEffects? (bool),autoplay? (bool),showOnBoard? (bool),theme? (system|light|dark)}   { user } | 400 invalid_preferences
POST /api/auth/password {current,next}                     204 | 400 wrong_current_password | password_too_short
GET  /api/content/tracks[?mine=1]                          { tracks: [{id, target, name, native, mascot, startPack? (learner), packs}], active, contentVersion }
                                                           learner: the visible courses (enrolment order); admin: every track (preview rows,
                                                           his own progress) — with ?mine=1 exactly the learner view (his own Home, lessons, practice)
GET  /api/courses                                          learner or admin (his own courses): { active, courses: [{track, target, mascot, startPack, progress, xp}],
                                                           offered: [{track, target, mascot, restore}], soon: [{track, target, mascot}] (for the native
                                                           language, no available level yet: Coming soon), canSelfEnroll (always true for an admin), nativeLang }
POST /api/courses {track}                                  add or restore, and make it active: 201 (the list) | 403 self_enroll_off | 400 course_not_offered
PUT  /api/courses/active {track}                           switch (stored on the server) | 404 not_enrolled
DELETE /api/courses/:track                                 hide (progress kept) | 403 self_enroll_off | 404 not_enrolled
GET  /api/content/packs/:id                                404 not available, 403 other child's track; `track` = the course, `language` = the
                                                           language it teaches (lang attributes; fr for fe-a1-1)
GET  /api/content/packs/:id/path                           the same checks: { id, track, cefr, title, units: [{ id, title, icon, lessons: [{ id, title,
                                                           extra? }] }] } — what Home's path needs (a lesson loads only its own pack)
GET  /api/progress/me                                      { stats, lessons: {id: {best_score, times_completed}}, today: {goal, chosen, xp, reached}, practice: {unlocked, due, mistakes} }
POST /api/progress/attempt {lessonId,exerciseId,answer,firstTry?}    learner only, a course they see (not necessarily the active one);
                                                           400 invalid_answer for an answer no exercise takes (a string > 400 chars, a list > 24)
POST /api/progress/lesson/:lessonId/complete {firstTryCorrect,total,startedAt?}   { xpEarned, score, stats, dailyGoal: {goal, xp, reached, reachedNow}, badges: [{id, family, n?, cefr?, title?}], duplicate? }
                                                           the same run sent twice (same startedAt, ±2 s) is stored once: the repeat
                                                           returns the stored result with duplicate: true and awards nothing
GET  /api/practice/summary                                 { unlocked, due (vocabulary due), mistakes }
POST /api/practice/start {mode: 'due'|'mistakes'}          201 { session: { id, mode, exercises: [{id, lessonId, packId}] } } | 409 practice_locked | no_mistakes
POST /api/practice/:id/attempt {exerciseId,answer}         like a lesson attempt; the exercise must be in that session; first_try computed server-side
POST /api/practice/:id/complete {startedAt?}               { xpEarned, score, firstTryCorrect, total, stats, dailyGoal, badges } | 400 practice_incomplete | 409 practice_finished
GET  /api/profile                                          { user, stats, wordsLearned (active course), courses: [{track, xp, wordsLearned, lessonsDone}], dailyGoal,
                                                           goalWeek: [{day, xp, reached}], badges: [... track? (level badges), earnedAt|null, count?] }
POST /api/progress/reset {scope:'track'|'pack',track?,packId?,password,confirm}   self-service, a course the learner sees (track default = active):
                                                           403 reset_not_allowed unless can_self_reset;
                                                           400 invalid_scope | wrong_password | confirm_mismatch (word = settings.resetWord of the user's ui_lang)
GET  /api/admin/users                                      admin (403 forbidden; 403 must_change_password until the admin changes a seeded/reset password)
                                                           { users: [… courses: [{track, hidden}]], nativeLangs, audiences }
POST /api/admin/users {username,displayName,role,nativeLang?,audience?,uiLang,avatar,avatarBg,password,mustChangePassword?,showOnLogin?,
                       canSelfReset?,canSelfEnroll?,course?: {track, startPack?}}   (course: the first course, same transaction)
                                                           201 { user } | 400 { error: invalid_user, fields: {field: code}, min? }
GET  /api/admin/users/:id                                  { user } | 404 user_not_found
PATCH /api/admin/users/:id {…all but username, password?, boardHidden? (bool)}  { user } | 400 invalid_user | 409 last_admin | cannot_demote_self
DELETE /api/admin/users/:id {confirmUsername}              204 | 409 last_admin | cannot_delete_self | 400 confirm_mismatch
POST /api/admin/users/:id/password {next}
GET  /api/admin/users/:id/courses                          the user's courses incl. hidden (hidden, offered) + offered ones not enrolled
PUT  /api/admin/users/:id/courses/:track {startPack?, hidden?, active?}   enrol / restore / hide / start level / make active | 400 course_not_offered,
                                                           invalid_start_pack | 404 not_enrolled
GET  /api/admin/users/:id/progress?track=                  one course's lessons (default: the active course)
GET  /api/admin/users/:id/report?track=                    { user, track, summary (+ courseXp), days (30, all courses), accuracy (by type, first tries, 30 days / all time), weakest (20) }
POST /api/admin/users/:id/progress/reset {scope:'track',track?}|{scope:'pack',packId}   → {packIds, deleted, xpBefore, xpAfter, stats}
POST /api/reports {exerciseId, reason: native|target|audio|other, note?}   child: 201 | 200 (updated: same exercise, report still open, within 7 days;
                                                           a closed report keeps its outcome and a new one is created) | 429 report_limit (10/day)
GET  /api/messages                                 child's unshown one-time messages [{id, kind: checked|fixed, text, badge?}]
POST /api/messages/:id/shown                       204
GET  /api/admin/inbox                              { groups: [{exerciseId, count, reasons, reports, seen, correctAnswer, clips, current, items, hidden}] }
POST /api/admin/inbox/:exerciseId {action: correct|dismiss|fixed, message?: true|string}   { closed, messages } | 404 no_open_reports | 400 invalid_action
                                                   (fixed: fixed outside Corrections, e.g. new audio — resolution fixed, the "fixed" message, badges checked)
GET  /api/admin/summary                            { openReports, queuedCorrections, systemLevel }
GET  /api/admin/system                             { level, tiles: [{id, level, data}], problems (last 14 days, 50 at most, redacted, each with its
                                                   `key`; acknowledged ones left out), acknowledged (how many are hidden), restarts }
POST /api/admin/system/problems/ack {key}|{all:true}   hide one problem (its key) or every problem shown until it is logged again →
                                                   { problems, acknowledged } | 400 invalid_ack | 404 problem_not_found
GET  /api/admin/system/diagnostics                 { text (header first, redacted, ≤ 25 KB), bytes, filename }
GET  /api/admin/corrections/search?q=              { vocabulary, sentences, exercise } — every course's items, French for English speakers
                                                   (fe…) too; a row: {id, kind, target, native, track, targetLang, nativeLang, sharedWith: [{track,
                                                   nativeLang}] (the other courses built from the same French text), packId, level, unit…, exercises}
GET  /api/admin/corrections/item/:id               { item (+ editable from the source YAML, exercises as admin views) }
GET  /api/admin/corrections/exercise/:id           { exercise }
POST /api/admin/corrections/preview {id, after}    { before, after, usedIn, audioChange, sharedWith (only when the target text changes), exercises: [{before, after,
                                                   mayChange}] } | 400 invalid_correction | nothing_changed. An fe item's `native` is its English meaning (the
                                                   `en` layer of content/src/fr; only that course changes); its `target` is the French shared with the fr course
POST /api/admin/corrections {id, after: {target?, native?, acceptAlso?}, reason?, reportExercise?}   201 { correction } (queued; stub: applied)
POST /api/admin/corrections/hide {exerciseId, reason, reportExercise?}   201
POST /api/admin/corrections/:id/undo               201 | 409 cannot_undo
GET  /api/admin/corrections[/:id]                  history { corrections, queue } / one
GET  /api/family                                           any account: the family board, this week only (Monday–Sunday, Amsterdam):
                                                           { week: {start, end, days[7], today}, goal: {target, xp, reached},
                                                           members: [{id, displayName, avatar, avatarBg, xp, days[7] (practised), daysPractised,
                                                           streak, rank (equal XP shares it), crown (last week's top), me}],
                                                           viewer: {shown, switchedOff, hiddenByAdmin} } — members: show_on_board and not board_hidden,
                                                           by XP, a tie alphabetically by display name; goal.xp = the members' XP this week
PUT  /api/admin/family {goal}                              admin: the family's XP target per week (50–10,000; default 500) → the board | 400 invalid_goal
GET  /api/admin/listen                                     admin: Admin → Listen check { quality (below),
                                                           strata: [{key, track, kind word|short|sentence|text, speed normal|slow, clips, heard, bad,
                                                           upper (95 % bound or null), mayBeBad}], queue: {waiting, again, fixed, waitingClips[≤50]: {file, url, track, speed, text, reason, note, heardAt}},
                                                           heard, next: {file, url, track, speed, text, kind, rerendered, again} | null }
GET  /api/admin/listen/quality                             admin: the Audio quality numbers { groups: [{group words|sentences, rows: [{track, clips, heard,
                                                           bad, upper, redone}]}], fixing: {again, waiting, pronunciation, fixed}, check: {at, clips, flagged,
                                                           explained} | null } (lib/quality.js; computed per request)
POST /api/admin/listen {file, verdict: ok|bad, reason?, note?}   admin: one verdict on a live playable clip (reason: babble|cut-off|wrong-word|
                                                           wrong-pronunciation|other, only with bad; note ≤ 300) → the new state | 404 not_found |
                                                           400 invalid_verdict / invalid_reason / invalid_note
GET  /api/admin/rerecord?files=a.mp3,b.mp3                admin: "Record again" requests about those clips (≤ 10 files; without: the latest 50), newest
                                                           first: [{ id, author, track, speed, text, oldFile, newFile, oldUrl, newUrl, flagsOld,
                                                           flagsNew, status making|review|keeping|kept|dropping|dropped|failed, reason, commit,
                                                           reportExercise, createdAt, finishedAt }]
POST /api/admin/rerecord {file, reportExercise?}            admin: a new take of a clip the app plays now (ops/rerecord.js; the content job makes it)
                                                           → 201 { rerecord } | 404 clip_not_found | 409 already_open (one open request per clip)
POST /api/admin/rerecord/:id/keep · /:id/drop {heardOk?}    admin: Keep new / Keep old (and *Neither — try again*: a drop), only in review → { rerecord }
                                                           (keeping / dropping; with the e2e stub runner kept / dropped at once) | 404 not_found |
                                                           409 not_in_review. `heardOk: true` (Keep old from the Listen check's fix queue) also
                                                           records an OK verdict on the old file
GET  /api/admin/audio-sample                               admin: Listen check → Before release { sample: null | { name, about, voted, totals {new, old,
                                                           neither}, rows: [{ id, track, speed, text, why, oldUrl, newUrl, flagsOld, flagsNew, vote,
                                                           note }] } } — the spool's status/audio-sample.json; rows whose two files are on disk
POST /api/admin/audio-sample/:rowId {vote: new|old|neither, note?}   admin: this admin's choice for the row (again: replaced; note ≤ 300) → the new state |
                                                           404 not_found | 400 invalid_vote / invalid_note
GET  /api/admin/voices                                     read-only: per track {voice, licence, licenceAssessment, lengthScale, slowLengthScale, sample{text,url},
                                                           dialogue{voice, speakerName, licence, licenceAssessment, sample}}
POST /api/admin/preview/attempt {exerciseId, answer}       admin: grades any loaded exercise (a preview pack too) like an attempt, returns the result
                                                           (+ preview: true); stores nothing (Admin → Levels → Preview)
```

`/audio/<track>/<16 hex>.mp3` are the only files served from
`audio/` (`audio/mpeg`, `Accept-Ranges`, clips `immutable` for a year). Everything else under
`/audio`, notably `manifest.json`, is 404: it maps text to files and would reveal listening answers.

`stats` = `{ xp, streak, streakBest, lastActiveDate, activeToday }`. `streak` is the
*effective* streak: 0 if the last lesson was before yesterday (Amsterdam date).

Preview packs (manifest `status: "preview"`): `GET /api/content/tracks` shows their row to a learner as `roadmap` (without progress),
to the admin as `preview`; `GET /api/content/packs/:id` is 404 for a learner; lessons of a preview pack are 404 for attempts and
completion. The admin gets every pack in the course's meaning language (`native` of its track).

Answer shapes: `reading`, `dialogue`, `listening` → the option text, or `"true" | "false" | "not_given"` (result `correctAnswer`);
B2: `gap_sentence` → one bank token per gap (result `gaps: [{ correct, answer: token }]`); `open_cloze`, `word_form` → as
`cloze` (a `word_form` gap may carry `note: 'form'`); `transform` → the words typed into the gap (result `correctAnswer`: the first
authored answer); a `match_texts` question → a paragraph number per statement (result `statements: [{ correct, answer: label }]`);
`complete` → the typed words. Public: `gap_sentence` `{ textId, parts (the text, a removed sentence = [{ gap: n }]), bank: [{ id:
token, text }] }`; `transform` `{ from, key, before, after, native? }` (`native`: the sentence's meaning in the learner's language, shown after checking); `word_form` gaps `{ kind, stem }`; `match_texts` `{ labels,
statements: [{ id, statement }] }`; `complete` `{ statement }`; pack rows, paths and packs of a branch carry `branch: true, after`.
`order_paragraphs` → the parts' ids in order — opaque per exercise (`orderToken(exerciseId, segmentId)`), never the segment ids,
which run in reading order (result `correctOrder`, the same tokens); `cloze` → one string per gap (result `gaps: [{correct,
answer, note?}]`, correct when all are; typed gaps follow the typed rules, a word bank compares case-insensitively). Answer shapes: `multiple_choice`, `listen_choose` → option text (native options as shown, i.e. in the user's native language); `match_pairs` → `{ mistakes: n }`
(matched client-side, correct iff 0); `build_sentence` → token array (the tiles joined with spaces must equal the answer or an
`acceptAlso`, compared as words: tiles carry no punctuation or sentence-start capital, and tiles from an older pack still grade); public `end`: the
sentence's final mark (`.`, ` !` with the French space, null after an abbreviation), shown after the built sentence; `fill_blank`, `listen_type` → string.

Typed answers (`grading.js`): case, extra spaces and a final `.?!` never matter; curly apostrophes = `'`; the space before
`? ! : ;` is optional (also U+00A0 / U+202F); `œ`/`æ` = `oe`/`ae`; a hyphen may be typed as a space or left out; French: a
missing accent is correct with note `accents`; dictation also accepts digits for number words (English 0–100, French 0–100
incl. *vingt et un*, *une*), a one-edit typo in a word of 5+ letters and a French agreement ending that is not heard
(*allé/allée*, *amusé/amusés*, *fier/fière*) — both with note `spelling`. Dutch: a missing accent (*één, café, ideeën,
België*) is correct with note `accents`; digits are number words 0–1000 (*21* = *eenentwintig*, *één* = 1) when the answer or
the typed text has a digit. English (typed fill-ins, clozes and dictation): a contraction may be written out (*haven't* =
*have not*, *can't* = *cannot*; not *'s* / *'d*, which are ambiguous), the British *-t* past and the *-ed* one are both right
(*learnt/learned, spilt/spilled* …, `ENGLISH_PAST_T`), *-ize* for *-ise* (stem of 3+ letters: *realize*, not *sise*), the
American single *-l-* (*canceled, traveling*, `ENGLISH_LL`), and a space may be typed as a hyphen (*well-made* for
*well made*). A build answer must use exactly the given tiles; its word order is compared without case and
punctuation (`orderKey`), so a fronted alternative (*Om negen uur begint de les.*) is graded like the target. An attempt's
response carries `alsoNL: [{ target, nl }]` for items with a Netherlands form (the client shows "In the Netherlands: …").

Public pack lessons carry `extra: true` for an optional extra lesson (*Extra oefening*). Public texts (`units[].texts[]`): `{ id, kind, title, level, speakers?, paragraphs: [[{id, target, native, audio, audioSlow}]] |
turns: [{…, speaker}], glossary: [words], meanings: {tokenKey: meaning} }` (B turns carry the dialogue voice's clips; known
limitation: a listening exercise's transcript, and the words of a cloze's gaps, can be read off the pack's texts — the same lesson shows the
whole text before its cloze). Text exercises: `{textId, question: {id, type, question?|
statement?, paragraph?, options?}}` (no answer), `order_paragraphs` `{textId, unit, bank: [{id, text}]}` (shuffled), `cloze`
`{textId, parts: [{id, paragraph, speaker?, parts: [string | {gap}]}], gaps: [{kind, hint?}], options}`. Public pack extras: `wordAudio` `{ token: url }` (every visible target-language word + whole vocabulary
phrases, for tap-to-hear), `units[].vocabulary[]` / `sentences[]` as `{ id, audio, audioSlow }` (no text),
MC `audio`/`audioSlow` when the question is target language, listen exercises only `audio`/`audioSlow`.
