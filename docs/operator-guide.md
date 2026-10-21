# Anzo — operator guide

For whoever runs an Anzo installation: what to do in the browser, what to do when something is wrong, and how to
install and maintain the server. The project's front page is the [README](../README.md); the developer docs are in
[`docs/developer/`](developer/architecture.md) (their index: [`CONTRIBUTING.md`](../CONTRIBUTING.md)).

Anzo is a self-hosted language-learning app for children (and adults), without paywalls, ads, hearts or anything to
buy. It runs on one small Linux machine on the home network and is used from phones and tablets in the browser, ideally
installed as an app.

- **English** for Dutch-speaking children: Cambridge Young Learners levels Pre A1 Starters → A1 Movers → A2 Flyers, then
  B1 and B2.
- **French** for Dutch-speaking children: DELF Prim levels A1.1 → A1 → A2, then B1 and B2.
- **Dutch** — the standard Dutch of Flanders — for adults who speak English: Start (Pre-A1) → A1 → A2 → B1 → B2, with two
  optional B2 branches (work and study).
- **French for English speakers**: the same French course with English meanings, built from the same lessons and
  recordings — A1.1 → A1 → A2 → B1 → B2.
- An **admin** account manages the accounts: it adds learners, edits and removes them, sets passwords and resets progress.

Each account has its own interface language, Dutch or English (for example Dutch for the children and English for an admin
who reads no Dutch). The English or French being learned never changes with that setting, and the meanings in the exercises
are in the learner's native language (Dutch for English and French, English for Dutch and French for English speakers).
Lessons are short: multiple choice, matching pairs, building a sentence from word tiles (plain words, so no capital or full
stop gives the order away; the sentence's final mark appears after the built sentence), filling in a missing word, and
listening exercises (hear a word or sentence and pick or type it). Words placed in the wrong order are put right without
starting again: tap a placed word to select it, then tap another word to swap the two or a small line between words to move
it there (tap it once more to send it back), or drag it to its place with a finger or the mouse — the same works for
paragraphs to put in order and for the words in a text with gaps. Every English, French or Dutch word a learner sees can be
tapped to hear it, and every sentence has a normal and a slow (turtle) recording. Wrong answers come back at the end of the
lesson until they are right. At the end of a lesson *Verder* (*Continue*) goes back to the path, at the next lesson; *Nog
een keer* (*Once more*) plays it again, and with less than 60 % right on the first try a short line suggests doing just that.
English and French units end with an optional *Extra oefening*: every example sentence of the unit that no other exercise
uses, built, heard or filled in once more; it is never required to move on. On the path it is a star; once done, a green star
with a small check, and the level sheet counts them apart (*Extra oefening: 3 van 19 gedaan*). Learners earn XP, keep a daily
streak, choose a daily goal, collect badges and practise the words they find hardest (*Oefenen*); a mascot — an otter for
English, a fox for French, a lion for Dutch — cheers them on.

The app makes no requests outside the local network: no analytics, no external fonts, no cloud speech services, no AI at
runtime. All audio is recorded in advance on the server by a local speech synthesizer and served as ordinary MP3 files.
Passwords are stored as bcrypt hashes.

This guide has two parts: **[using Anzo](#using-anzo)** — what to do in the browser and what to do when something is wrong —
and the **[technical reference](#technical-reference)** for installing and maintaining the server.

## Using Anzo

### What the admin does in the browser

Everything the admin does day to day happens in the browser. The admin home page has six tools above the list of accounts:

- **Inbox** — the learners' 🚩 reports, with a red number when some are open.
- **Corrections** — find any English, French or Dutch word or sentence and correct it; the change is checked, recorded and
  loaded into the app by itself (*How this works* on the page says what happens and what needs a developer session).
- **System** — green / amber / red tiles showing whether everything works, the latest problems, and one button that
  copies everything a developer needs to look into a problem.
- **Family** — the family board (below), where the admin also sets the family goal.
- **Listen check** — the recordings, judged by ear: it plays one recording at a time, exactly as learners hear it, with
  **OK** and **Bad** (and what was wrong: babble, cut off, wrong word, wrong pronunciation, and a note). First come recordings
  marked Bad and made again, then new recordings nobody has heard, then random ones (two in three a sentence). At the top,
  **Audio quality** shows per language, for words and short phrases and for sentences: how many recordings there are, how
  many were heard, how many are Bad now, at most how many may be bad (95 % certain), and how many were made again — worked
  out each time the page opens, so every new recording counts at once (the same numbers in one line on *Corrections*). Each
  Bad recording in the fix queue shows why it was marked Bad (the reason and the note), plays it, and offers **Heard OK now**
  (it sounded fine after all) and *Record again* (see *The learners' reports*): hear **Old** (in use) and **New**, then *Keep
  new*, *Keep old* (also marks it heard OK) or *Neither — try again* (the new one goes, the recording stays in the queue). A
  wrong pronunciation needs an entry in the pronunciation list instead, made in a developer session. When a developer session
  has prepared a change to many recordings, **Before release** at the top lists a sample of about 20: Old and New of each, with
  the same three choices and a note; nothing changes until a later session reads the choices. *How this works* on the page
  explains all of it. Short sittings are fine: it continues where it stopped. The verdicts are kept, so a later session can
  read them and improve what was found.
- **What counts as correct** — every grading rule in one line with an example (*You type "cafe" for "café" → right, with a
  tip about the accents*), by language (*All · English · French · Dutch*), with a search box. Read-only.

Below the tools, **My course** opens the admin's own Home when the admin takes a course too (*Learn a language yourself*
when not yet): the flag chip, the path, *Oefenen*, the profile and the level sheet work exactly as for a learner, the
admin's progress shows in *Admin → Users* like anyone's, and the admin can reset it in Settings. Courses are offered by
native language as for every learner (an admin whose native language is English is offered Dutch and French). The *Admin*
button at the top of that Home leads back here. The speaker icon opens *Voices*, the levels icon the levels of every
language, the gear *Settings*. On the levels page, **Preview** next to a level opens its lessons: the admin plays any lesson
exactly as a learner sees it, and nothing is stored — no progress, XP or answers. A level marked *Preview* (a new level,
checked there before it is released) exists only there: learners see it as *Later* until it is released. Backups, the data
check, tidying up and restarting a stuck app all run on their own; when one of them fails, the System page turns amber or
red and says what happened.

### Accounts

A new installation starts with the accounts of `config/seed.local.json` — the installation's own list (names, courses,
first passwords), kept out of the repository (`chmod 640`: it holds passwords) — or, without that file, the generic ones of
`config/seed.example.json`:

| Account | Role | Courses | App language |
|---|---|---|---|
| `kid1` ("Sam") | child | English | Dutch |
| `kid2` ("Alex") | child | French | Dutch |
| `admin` | admin | — (it may take a course itself) | English |

Every seeded password is changed at the first login: the admin is held at a change-password form until it is; a learner's
password is set by the admin in *Admin → Users* before the learner gets the device. More accounts — another child, an adult
learning Dutch — are added in *Admin → Users*. The seed files only add accounts that do not exist yet; they never change one
(`npm run seed` adds missing ones later; `-- --account '<json>'` adds one more).

#### Logging in

- The login screen shows a picture for every account marked *Shown on the login screen*, sorted by name; a child taps their
  picture and types their password. Other accounts (the admin, or a child who is hidden from the grid) use the *Other
  account* link and type their username.
- The small **NL | EN** switch at the top of the login screen always shows the language that will be used:
  - Before anyone is chosen it shows the device's language: what was last chosen on the switch on that device, or
    else the browser's (English browsers get English, all others Dutch).
  - Tapping a child's picture switches it to that child's own app language.
  - Changing the switch after choosing a picture (or while typing a username under *Other account*) changes that
    account's app language when the login succeeds — only that account's. A wrong password changes nothing.
  - After logging out, the login screen returns to the device's language.
- Ten wrong passwords within a minute from one device block logging in for that minute; twenty wrong passwords for one
  account within 15 minutes, from any device, block that account for the rest of those 15 minutes.
- Changing a password (in Settings, or by the admin) logs that account out on every other device. A login lasts 30 days
  from the last use, so a learner who plays regularly stays logged in.

#### Managing users (admin)

The admin page (*Admin → Users*) lists every account with its picture, role, courses, XP, streak and finished lessons. *Add
user* opens a form; tapping an account opens the same form to edit it.

- **Username:** 2–24 characters, lower-case letters, digits, `-` and `_`; unique. It cannot be changed later.
- **Name** shown in the app, **role** (learner or admin), the **app language** (Nederlands or English), and a **picture**.
- **Native language** (learners): the language the meanings in the exercises are given in — Dutch or English. Courses are
  offered for it: English and French are courses for Dutch speakers, Dutch and French are courses for English speakers.
  Changing it keeps all progress; the courses of the old native language disappear from the learner's list and come back
  when it is changed back.
- **Wording** (learners): *Child* or *Adult*. An adult learner is addressed as an adult in the few places that speak to a
  child (next to the 🚩 flag: "…then the admin will look at it" instead of "…a grown-up"; the thank-you messages after a
  report).
- **First course** (new learners): the course the account starts with, and its start level. More courses are added in the
  account's *Courses* section, or by the learner.
- **Password:** at least 4 characters for a learner, 8 for an admin. Leave it empty when editing to keep it.
- **Must change the password at first login** (on by default for admins): an admin account with such a password sees only
  the change-password form. Children are never blocked; their simple passwords are intentional.
- **Shown on the login screen** (on by default for learners).
- **Shown on the family board** (on by default): off takes the account off the family board, whatever its own setting.
- **May reset own progress** (off by default) — see *Progress* below.
- **May add and hide courses** (on by default): the learner can add any course offered for their native language and
  hide one. Off: only the admin changes the learner's courses (switching between them always works).
- **Courses** (an existing learner): every course of the account, with its progress and XP.
  - **Start level** per course: the level the learner starts at in that course. Lessons of earlier levels stay playable but
    are optional; the path continues from the first lesson of the start level.
  - **Make active**: the course the learner sees when Home opens.
  - **Hide** / **Restore**: a hidden course disappears from the learner's list; its progress is kept and comes back with it.
  - **Add a course**: any course offered for the learner's native language.
- **Progress** (an existing learner): with several courses, choose the course first; the lessons, the progress report and
  *Reset progress* are per course.
- **Deleting a user** asks the admin to type the username. It removes the account and everything that belongs to it (XP,
  streak, progress, answers, reports, messages, logins) and cannot be undone. The last admin account cannot be deleted or
  made a child, and nobody can delete their own account.

#### Settings (every account)

The gear icon opens *Settings*:

- **App language** — Nederlands or English; the whole app switches at once.
- **Theme** (*Thema*) — *System* (follows the phone's or computer's own light or dark setting; the default), *Light* or
  *Dark*. Saved with the account, so every device the account logs in on shows it from the first moment; the login screen
  always follows the device.
- **Choose your avatar** — 16 animals and characters and 8 background colours. The picture appears on the home screen and
  the login screen.
- **Daily goal** (learners) — *Rustig* 20 XP, *Gewoon* 50 XP or *Fanatiek* 100 XP a day.
- **Play words automatically** (*Woorden automatisch afspelen*; on by default) — questions and listening exercises in the
  language being learned are read aloud once when they appear. Off: nothing plays by itself; the 🔊 and 🐢 buttons always
  work.
- **Sound effects** (on by default) — a chime for a right answer, a soft low tone for a wrong one and a short fanfare at the
  end of a lesson. They are made by the browser itself (no sound files) and never play over the recorded speech: speech goes
  first.
- **Show me on the family board** (on by default) — this week's XP and days next to the others'; off takes the account off
  the board.
- **Change password.**
- **Reset progress** — only for accounts the admin allowed: a whole course or one level of a course.
- **Log out.**

#### Courses

A learner can learn more than one language. Each language is a *course* with its own path of lessons, levels, start level,
practice words and level badges; XP, the streak, the daily goal and the other badges belong to the learner and count
across all courses.

- **The flag chip** at the top left of Home shows the course being played (a British flag for English, a French one for
  French, a Dutch one for Dutch). Tapping it opens *Your courses* (*Jouw cursussen*): every course with how far the learner
  is and its XP. Tapping another course switches to it at once — its path, its level header and its mascot. The choice is
  saved with the account, so another phone or tablet opens on the same course.
- **+ Add a course** lists the courses offered for the learner's native language that are not on the list yet; adding one
  makes it the course being played. **Hide** removes a course from the list without losing anything: adding it again
  brings it back where it was (*Terughalen*). Both need *May add and hide courses* (on by default); the admin can always
  change a learner's courses in *Admin → Users*.
- **The profile** shows the total XP and, per course, its XP, the words learned and the lessons done.

#### Practice, daily goal, badges and the mascot

- **Oefenen (practice)** works on the course being played. Beside the level bar on Home, the *Oefenen* button shows how many
  words are due for review (99+ at most). Answers change a word's strength (0–5), once per lesson or practice session: the
  first right answer to a word in a lesson raises it by one, however many exercises of that lesson use the word, and the
  first wrong answer lowers it by one. A strong word comes back after days or weeks, a weak one soon. A word counts as
  *learned* from strength 3, so it takes at least three lessons or practice sessions in which it was answered right. A
  practice session is 12 exercises at most, taken from lessons the learner has finished, about the weakest due words first
  and words answered wrong in the last week: easy kinds (multiple choice, listening, pairs) for weak words, building and
  filling in for middling ones, typing for strong ones. With nothing due (*Alles herhaald!*) it practises the latest
  lessons. *Mijn fouten* (*My mistakes*) in the same sheet practises only exercises answered wrong in the last two weeks and
  not answered right first time since. Practice unlocks after the first lesson. It plays like a lesson; it gives +5 XP per
  exercise right first time, +2 after a retry and +10 for finishing, and it keeps the streak going like a lesson.
- **Daily goal.** On the first login a learner chooses *Rustig* (20 XP), *Gewoon* (50 XP) or *Fanatiek* (100 XP); Settings
  changes it. On Home a ring around the mascot fills with today's XP (lessons and practice, by Amsterdam days); reaching
  the goal is celebrated once that day.
- **Badges.** First lesson; first practice; 10, 50 and 100 lessons; 3, 7, 30 and 100 days in a row; a lesson without
  mistakes; a unit complete (with a counter); every level complete (one per level); 50, 250, 500 and 1000 words learned
  (strength 3 or more); the daily goal 7 days in a row; a report that fixed a mistake. A new badge appears on the screen at
  the end of the lesson that earned it. Badges are never taken away.
- **Profile.** Tapping the avatar on Home opens the profile: XP, streak and best streak, words learned in the course being
  played, every course with its XP, the daily goal of the last 7 days as dots, and every badge — earned ones in colour with
  their date, the others grey with what they take.
- **The family board.** A *Familie* (*Family*) card on Home shows the family goal and everyone on the board this week — in a
  family of more than five, the top five and "+N meer"; tapping it opens the board. It is about **this week only** (Monday
  to Sunday, Amsterdam time) and starts again every Monday — there is no all-time ranking, because the learners have
  different languages, ages and levels. Each row: the picture and name, the XP earned this week, seven dots for the days
  practised this week (today ringed) and the streak; sorted by this week's XP (equal XP shares a place, listed alphabetically
  by name). The **family goal** bar adds up everyone's XP this week towards a target the admin sets (*Family* on the admin
  page; 500 XP unless changed). Last week's top learner wears a small crown on the board for the week after (no badge, no
  prize); a line under the list explains the crown while someone wears one. Every account is on the board, the admin's too, unless it switched itself off in Settings or the admin took it off
  in *Admin → Users*.
