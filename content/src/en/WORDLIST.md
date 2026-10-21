# English word list (YLE + B1 Preliminary + derived B2)

The English course traces every vocabulary target and every sentence word to `content/reference/extracted/wordlist-en.json`
(gitignored: derived from copyrighted Cambridge documents), built by `npm run content:wordlist`
(`scripts/content/wordlist-en.js`) and checked by `npm run content:trace -- en [--coverage]`.

| Level | Source | Entries |
|---|---|---|
| S, M, F (Pre-A1 Starters, A1 Movers, A2 Flyers) | the Cambridge YLE combined word list (149681-yle-flyers-word-list.pdf), number notes, handbook names | `PLAN.md` |
| B1 | the B1 Preliminary and Preliminary for Schools Vocabulary List, August 2025 (506887), headwords with their forms; names of the B1 texts (`wordlist-b1-names.yaml`) | about 3,100 headwords |
| **B2** | **derived** (Cambridge publishes no B2 list): the groups of `content/src/en/wordlist-b2-sources.yaml` on top of YLE + B1 | 560 words in 20 groups |

## B2: how the derived list is made

The B2 First for Schools handbook (2026) has no vocabulary list and no language specification: it assesses *range* on its
scales and says the lower levels' specifications apply. So, as for French, the B2 list is derived:

1. **Base:** everything on the YLE and B1 lists counts as known; a B2 group may not list such a word (the builder reports
   it), except a `newSense` (same spelling, another word: *make up* "to be friends again" against the B1 noun *make-up*).
2. **Attested:** a word that occurs in the B2 First for Schools sample paper 1 (Reading and Use of English, Listening,
   Writing, the answer keys with the listening script, Speaking) is marked `attested` automatically, with the paper as its
   ref — 64 of the 560 (e.g. *scholarship, by chance, cope, confidence, lifelong, attendance, shift, flexibility, slope,
   slippery, landmark, opponent, socialise, loneliness, device, ingenious, theory, persuasive, as a result*).
3. **Topic:** the other words are topic words of the unit's theme, each group with a `why`: the handbook's task and topic
   (writing Part 2 "health and fitness, sport, music and so on"; essay, article, email, review and story tasks; the
   speaking topics), the sample paper's text that models the unit, and parity with the Dutch and French B2 units of the same
   topic. A topic word must be a common, useful word of B2 range — rare or specialist words are glossed in the text instead.
4. **Names** of the B2 texts are in the file's `names:` list (level B2, never vocabulary).

Coverage: every B2 word is taught in exactly one en-b2 unit (`content:trace -- en --coverage`: 560 of 560).
