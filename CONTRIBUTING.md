# Contributing to Anzo

Thank you for looking! Anzo is a personal project: one family's language app, shared **as it is, without warranty and
without support**. That shapes how contributions work.

- **No support is promised.** Issues are turned off. Questions may get no answer, and that is nobody's fault.
- **Ideas and contributions are welcome**: a new language or course, a new exercise kind, a fix, better lessons. They may
  take a long time to be looked at, or get no reply at all.
- **Before any large piece of work, send a short message first**: a Discussion on this repository if they are switched on,
  or through the LinkedIn link on the owner's GitHub profile. Say what you would like to do. Then nobody spends weeks on
  something that cannot be merged.
- **Licences:** contributions to `content/` (lessons, word lists, meanings, pronunciations) are made under
  **CC BY-NC-SA 4.0** (`content/LICENSE`); contributions to the code under **MIT** (`LICENSE`). By opening a pull request
  you agree to that.

## How a pull request is handled

The installation this repository is published from only ever **sends** to it: nothing from the repository is fetched,
merged or installed there directly, so a change on the hosting side can never reach the learners by itself. A pull request
therefore goes like this:

1. It is downloaded into a separate scratch copy, away from the running installation, without any credentials.
2. It is reviewed there — the rules below, privacy, no outside requests, both interface languages, the traceability of
  every word, stable ids, any new dependency looked at before it is installed — and the unit and browser test suites run in
  that copy (its own ports, never against live data).
3. If it is accepted, the change is made in the installation as a new commit that names you (`Co-authored-by:`), the full
  test suites run again, and the commit is pushed here.
4. The pull request is closed with a thank-you and a link to that commit.

## The rules

These make Anzo what it is; a change that breaks one cannot be taken.

1. **Nothing leaves the home network while it runs.** No AI or LLM call, no analytics or telemetry, no CDN, no web font
   from outside, no third-party embed, no request to any outside service. AI may be used offline, while authoring lessons;
   the running app holds no API keys.
2. **Privacy.** It is a kids' app: passwords are bcrypt-hashed, and no browser `SpeechRecognition` API (it streams audio to
   Apple or Google). Never include real names, passwords, addresses or recordings of anyone; the tests use the generic
   accounts of `config/seed.example.json`.
3. **Lessons are data.** Curriculum lives in `content/` (unit sources in `content/src/`, generated packs in
   `content/packs/`, validated by `content/schema/pack.schema.json`); adding a level means adding a pack, never touching the
   engine. Every word is traceable to the official reference list of its level (`docs/developer/content.md`); packs contain
   no UI text.
4. **Ids never change.** Units, lessons, items and exercises keep their ids forever — progress is stored by them;
   `content/ids.lock.json` and `npm run content:lock` enforce it.
5. **Every interface text exists in every interface language.** `client/src/i18n/nl.json` and `en.json` have identical
   keys, non-empty values and the same `{placeholders}`; no literal UI text in components (`t('section.key')`).
6. **The browser is strict.** CSP without `unsafe-inline` (no inline `<script>` or `<style>`), host-relative URLs only,
   icons as inline SVG components (`client/src/icons/`), colours only in `client/src/styles/tokens.css` (light and dark).
7. **Tested in a real browser.** `npm test` and `npm run test:e2e` pass; say in the pull request what you ran and what passed.
8. **The docs describe the current state only.** The README, `docs/operator-guide.md` and the developer docs are rewritten
   when something changes, as if it had always been so: no changelog language, no history, nothing about one installation.

## Developer docs

| Before you touch … | read |
|---|---|
| startup, reload, any source path, the request flow of a lesson | [`docs/developer/architecture.md`](docs/developer/architecture.md) |
| an API route, answer shapes, typed-answer grading | [`docs/developer/api.md`](docs/developer/api.md) |
| what the grader accepts as correct, per exercise type and language | [`docs/grading-rules.md`](docs/grading-rules.md) |
| packs, unit sources, the generator, the id lock, word lists and traces, texts, the reference files, reviews | [`docs/developer/content.md`](docs/developer/content.md) (+ [`content/README.md`](content/README.md)) |
| tables, migrations, XP / streak / strength, reset and delete, practice, goal, badges, courses | [`docs/developer/data-model.md`](docs/developer/data-model.md) |
| audio rendering, voices, the pronunciation lexicon, the audio check, the Listen check | [`docs/developer/audio.md`](docs/developer/audio.md) |
| systemd units, privileges, the spool, backups and archives, the content job, the System page | [`docs/developer/operations.md`](docs/developer/operations.md) |
| unit and browser tests | [`docs/developer/testing.md`](docs/developer/testing.md) |
| planned extensions: another native language, a variant course, speaking, migrations | [`docs/developer/extending.md`](docs/developer/extending.md) |
| running an installation | [`docs/operator-guide.md`](docs/operator-guide.md) |

Forks are welcome under the licences above.