- **The mascot** (an otter for English, a fox for French, a lion for Dutch) sits on Home, cheers on a right answer,
  encourages after a wrong one, celebrates at the end of a lesson, and falls asleep on Home after 17:00 when nothing was done
  that day (*Nog even oefenen vandaag?*). With *reduce motion* switched on in the device's settings, nothing moves and no
  confetti falls.

#### Progress

Learners earn XP for every finished lesson and practice session and keep a streak of days in a row with at least one. The
admin can open an account to see every lesson of a course (done, best score, times played) and reset progress, and open its
**progress report** (*Progress report*, *Voortgangsrapport* in Dutch) for one course:

- **Summary:** XP (all courses and this course), streak, words learned, practice sessions, badges, and the lessons done per
  level.
- **Activity, last 30 days:** XP per day (lessons and practice stacked), a row of dots for the days with activity, and the
  minutes per day. Lessons finished before durations were measured show as *unknown*; a lesson or practice session counts
  between 1 second and 60 minutes. *Show as a table* lists the same days as numbers.
- **Right on the first try:** per kind of exercise, the last 30 days and all time.
- **Weakest words:** the 20 weakest words and sentences seen, with their meaning, strength, when last seen and how often
  answered wrong.

Resetting progress:

- **What a reset removes:** either one level (for example *Pre-A1 Starters*) or a whole course (for example everything in
  English); the other courses are not touched. Finished lessons, answers, word strengths and practice sessions in that part
  are removed, and the XP they earned is subtracted. The streak, the daily-goal days and the badges stay: they count days and
  achievements.
- **Resetting your own progress:** when the admin ticks *May reset own progress*, the account gets a *Reset progress*
  section in Settings. The learner chooses a level or a whole course, then confirms with their password and by typing
  **WISSEN** (Dutch app language) or **RESET** (English). This is off by default so that a young child cannot wipe months of
  work by accident.
- Every reset is written to the log (`"msg":"progress reset"`, who, whose, what).

### What the app accepts as correct

Capitals and the final full stop never make an answer wrong; after a dictation in which they were left out, the result says
so (*Hoofdletters en punten tellen niet mee*). After a dictation that is wrong or only almost right, the result shows the
sentence with the words that were typed wrong marked in red, the words that were left out in a dashed box, and the
almost-right ones (an accent, one letter) underlined; typed words the sentence does not have are listed below it. Typed
answers also forgive extra spaces, curly apostrophes, the space before `? ! : ;`, a missing space after `, ; :`, spaces
around an apostrophe (*j ' ai*), a hyphen typed as a space, missing accents in French and Dutch (shown as a hint),
written-out English contractions, *learnt*/*learned*, *-ize* for *-ise* and US spellings, a Dutch compound typed as two
words of the course (with a spelling hint); in dictations also a slip of one letter in a longer word, an unheard French
ending (*allé / allée*, with a hint) and numbers typed as digits. Every rule, per exercise and language, with an example:
*Admin → What counts as correct*, and [`docs/grading-rules.md`](grading-rules.md) (the page's source).

### Correcting a word or sentence

*Admin → Corrections* is where a wrong word, meaning or sentence is fixed.

1. **Find it.** Type part of the English, French or Dutch text, its meaning, or an id from a report (`en.cat`,
   `fr-a1-u03-s05`, `en-pre-a1-u01-l01-e04`). Results are grouped into words and sentences, each with its course, level,
   unit, the number of exercises that use it, and a ▶ to hear it.
2. **Open it and change it.** The text being learned, its meaning, and *Also accept* (other spellings or word orders that
   count as right) can be changed; the id, part of speech and gender are shown but fixed, because progress is stored by id.
   In French for English speakers, the English meaning belongs to that course only, while the French text is shared with the
   French course for Dutch speakers (the form says so): correcting the French changes both, with the recording. A reason is
   optional and stays in the history.
3. **Check the preview.** Before saving, the page shows how the exercises that use the item will look, and warns in plain
   words when the change makes a new recording ("The English text changed, so its recording will be made again — about a
   minute.") and how many exercises it touches.
4. **Save.** The correction waits in a queue and is applied in the background, one at a time, usually within a minute or
   two. *History* shows each correction with its status — *Waiting*, *Working*, *Applied* or *Not applied* — with the
   reason in plain English when it was not applied (for example *"ornithorynque" isn't on the A2 word list.*).

What happens in the background: the lesson source is changed, the lessons are rebuilt and checked (content check, word
list, the id lock that keeps every exercise id meaning the same exercise), only the changed English or French text is
recorded again, the content tests run, the change is saved in the version history, the app loads the new lessons without
logging anyone out, and the app's health and the learners' progress are checked. If any step fails, everything is put back
exactly as it was and the History says why.

- **Hide this exercise** (in the list of exercises of an item): for a generated exercise that is wrong as a whole. Learners
  no longer get it; their earlier answers stay valid. A reason is required.
- **Undo** (in History, on an applied correction): reverses it through the same checks, in any order. Only when a later
  correction changed the very same text does the undo say so: undo that later one first.
- **From the command line** (when the browser route is not available): see [Changing lessons from the command
  line](#changing-lessons-from-the-command-line).

### The learners' reports (Inbox)

After checking an answer, a learner sees a small 🚩 flag (and an ⓘ that explains it: *"Denk je dat hier een fout in zit?
Tik op de vlag, dan kijkt een volwassene ernaar."*; an adult learner reads *"… dan kijkt de beheerder ernaar."*). The flag
never appears before checking, so it cannot be used to find the answer. Tapping it lets the learner add a short note and tap
what is wrong: the meaning, the word or sentence being learned, the sound, or something else. A learner can send 10 reports a
day; reporting the same exercise again within a week, while the report is still open, updates it.

*Admin → Inbox* shows one card per exercise, newest first: how many reports, from whom, their reasons and notes, what each
learner answered, and the exercise exactly as the learner saw it, with its recordings. For each card:

- **Already correct** — closes it. Optionally with a short thank-you message, prefilled in the learner's language
  (*"Bedankt! We hebben het gecontroleerd: het was goed."*); the learner sees it once, with the mascot, the next time Home
  opens.
- **Fix "…"** — opens the correction page for that word or sentence. When the correction is applied, the report closes by
  itself and the learner gets *"Bedankt! Jouw melding heeft een fout opgelost."* — and the first time, the *Foutenspeurder*
  (bug hunter) badge.
- **Record again** (on a card whose report is about the sound): *Record again* next to the normal or the slow recording asks
  the server for a new recording of just that one — made the way all recordings are made, in a minute or two, and checked by
  the automatic audio check. The card then shows ▶ *Now* and ▶ *New* with what the check noticed: **Keep new** puts the new
  recording in use (saved in the version history, loaded without logging anyone out), **Keep old** throws the new one away.
  Nothing else changes, and no AI is involved. The same button is on the correction page of every word and sentence (*Record
  again*, under the recording). Then *Fixed another way* thanks the learner.
- **Fixed another way** — for a mistake fixed outside Corrections (for example by new recordings): closes it as fixed, and
  the learner gets *"Bedankt! Jouw melding heeft een fout opgelost."* and, the first time, the *Foutenspeurder* badge.
- **Copy question** — copies a ready-made question in English, with the exercise, the correct answer, the meaning, the
  learner's answer and note, to ask someone (a teacher, a native speaker, an assistant) for a second opinion.
- **Dismiss** — closes it without a message.

### The System page

*Admin → System* answers "is everything all right?" in one look. The line at the top is green (everything works), amber (it
works, something needs a look) or red (something is wrong). The tiles:

| Tile | Shows | Amber / red when |
|---|---|---|
| App | version, commit, how long it has been running, why it last restarted (if known); **Proxy**: the address of the reverse proxy the last login came through, whether it is the trusted one (`ANZO_TRUST_PROXY`) and whether the login cookie was marked Secure | amber: that login came from a proxy address `ANZO_TRUST_PROXY` does not name, or its cookie was not Secure |
| Health | the result of `/api/health` | red: any problem (e.g. missing recordings, database not readable) |
| Content | levels loaded, missing recordings, when the lessons were last loaded | amber: recordings missing, or the last reload failed (the previous lessons stay in use) |
| Backups | the last database backup and the last full archive: when and how big, how many archives are kept and why | red: no database backup in 8 days or the last one failed, or the archive did not fit; amber: no full archive yet or older than 8 days |
| Disk | free space | amber below 2 GB, red below 1 GB |
| Data check | the nightly check that progress matches the lessons | red: it found a problem; amber: not run in 2 days, or the lessons on disk did not load (a change half-way) |
| Content jobs | corrections waiting, the one being worked on, the last result | red: corrections wait but nothing picks them up, or one has been "running" for more than 35 minutes |
| Watchdog | the last check, restarts in the last 7 days | amber: a restart happened; red: it stopped restarting after 3 in an hour |
| Learners' reports | open reports | amber: a report is older than a week |
| Audio check | the automatic check of the recordings (`npm run audio:check`, run in developer sessions) together with the Listen check: recordings flagged now — by the check, unless heard OK since, or heard Bad | amber: a recording is flagged now, could not be checked, or was made since the last check |

Below the tiles, **Problems** lists the latest 50 warnings and errors of the last 14 days from every log (the app, the
background jobs, the backups, the watchdog), newest first, one readable line each, with the raw log line behind *Details*.
**Acknowledge** next to a problem hides it, and **Acknowledge all** hides every problem shown, until the same problem happens
again (then it is back on the list). The logs themselves are never changed, and the diagnostics say how many acknowledged
problems they leave out.

**Copy diagnostics** copies one block of text — a short header, then the
version, the health, every tile, the problems, the last failed correction, the disk, the backups and the restarts — with
passwords, session keys and tokens removed, at most 25 KB. *Download as a file* saves the same text as
`anzo-diagnostics-<time>.txt`. Give it to whoever looks into the problem (see *The app doesn't load at all*).

### Phones and tablets

Open the HTTPS address in the browser (for example `https://anzo.your-domain.example`). To install it as an app: in Chrome
on Android use *Add to Home screen / Install app*, in Safari on iPhone and iPad use *Share → Add to Home Screen*.

- **Installing as an app and offline use require HTTPS** (or `localhost`). This is a browser rule, not an Anzo limitation.
  Opened on the bare IP (`http://192.0.2.10:3000`) the app works in a browser tab, but it cannot be installed and has no
  offline cache. Use the bare IP only for troubleshooting.
- Give the server a **DHCP reservation** in the router so its IP never changes; the proxy points at that IP.
- When offline, an installed app still opens and shows the last loaded screens; lessons need the connection because every
  answer is checked and saved on the server immediately.
- On iPhone and iPad, audio starts after the first tap in a lesson; the tap that opens a lesson already counts.

#### Checking a phone by hand

After a change that affects phones, check once on a real phone (iPhone and Android if available):

1. Open the HTTPS address in the browser — the login screen with the learners' pictures appears.
2. Log in as a learner.
3. Open a lesson and tap the speaker next to a word — you hear it.
4. Add the app to the home screen (Android: *Install app*; iPhone: *Share → Add to Home Screen*).
5. Close the browser and open Anzo from its home-screen icon — it opens full screen, still logged in.
6. Open a lesson again and play a word — audio works in the installed app too.

#### The automatic HTTPS check

`npm run test:live` checks the real HTTPS address read-only (health, secure login cookie, app install files, one audio
clip) at the address in the environment variable `ANZO_LIVE_URL` (or `ANZO_PUBLIC_URL`). If the Anzo server cannot reach its own HTTPS address (a firewall
between its network and the proxy's, for example), run it from another computer with a copy of the repository:

```bash
npm install
npx playwright install chromium
ANZO_LIVE_USER=<an account on the login screen> ANZO_LIVE_PASSWORD=<its password> npm run test:live   # ANZO_LIVE_URL=https://other.name for another address
```

A dry run on the server itself: `ANZO_LIVE_URL=http://localhost:3000 ANZO_LIVE_FORWARDED_PROTO=https npm run test:live`.

### Monitoring (for example Uptime Kuma)

`GET /api/health` needs no login and is cheap. Every call asks the database (`SELECT 1` and a read of the accounts);
whether every available level is loaded and every recording is present is checked once at startup. All good: status 200
and `{"ok":true,…}`. Anything wrong: status 503 and `{"ok":false,"problems":[…]}`, for example `"3 audio clip(s) missing
(run npm run audio:render)"` or `"database not readable"`.

Two monitors (HTTP keyword monitors, keyword `"ok":true`, every 60 s, 2 retries):

| Monitor | URL | Also |
|---|---|---|
| **Anzo (direct)** | `http://192.0.2.10:3000/api/health` | — |
| **Anzo (via the proxy)** | `https://anzo.your-domain.example/api/health` | certificate expiry notification on |

*Anzo (direct)* proves the app itself works; *Anzo (via the proxy)* proves the whole path learners use (DNS, the proxy, the
certificate, the app). **Both red**: the app is down or unhealthy — the direct monitor's response shows the problem. **Only
*via the proxy* red**: the proxy, DNS or the certificate; the app itself is fine. **Only *direct* red**: check the monitor
itself (URL, keyword, the monitoring host's network access to the server).

### The app doesn't load at all

1. **Look at the monitors** (above): which one is red tells where the problem is.
2. **Before restarting anything**, copy the diagnostics — *Admin → System* → **Copy diagnostics**; if the HTTPS
   address does not answer, the server's own address works too (`http://192.0.2.10:3000/admin/system`, `ANZO_LAN_URL` in
   `.env`) — and note the time and which device failed: a restart or reboot wipes the evidence. If the app fails on one
   phone but works on another, try the bare address on the failing phone: if that works, the problem is between the phone
   and the app (the proxy, the network), not in Anzo.
3. On the server: `systemctl status anzo` and `sudo tail -n 50 /var/log/anzo/app.log`. `npm run ops:restart-check`
   restarts the app and proves it came back (a new process, the only one on port 3000, health 200), also when systemd had
   stopped trying after repeated failures.
4. To have it investigated, give the diagnostics, the time and the device to whoever maintains the installation: a
   developer on the server works from the README, this guide and the developer docs, and runs the tests after a fix.

The error page in the app always offers *Opnieuw* (*Try again*) and *Terug naar het startscherm* (*Back to Home*). The
watchdog already restarts an app that stops answering (twice in a row, checked every 2 minutes); if it restarted it 3 times
within an hour it stops and turns red, because restarting does not help then. A planned restart or reload, a stopped app,
and the first five minutes after the app (or the whole server) starts do not count: right after a reboot the app can take a
few minutes to load its lessons.

## Technical reference

### Requirements

- Debian 12, on a machine or container with 2+ CPU cores, 2+ GB memory and 15 GB disk (4 GB of memory to make the
  recordings, run the audio check or the tests; their worker counts follow the machine by themselves)
- Node.js 24 LTS (from NodeSource), build tools for native modules, SQLite, poppler-utils
- For producing the audio: Python 3 with `venv`, and `lame` (MP3 encoder). About 500 MB for the speech tools and voices; the
  recordings take about 850 MB
- A reverse proxy with a TLS certificate (for example Traefik) if the app should be installable on phones — see [Phones and
  tablets](#phones-and-tablets)

### Install from scratch

The README's *Getting started* is the short version. As the developer account — a normal user with `sudo` rights that owns
the code in `/opt/anzo` and runs the background jobs, named `anzo-dev` unless `ANZO_DEV_USER` in `.env` says otherwise (the
service files are rendered for it):

```bash
cd /opt/anzo
./scripts/install-system.sh        # apt packages, Node 24, system user "anzo", Playwright's Chromium + WebKit
npm run install:all                # all npm dependencies (server, client, test tools)
./scripts/install-system.sh        # once more, so the browsers match the installed Playwright version
./scripts/fetch-models.sh          # speech tools (Python venv with Piper) and the voices in content/voices.json
npm run audio:render               # every recording into audio/ — or unzip the release's archive (README, step 5)
```

Create the configuration file (the service reads it; nobody else can):

```bash
cp .env.example .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")/" .env
sudo chown "$USER":anzo .env && sudo chmod 640 .env
```

Afterwards, **edit `.env` in place** (an editor): `sed -i` replaces the file, which resets its group, and the service can
no longer read it.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address (all interfaces, so the proxy and the LAN can reach it) |
| `NODE_ENV` | `production` | |
| `SESSION_SECRET` | — | 96 hex characters; signs the login cookie. Changing it logs everyone out |
| `ANZO_DATA_DIR` | `/opt/anzo/data` | Database |
| `ANZO_AUDIO_DIR` | `/opt/anzo/audio` | Pre-recorded lesson audio (read-only for the service) |
| `ANZO_CONTENT_DIR` | `/opt/anzo/content` | Content packs and schema |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `TZ` | `Europe/Amsterdam` | Streak days always follow Amsterdam time |
| `ANZO_TRUST_PROXY` | `loopback` | The reverse proxy's address (e.g. `192.0.2.1`). Only it may tell the app the visitor's address and that the visit was HTTPS; set it, or the login cookie loses its `Secure` flag behind the proxy |
| `ANZO_PUBLIC_URL`, `ANZO_LAN_URL` | — | the HTTPS address and the server's own address, for the diagnostics, the System page and `npm run test:live` |
| `ANZO_DEV_USER` | `anzo-dev` | The developer account: owns `/opt/anzo`, runs the content job and the disk check; `scripts/install-ops.sh` renders the units and the sudoers file for it |
| `ANZO_GIT_AUTO_PUSH` | `0` | `1`: push to the git remote after each correction made in the browser (see [Version history](#version-history-git)) |

Build the client, prepare the database folder, and set up the service with its background jobs:

```bash
npm run build
chmod -R o+rX /opt/anzo 2>/dev/null; chmod 640 /opt/anzo/.env   # code world-readable, .env not
[ -f /opt/anzo/config/seed.local.json ] && chmod 640 /opt/anzo/config/seed.local.json   # the seed file, if there is one
sudo install -d -o anzo -g anzo -m 750 /opt/anzo/data
./scripts/install-ops.sh            # group anzo-ops, /var/spool/anzo, /var/log/anzo, sudoers, the service, every timer
sudo systemctl restart anzo
curl -s http://127.0.0.1:3000/api/health
```

The recursive `chmod` fails on `data/` (it belongs to `anzo`): hence `;`, never `&&`. On first start the database is created
with the seed accounts (*Accounts* above). The first admin login shows only a "Change your password first" form; the admin
pages open once the admin has chosen a password of at least 8 characters.

#### Updating

An installation cloned from the repository takes a new version with:

```bash
cd /opt/anzo
git pull
npm run install:all
npm run build
npm run content:validate
npm run audio:render       # only recordings for new or changed lessons; or the release's recordings archive
npm run backup:db          # a fresh backup before the service applies any database change
./scripts/install-ops.sh   # picks up changed units and timers
sudo systemctl restart anzo
npm run check:integrity    # the learners' progress still matches the lessons
```

After a Node.js upgrade, rebuild the native modules first: `npm rebuild better-sqlite3 bcrypt`.

### Putting a reverse proxy in front

The app speaks plain HTTP on port 3000 and expects the proxy to terminate TLS:

- **Upstream:** `http://<server-ip>:3000`
- **Headers:** the proxy must send `X-Forwarded-Proto` (and `X-Forwarded-For`). The app believes these headers only from the
  address in `ANZO_TRUST_PROXY` (the proxy), so nobody reaching the app directly can pretend to be someone else. When the
  original request was HTTPS, the login cookie is marked `Secure`; direct HTTP access keeps working without it.
- **Redirects:** the app never redirects HTTP to HTTPS; let the proxy do that.
- **Liveness:** `GET /api/live` answers `{"ok":true}` (200) whenever the app's process runs and responds; it checks nothing
  else. `GET /api/health` is the full check (see [Monitoring](#monitoring-for-example-uptime-kuma)).

A Traefik example (file provider):

```yaml
http:
  routers:
    anzo:
      rule: "Host(`anzo.example.lan`)"
      entryPoints: [websecure]
      service: anzo
      tls:
        certResolver: letsencrypt
  services:
    anzo:
      loadBalancer:
        servers:
          - url: "http://192.0.2.10:3000"
        healthCheck:
          path: /api/live
          interval: 30s
```

Traefik sets `X-Forwarded-Proto` and `X-Forwarded-For` by default. Its `healthCheck` (optional) must use `/api/live`,
never `/api/health`: with one server Traefik stops sending traffic when the check fails, and `/api/health` fails on any
problem — a single missing recording is enough — so learners would get an error page instead of an app that works except
for one speaker button. Watching the full health is the job of the monitors.

### Content packs and levels

The curriculum is plain JSON in `content/packs/`, one file per level ("pack"), grounded in the official Cambridge and DELF
documents and the Dutch references (NT2Lex, *Naar Nederland*, CNaVT, Staatsexamen NT2, Richtgraad). The reference documents
themselves are not in the repository (`docs/developer/content.md` → *Reference files*). `content/packs/manifest.json` lists
every level of every course with a status:

- **Available** / *Beschikbaar* (`available`): playable.
- **Preview** (`preview`): loaded and checked like an available level, but played only by the admin (*Preview* on the levels
  page); learners see it as *Later*.
- **Coming soon** / *Binnenkort* (`planned`): coming, shown greyed out.
- **Later** / *Later* (`roadmap`): further out, shown greyed out.

On Home, a bar at the top of the path names the level and unit in view (for example *Starters · Pre-A1* and *Dieren*) with
a small ring showing how much of that level is done. Tapping it opens the level overview: the percentage of lessons finished
for each available level, *Ga hierheen* (*Go here*) to jump to a level, and a cross that returns to the current lesson.
Levels before a learner's start level are marked optional. When the current lesson is scrolled out of view, a *Huidige les*
(*Current lesson*) button brings it back. Lesson files contain only the learning content (English or French with Dutch
meanings, Dutch with English meanings); the instructions around it ("What does this mean?") come from the app's language
files, so they follow each account's app language. The format is described in `content/README.md`; the lesson files are
**generated** from short, readable unit files in `content/src/<language>/<level>/` — never edit the generated files by hand.

#### English levels

All five English levels are available: **Pre A1 Starters** (19 units), **A1 Movers** (18 units), **A2 Flyers** (21 units),
**B1** (28 units) and **B2** (20 units), every word of each level's Cambridge word list in one unit, each unit with lessons of
6–8 new words and a review lesson (*Herhaling*). Learners walk one continuous path through the levels in order; a heading
marks where the next level starts, and Home opens at the learner's current lesson.

B1 is for teenagers and adults: school, friends, family, work, travel, the news and society, with 29 texts (reading texts and
dialogues) and the B1 grammar (conditionals, the passive, reported speech, the past perfect). Its words are the **B1
Preliminary** vocabulary list (1,917 new words; 12 left out with a reason, such as American spellings)
(`content/src/en/SOURCES.md`); the course is British English.

B2 (B2 First for Schools) is for teenagers from 13 and adults: 20 units on personality and ambition, learning, work, money,
home, health, food, the media, technology, the environment, nature, travel, sport, the arts, relationships, community, the
law, science, debate and the future, each with one original text (an article, a review, a story, an essay, forum posts or a
dialogue) and the B2 exercise kinds described under *Dutch levels*. Its grammar is the B2 grammar of the exam: all
conditionals (also mixed), the passive in every tense, the causative (*have something done*), reported speech with
reporting verbs, modals of deduction (*must have*), *used to / be used to*, wishes and the future perfect. Cambridge
publishes no B2 list, so the 560 new words come from a derived list (`content/src/en/WORDLIST.md`): the words of the B2
First for Schools sample paper plus the topic words each unit needs, each group with its reason.

#### French levels

All five French levels are available: **A1.1** (19 units), **A1** (23 units) and **A2** (30 units), the DELF Prim levels,
**B1** (20 units, 21 texts, for teenagers and adults) and **B2** (20 units, 20 texts, from 13), with lessons of 5–8 new words
and a review lesson (*Herhaling*) per unit. Nouns are taught with their article (*le chat, la maison, l'école*), and the
options in an exercise never give the answer away by their article or gender. A learner walks one path through the levels,
as in English.

DELF Prim publishes no word list (Cambridge does), so Anzo derives one from the official sample papers: every word the
children read or hear in the A1.1, A1 and A2 papers, at the lowest level it occurs, with where it occurs; exam instructions
(*cochez, entourez*) are left out. Because the papers show much in pictures, each level's themes (family, school, food, the
house, the weather, the town …) are completed with the everyday words a child needs for those tasks, and with the concepts
the English course teaches at the same stage, each with a reason. How the list is built and how many words it has per
level: `content/src/fr/WORDLIST.md`. Every French word in the lessons is checked against this list (`npm run content:trace
-- fr`). At B1 the list adds the words of the DELF B1 junior / scolaire sample papers, topic words for their themes and the
concepts of the English B1 course (712 taught, 26 left out with a reason); B1 adds the *imparfait*, *futur*,
*conditionnel*, *subjonctif* and *gérondif*. B2 (DELF B2 junior / scolaire) adds 582 words in topic groups that cover the B2
sample papers' themes (each taught in one unit, three left out with a reason), the B2 exercise kinds and the B2 grammar:
reported speech, the passive, the *conditionnel passé* after *si*, the compound relatives (*lequel, auquel, duquel*), the
connectors of purpose, concession and consequence with the *subjonctif*, the *participe présent* and the *futur antérieur*.
Its texts are set in Belgium where it fits (Brussels, Liège, the language border).

#### French for English speakers

The same French course for learners whose language is English: the same lessons, words, sentences and recordings, with
British English meanings (*bonjour* — *hello*) and its own levels, progress and fox. All five levels are available: **A1.1**
(19 units), **A1** (23), **A2** (30), **B1** (20 units with 21 texts) and **B2** (20 units with 20 texts). It is made from the
French lesson sources, each unit carrying its English meanings next to the Dutch ones. In the B1 and B2 texts the English of
each sentence appears under it once the text's questions are answered (and under the transcript in the listening lesson); a
tapped word shows its English meaning; gap hints are English (*être (imperfect)*); a B2 key word transformation shows the
English meaning of the sentence after it is checked. Where an English speaker would naturally type another correct French
word in a fill-in (*email* for *mail*, *atmosphère* for *ambiance*), this course accepts it too. Where English cannot show a
French difference, the meaning says so in brackets: *tu* "you (informal singular)", *vous* "you (formal or plural)",
*l'amie* "friend (female)". The French grading rules, accent tips and word list are the French course's.

#### Dutch levels

All five Dutch levels are available: **Start** (Pre-A1, 14 units), **A1** (20 units), **A2** (25 units), **B1** (20 units)
and **B2** (20 units, with two optional branches of 8 units each), for adults who speak English and live in Flanders. The
Dutch is **standard Belgian Dutch**: Belgian words where they differ (*gsm, frietjes, zetel, proficiat, de parking, het
rondpunt*), *je/jij* (never *ge/gij*), *hebt u*, Groene Boekje spelling. When a Belgian word has a different Netherlands
form, the answer screen adds "In the Netherlands: *de rotonde*" (for *het rondpunt*); words used only in the Netherlands
(*pinnen, patat, OV-chipkaart*) are never taught. Nouns come with *de/het* and their plural, the meanings are British
English, and the situations are an adult's: the bakery and the market, the town hall, the doctor, the landlord, work, the
children's school. Start teaches *zijn/hebben*, pronouns, the present tense, questions and *niet/geen*; A1 adds word order
after a fronted word (*Morgen werk ik niet.*), separable verbs (*Ik sta om zeven uur op.*), modal verbs, possessives and
numbers to 1000; A2 adds the past (*Ik heb gewerkt. Ik ging.*), *omdat/als/dat* with the verb last, comparisons, the future
and reflexive verbs; B1 adds the passive (*Het afval wordt op maandag opgehaald.*), the pluperfect, relative clauses (*het
huis waarin we wonen*), reported speech, *zou* and the linking words, around real tasks of adult life in Flanders: job
adverts and interviews, the landlord, moving and the town hall, the doctor and the ziekenfonds, letters from school and the
parents' evening, the bank, the news, the neighbourhood, travel, clubs, complaints, opinions and the police. Each B1 unit has
vocabulary lessons and a text lesson — 21 original texts in all, 12 to read (a job advert, an e-mail from a team leader, a
council notice, a newspaper article …) and 9 dialogues heard in two Belgian voices — followed by its review and a listening
lesson. When building a sentence, every correct word order of the tiles counts (*Om negen uur begint de les.* as well as *De
les begint om negen uur.*).

B2 (Staatsexamen NT2 programme II, the CNaVT B2 profiles) is for teenagers from 13 and adults: 20 units on adult public life
in Flanders — work and career, education, housing, health care, money, consumer rights, politics, the media, science,
climate, culture, debate and the future — with 21 longer texts (opinion pieces, features, reviews, an interview, forum posts
and dialogues). B2 adds the exercise kinds of the exam: a **text with sentences taken out** (put each sentence back in its
gap; one extra sentence fits nowhere), a **summary** of the whole text to pick, **multiple matching** (which short text says
what), **word formation** (type the right form of the word in capitals beside each gap), an **open cloze** (one word per gap,
no hints), **key word transformation** (finish a second sentence with a given word so it means the same as the first; after
checking, the sentence's English meaning is shown) and **listening completion** (type the missing words of a sentence you
hear). Long texts get their own scroll pane on a phone. After the B2 core the path shows two optional **branches**, *B2 Work*
(job applications, meetings, the workplace; CNaVT PROF) and *B2 Study* (lectures, papers, the student's life; CNaVT STRT):
they are marked as optional, each has its own badge, and B2 is complete without them.

The words come from a derived word list (`content/src/nl/WORDLIST.md`: 3,057 lemmas, Start 317, A1 449, A2 540, B1 672, B2
1,079), based on **NT2Lex** (Tack et al. 2018, the CEFR-graded lexicon of Dutch as a second language, licence **CC BY-NC-SA
4.0**), with the level at which NT2Lex first observes each word, and on *Naar Nederland*, the CNaVT tasks and the
Staatsexamen B1 and II booklets; Belgian standard forms and everyday Flemish tasks are added by topic, each with a reason.
Every Dutch word in the lessons is checked against this list (`npm run content:trace -- nl`). Which reference file is used
for what: `content/src/nl/SOURCES.md`.

#### Texts and dialogues (B1 and B2)

From B1 on, lessons are built around short texts. A **reading text** shows on the screen; every word can be tapped to hear
it, and words above the level (and the lesson's new words) show their meaning in a small box right under that sentence. The
speaker button reads the text aloud sentence by sentence, the sentence being read lit up and *3 / 24* showing how far it is;
the turtle reads it slowly; while it reads, ⏸ pauses (the speaker button goes on from that sentence) and ■ stops. A phone
call or a locked screen pauses it the same way; a sentence whose recording cannot load is skipped. A **dialogue** looks like
a chat between two people with their names, read aloud in two voices — a woman's and a man's. After the text come its
questions, one at a time, in the language being learned: multiple choice, *true / false / not in the text*, or which heading
fits a paragraph. All questions about one text share one screen: the text (or, when listening, the player) stays at the top
and *Question 2 of 5* with a row of dots shows how far along the learner is; on a phone the text folds into a *Show text* bar
after the first question and opens again with one tap, on a computer the text and the question sit side by side. Then a
**text with gaps** (typed at B1, with a hint per gap — for a verb its infinitive and tense, so *werken (past)* asks for
*werkte*; a word bank below B1), and **putting the paragraphs or turns in the right order**. The review lesson is **listening
only**: the text or dialogue is heard, the questions are answered, and only then can the transcript be shown. Each question
counts like an exercise for the score and XP; the meanings of the text's sentences appear once its last question is
answered. A comprehension question does not change the strength of the text's words (it tests understanding, not the
words); gap texts do, and come back in *Oefenen*.

#### Changing lessons from the command line

The browser route is *Admin → Corrections*; this is the fallback, and the way new content is added (the full procedure:
`docs/developer/content.md`):

```bash
nano content/src/en/pre-a1/01-animals.yaml        # or content/src/fr/a1-1/01-famille.yaml — fix the word or sentence
npm run content:generate -- en-pre-a1               # rebuild that level and the ones above it (en-a1 …)
npm run content:validate && npm run content:trace -- en   # or: content:trace -- fr / nl (needs the reference files)
npm run audio:render                                # records only what changed
npm run content:lock                                # every exercise id still means the same exercise
npm run check:integrity                             # the learners' progress still matches the content
git add content && git commit -m "content: …"       # the version history
sudo systemctl reload anzo                          # loads the lessons without logging anyone out
```

Rebuild the levels above the one you changed too (for example `fr-a1 fr-a2` after a change in `fr-a1-1`): a typed fill-in
never asks for a word that has a twin with the same meaning in a lower level. A French word that the check reports as "not
in the French word list" can be added to `content/src/fr/wordlist-sources.yaml` (with its level and a reason), followed by
`npm run content:wordlist -- fr`.

Never change or reuse the `id` of a word, sentence, unit or lesson: progress is stored by id. Change the text and leave the
id. `content/ids.lock.json` records every id and what each exercise id stands for; `npm run content:lock` (and the unit
tests) fail when one disappears or changes meaning. New content is added to it with `npm run content:lock -- --reason
"<what and why>"`, which keeps the reason in the file. `npm run check:integrity` reports any stored progress that no longer
matches the content (and exits with an error), without changing anything.

**Adding a level**: put the pack file in `content/packs/<course>/` and its unit sources in `content/src/`, set that level's
`status` in `content/packs/manifest.json` to `"preview"` (check it in *Preview*) and then `"available"`, run `npm run
content:validate` (it prints units, lessons, exercises and words per pack, or the exact file and location of every problem)
and `sudo systemctl reload anzo`. The service refuses to start while any available pack is invalid, and says why in the log;
a reload with invalid lessons keeps the previous ones and reports the error on the System page.

### Audio

Every word and sentence in the lessons is recorded in advance with [Piper](https://github.com/rhasspy/piper), a speech
synthesizer that runs locally on the server. Nothing is synthesized while learners use the app: the service only sends MP3
files. The details: `docs/developer/audio.md`.

- **What gets recorded:** every English, French or Dutch word visible in a lesson, plus every vocabulary item and sentence at
  normal and slow speed (the turtle button).
- **How recordings are made:** a single word or short phrase is said after a short carrier sentence (*The word, …*) and cut
  out, so it sounds as it would in speech; a pronunciation list (`content/src/<language>/pronunciations.yaml`) fixes words
  the speech tools read wrongly (English loanwords in Dutch, French words read as English, the British "r" between two
  vowels); after the few English words ending in a vowel that the voice would join to the next vowel with an "r" (*sofa is*
  → "sofar is"), the recording has a short break of exactly 160 ms instead. Sentences are otherwise said as the voice says
  them. Each recording's randomness comes from a number derived from the recording itself, so making it again gives the same
  file. A change that would affect many recordings is first heard on a sample (*Before release* in the Listen check); a wrong
  pronunciation is fixed in the pronunciation list, never by picking another take.
- **Checking the recordings:** `npm run audio:check` listens to every recording with an offline speech recognizer (Vosk, on
  the server) and measures it: a recording much longer than its word (the voice running on into babble after *good*), extra
  or missing words, a long silence at the start, a clipped first sound, clipping. The first run of everything takes about 7
  hours (about a second per sentence); after that it only checks new recordings. *Admin → System* shows the result (*Audio
  check: N flagged*). `npm run audio:fix` then records the flagged ones again with adjusted settings (kept in
  `content/audio-overrides.json`) and lists what is left for a person to hear.
- **After changing lesson content:** `npm run audio:render`, then `sudo systemctl reload anzo` (corrections made in the
  browser do this by themselves). Only missing recordings are made; recordings nothing uses any more are removed. The command
  prints how many were recorded, reused and removed, and the total size. `npm run content:validate -- --audio` lists lessons
  with missing recordings.
- **Voices:** one voice per language, the same for every word and sentence of that language (French for English speakers
  uses the French recordings), named in `content/voices.json` with its speaking speed and a sample sentence: English
  `en_GB-cori-medium`, French `fr_FR-siwis-medium`, Dutch `nl_BE-rdh-medium` (a Belgian voice). Dialogues use a second voice
  of the other gender for the second speaker: English `en_GB-vctk-medium` (speaker p258), French `fr_FR-upmc-medium`
  (speaker *pierre*), Dutch `nl_BE-nathalie-medium` (Belgian). *Admin → Voices* (speaker icon on the admin page; *Beheer →
  Stemmen* in Dutch) shows both voices of each language with their licence and a sample to play; there is no voice choice in
  the app. To change a voice: edit `content/voices.json`, run `./scripts/fetch-models.sh` (it also removes voices that are no
  longer named), `npm run audio:render`, and restart the service.
- **Disk usage:** the six voices take about 390 MB in `models/piper/`, the Python tools about 130 MB in `tools/piper-venv/`,
  the recordings about 850 MB (about 50,000 clips) in `audio/`, the speech recognizers of the audio check about 150 MB in
  `models/vosk/` and their tools about 70 MB in `tools/vosk-venv/`. All of them can be recreated with the commands above and
  are not part of the repository.
- **Tap to hear:** learners tap a word to hear it, 🔊 for the whole sentence, 🐢 for the slow version. Tapping a speaker
  again starts the recording from the beginning, and a new recording always stops the one playing, however fast the taps
  come.

### Background jobs and permissions

The app itself never runs the speech tools, git, npm or `sudo`, and the jobs that do never write the database: work that
needs them runs as separate systemd units and reports back through small files in `/var/spool/anzo` (requests, results,
status). All of this is set up by `./scripts/install-ops.sh` (safe to run again; run it again after any change to
`deploy/`). How it works inside: `docs/developer/operations.md`.

| Unit | When | As | Does |
|---|---|---|---|
| `anzo-content-job.path` → `.service` | a correction or *Record again* arrives | developer account | applies them one at a time (see *Correcting a word or sentence*) |
| `anzo-backup.timer` | Sundays 03:30 | `anzo` | database backup |
| `anzo-full-backup.timer` | Sundays 04:00 | root | full archive |
| `anzo-integrity.timer` | every night 03:15 | `anzo` | `check:integrity` on a fresh copy of the database |
| `anzo-disk.timer` | hourly | developer account | free disk space |
| `anzo-watchdog.timer` | every 2 minutes | root | asks `/api/live`; two failures in a row → `systemctl restart anzo`; never more than 3 restarts an hour. A restart or reload made on purpose and a stopped app are left alone |
| `anzo-cleanup.timer` | Sundays 05:00 | root | removes temporary leftovers older than 2 days (a fixed list of known names), expired logins, and request/result files older than 90 days |

- `systemctl list-timers 'anzo*'` shows the next runs; `journalctl -u <unit>` the output of one.
- Who owns what: the code (`/opt/anzo`) belongs to the developer account (`ANZO_DEV_USER`, default `anzo-dev`) and is
  world-readable; `data/` is `anzo:anzo 750` (the database:
  `sudo -u anzo sqlite3 /opt/anzo/data/anzo.sqlite`); `.env` is `anzo-dev:anzo 640`. The group `anzo-ops` (`anzo` and
  the developer account) shares the spool and the logs. `/etc/sudoers.d/anzo-jobs` lets the developer account, without a password, run `systemctl reload anzo` and
  `systemctl restart anzo` as root, and `sqlite3` and `rm` on the temporary copies as `anzo` (so `npm run check:integrity` and the
  read-only database queries of `publish:check` work without full sudo). Everything else that needs root (`install-ops.sh`,
  `ops:restart-check`, `backup:db`, `backup:full`, restores) uses the developer account's ordinary sudo. A shell that was open before `install-ops.sh` added the developer account to `anzo-ops` does not have the
  group yet: read the spool with `sudo` there (or log in again).
- The service unit allows writes only to `/opt/anzo/data`, `/var/log/anzo` and `/var/spool/anzo` (`ProtectSystem=strict`).
  Port 3000 belongs to it; `npm run dev` uses 3001 and 5173, the browser tests 3999.
- `sudo systemctl reload anzo` loads changed lessons, the id lock and the recordings without a restart: logins and lessons in
  progress continue. If the new lessons are invalid, the app keeps the old ones and the System page says so.
- Logs in `/var/log/anzo`: `app.log` (the app), `jobs.log` (corrections, disk, cleanup), `watchdog.log`, `backup.log`,
  `full-backup.log`; all rotated weekly, 8 weeks kept.

### Backups and restore

The database (`data/anzo.sqlite`) holds all accounts and progress; the weekly full archive holds everything else needed to
rebuild Anzo on a new machine.

#### Database backups

- **Automatic:** every Sunday at 03:30 a systemd timer (`anzo-backup.timer`) copies the database while the app keeps
  running, checks the copy (`PRAGMA integrity_check`), compresses it to `/var/backups/anzo/db/anzo-YYYYmmdd-HHMMSS.sqlite.gz`
  and keeps the newest 15 (about four months). If the machine was off at that moment, the backup runs at the next start.
- **Now:** `npm run backup:db` — a backup made by hand is named `anzo-manual-…` and has its own 10, so it never pushes a
  weekly one out. Make one before any update that changes the database.
- **Check:** `systemctl list-timers anzo-backup.timer` (next run), `sudo ls -l /var/backups/anzo/db`, `sudo tail
  /var/log/anzo/backup.log` or `journalctl -u anzo-backup`. A failed backup exits with an error and says why in both logs.
- **Restore:** `sudo /opt/anzo/scripts/restore-db.sh /var/backups/anzo/db/anzo-….sqlite.gz`. It checks the backup first (a
  damaged file changes nothing), stops Anzo, keeps the current database next to it as `anzo.sqlite.before-restore-<time>`,
  puts the backup in place, starts Anzo and waits until it answers. To try a backup without touching the real app:
  `scripts/restore-db.sh <file> --data-dir /tmp/some-copy`.

#### Full archive

Every Sunday at 04:00 (after the database backup) `anzo-full-backup.timer` writes
`/var/backups/anzo/full/anzo-full-YYYYmmdd-HHMMSS.tar` (about 1.4 GB): a git bundle of the repository with its whole history,
`.env`, the newest database backup, the reference files (`content/reference/`), the local documents git ignores (when
present: the installation's notes and working papers, `scripts/ops/archive-lib.js` lists them), the voices (`models/`) and
every recording (`audio/`), with a `RESTORE.txt` and a `MANIFEST.json` (sizes, checksums, commit). The speech recognizers of
the audio check are left out and downloaded again by `./scripts/fetch-models.sh`. The newest 3 are kept while together they
take at most a quarter of the disk and 4 GB stays free once the older ones are deleted, else 2, never fewer than 1 — the log
and the *Backups* tile say how many and why; the budget follows the disk's size (a container's disk quota counts). Before
writing, it checks that the archive fits with 1 GB to spare (deleting older archives first if needed, never the newest); if
it cannot, it writes nothing and the *Backups* tile turns red with the reason. `npm run backup:full` makes one now.

The archive holds the configuration and the learners' data: keep it private. **Both kinds of backup live on the same
machine**: if the machine is lost, they are lost with it. Copy the newest archive to another machine now and then, or back up
the whole machine or container (for example a Proxmox `vzdump`).

### Rebuilding Anzo on a new server

There are two ways back after the server is lost: from a full archive (the normal way: everything comes back exactly as it
was, the recordings included), or — only if no archive survives — from the code alone.

#### Path A (normal): restore from a full archive

Nothing is rendered again: the recordings come back byte for byte.

1. Create a Debian 12 machine or container (2+ CPU cores, 2+ GB memory — 4 GB to render recordings later —, 15 GB disk) with
   the developer account with `sudo` (`anzo-dev`, or the name in the archived `.env`'s `ANZO_DEV_USER`), on the same address (or update the DHCP reservation and the proxy).
2. Copy the newest `anzo-full-….tar` to it, for example into that account's home.
3. As that account: `tar -xf anzo-full-….tar anzo.bundle && git clone -q anzo.bundle anzo-src` (install git first if needed:
   `sudo apt-get update && sudo apt-get install -y git`).
4. `anzo-src/scripts/restore-full.sh anzo-full-….tar` — installs the system packages and Node.js, puts the repository in
   `/opt/anzo`, restores `.env`, the database, the voices, the recordings, the reference files and the local documents,
   installs and builds, sets up the service, the background jobs and their timers, starts Anzo and waits until `/api/health`
   answers 200.
5. `./scripts/fetch-models.sh` — only to bring back the speech recognizers of the audio check (`models/vosk`, left out of the
   archive); the app does not need them.
6. Open the app, log in as admin, and check that *Admin → System* is green.

To try an archive without touching anything: `scripts/restore-full.sh <archive> --target /tmp/anzo-restore-test --port 3997
--no-systemd` (it runs the app as the current user on port 3997; stop it with `kill "$(cat /tmp/anzo-restore-test/anzo.pid)"`
and delete the folder afterwards).

#### Path B (worst case): no archive, only the code

With only the repository (a git remote, or a copy of `/opt/anzo` without `audio/` and `data/`), the app can be rebuilt, but
the accounts and progress are gone unless a database backup survives somewhere (`restore-db.sh` brings it back), and every
recording has to be made again — or downloaded.

1. Install as in *Install from scratch* (`install-system.sh`, `npm run install:all`, `./scripts/fetch-models.sh`, `.env`).
2. The recordings: unzip the recordings archive of the matching release (README, *Getting started*) — the published
   recordings, byte for byte — or render them: `nice -n 10 ionice -c3 npm run audio:render -- --workers 2`, about 50,000
   clips, **about 7 hours** with 2 workers on 4 CPU cores (nothing else heavy beside it on a 4 GB machine).
3. After rendering, check them: `npm run audio:check` (the first time about 7 hours), then `npm run audio:fix --
   --keep-orphans --workers 2` for whatever it flags, and `npm run audio:check` again.
4. Listen to a sample before learners use it again (*Admin → Listen check*: the clips heard most are single words, then
   sentences).

**What a re-render from the repository gives.** The same method: the same voices and speeds, the carrier sentence for words
and short phrases, the pronunciation lexicon, and every per-clip choice recorded in `content/audio-overrides.json` (the
takes that were chosen, the carriers, the cuts). Clips with a seed for Piper's randomness (in `audio/manifest.json`) get it
from the clip itself, so **those clips come out identical** — on the same kind of processor; a different CPU can change the
samples very slightly (they sound the same). Older recordings were made without a seed, and the clips chosen by ear over a
new rendering (`pins` in `content/audio-overrides.json`) cannot be recreated at all: a pin names a file that no longer
exists, so the render stops with "pinned clip is missing" — remove those pins first (they then take today's method). Those
clips come out as **new takes**: mostly as good, but each one is a new roll of the dice. The systematic problems (babble
after a single word, the intrusive r, wrong pronunciations) are fixed by the method and the lexicon and stay fixed; what can
come back is the occasional bad take — in listening rounds about 1 in 100 words and a few in 100 sentences — which
`audio:check` catches in part and a listening round catches the rest. A bad clip found later is fixed in the browser:
*Record again*.

### Version history (git)

The folder `/opt/anzo` is a git repository: it records every change to the app and the lessons, including every correction
made in the browser (as `content: admin correction #N — …`, with the admin's name). It is the undo history: *Undo* in *Admin
→ Corrections* reverses what a correction's commit changed in the lesson sources (and rebuilds the lessons from them), and
`git log` lists every change.

**Deliberately not in it** (`.gitignore`): `.env` (the session secret), `data/` (the database: the accounts and progress),
`config/seed.local.json` (the installation's accounts and first passwords), `audio/` (recordings, made from the lessons),
`models/` and `tools/*-venv/` (voices and speech tools, downloaded), `content/reference/` (the reference PDFs and their
extracted text, copyright of their publishers), `node_modules/`, the client build and test output. The full archive covers
what git does not.

**A copy on a git host, push-only.** The server can send its history to a remote repository (GitHub, Gitea, Forgejo …) but
never take anything back from it: the remote is set up so that `git push` works and `git fetch` / `git pull` fail. A hacked
account at the hosting provider can then never change the server; a contribution there is looked at in a separate scratch
copy and, if accepted, made here as the server's own commit (`CONTRIBUTING.md`). The setup, as the developer account:

1. Create an **empty** repository there (no README, no licence), e.g. `anzo`.
2. Give the server a key of its own, a *deploy key* with write access for that one repository:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/anzo_deploy -N "" -C "anzo deploy key"
   cat ~/.ssh/anzo_deploy.pub          # paste this as a deploy key (tick "Allow write access") in the repository settings
   cat >> ~/.ssh/config <<'CFG'
   Host anzo-remote
     HostName github.com               # or your Gitea/Forgejo host
     User git
     IdentityFile ~/.ssh/anzo_deploy
     IdentitiesOnly yes
   CFG
   ```

3. Connect it push-only, with the check that runs before every push:

   ```bash
   cd /opt/anzo
   git remote add origin PUSH-ONLY--fetching-is-disabled
   git remote set-url --push origin git@anzo-remote:<your-account>/anzo.git
   git config core.hooksPath scripts/git-hooks     # pre-push: publish:check -- --public --history must say ready
   git push -u origin main
   ```

To send new commits later: `cd /opt/anzo && git push` (and `git push origin <tag>` for a new version tag).

**Automatic push after each correction:** add `ANZO_GIT_AUTO_PUSH=1` to `/opt/anzo/.env` (edit it in place). The content job
then pushes after every applied correction; a failed push (also one the pre-push check refused) is logged and shown on the
System page, and never holds up or undoes the correction. It is off by default.

**Before pushing anywhere:** `npm run publish:check -- --public --history` (the pre-push hook runs it too). It checks the
working tree and the history for secrets, files that are never published (reference PDFs, recordings, voices, databases,
`.env`, `config/seed.local.json`) and personal data: the installation's account names (from `config/seed.local.json`, the
live database and an optional gitignored `config/publish.local.json`), its domain, LAN addresses and e-mail addresses.
`--public` also fails on a real name in the lessons that `allow` in `config/publish.local.json` does not allow. A history that once held
personal data is best replaced by a fresh one before the first push (keep the old one as a `git bundle` on the server).

### Testing

```bash
npm test                  # unit tests: grading, content validator, XP/streak rules, API (≈ 13 min on 4 cores)
npm run test:e2e          # builds the client, starts a throwaway server on :3999 with an empty
                          # database, runs the browser tests (desktop + phone), cleans up
npm run content:validate  # content only
npm run content:trace -- en   # every English word is on the Cambridge word list at its level (needs the reference files)
npm run content:trace -- fr   # every French word is in the derived DELF Prim word list at its level
npm run content:lock      # every unit, lesson, word and exercise id is still there and means the same
npm run check:integrity   # read-only: stored progress still matches the content
npm run test:live         # read-only check of the real HTTPS address (see Phones and tablets)
npm run test:content-job  # the correction job end to end on a scratch copy of the repository (a few minutes; Piper renders)
npm run publish:check     # before publishing the repository: secrets, reference files, personal data
```

The browser tests run in desktop Chrome, a Pixel 7-sized phone and an iPhone-sized WebKit (the audio tests) and leave
phone-sized screenshots of every screen in `e2e/screenshots/`. They use the recorded audio, so the recordings must be in
`audio/` first. Never point a test at the live database. For development, `npm run dev` runs the API on port 3001 (with its
own `data-dev/` database) and the Vite dev server on port 5173. More: `docs/developer/testing.md`.

### Where things live

| What | Where |
|---|---|
| Code | `/opt/anzo` (owned by the developer account, `ANZO_DEV_USER`) |
| Database (SQLite, WAL) | `/opt/anzo/data/anzo.sqlite` (owned by `anzo`) |
| Lesson audio | `/opt/anzo/audio/<language>/…` (+ `manifest.json`), served at `/audio/…` |
| Speech voices | `/opt/anzo/models/piper/` (list with licences: `models/manifest.json`) |
| Speech tools | `/opt/anzo/tools/piper-venv/` (versions: `tools/requirements.txt`) |
| Configuration | `/opt/anzo/.env`, `/opt/anzo/config/seed.local.json` |
| Logs | `/var/log/anzo/`: `app.log`, `jobs.log`, `watchdog.log`, `backup.log`, `full-backup.log` (JSON or text lines; rotated weekly, 8 weeks kept) |
| Database backups | `/var/backups/anzo/db/` (owned by `anzo`; newest 15 weekly, newest 10 manual) |
| Full archives | `/var/backups/anzo/full/anzo-full-YYYYmmdd-HHMMSS.tar` (owned by root, readable by `anzo`; newest 3 kept within the disk budget) |
| Job requests, results, status | `/var/spool/anzo/` (group `anzo-ops`; `sudo ls /var/spool/anzo/status`) |
| Service | `systemctl status anzo`, `sudo systemctl reload anzo` (lessons), `sudo systemctl restart anzo`, `sudo journalctl -u anzo` |
| Background jobs | `systemctl list-timers 'anzo*'`, `systemctl list-units 'anzo*'` |

### Licences

Every third-party source, voice and tool with its licence and attribution: [`THIRD_PARTY.md`](../THIRD_PARTY.md).

- **The code** is MIT licensed — see `LICENSE`.
- **The lessons** (everything in `content/`) are CC BY-NC-SA 4.0 — see `content/LICENSE`; the levels of the Dutch words are
  derived from NT2Lex (CC BY-NC-SA 4.0), whose attribution is in `THIRD_PARTY.md`.
- **One runtime library is GPL-3.0-only:** `better-sqlite3-session-store` (the login sessions), installed by npm and not part
  of the repository; `THIRD_PARTY.md` says why it stays.
- **Piper** (GPL-3.0) is used as an external tool to produce the recordings. It runs only when audio is rendered, is
  installed separately by `scripts/fetch-models.sh`, and is not part of or distributed with Anzo.
- **Voices** each have their own licence, recorded exactly as the voice publisher states it in `models/manifest.json` (from
  each voice's model card). The main voices are public domain (English, `en_GB-cori-medium`), CC BY 4.0 (French,
  `fr_FR-siwis-medium`) and CC0 (Dutch, `nl_BE-rdh-medium`); the dialogue voices CC BY 4.0 (`en_GB-vctk-medium`, the VCTK
  corpus), CC BY-SA 4.0 (`fr_FR-upmc-medium`, the UPMC Pierre recordings: recordings made with it are shared under the same
  licence, with attribution) and CC0 (`nl_BE-nathalie-medium`).
- **Speech recognizers** for the audio check (Vosk small models, Apache 2.0) are listed in `models/manifest.json` too; they
  run only on the server while checking recordings.
- **Recordings** made from the voices are generated on the server and are not in the repository; the published recordings
  archive (the repository's Releases) carries the voices' licences — the French dialogue recordings (*upmc pierre*) are CC
  BY-SA 4.0.
- **Reference documents** are not part of this repository and remain the property of their publishers.
