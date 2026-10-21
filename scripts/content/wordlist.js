#!/usr/bin/env node
// npm run content:wordlist [-- en|fr] — build a derived word list from the reference texts:
//   en (default): the Cambridge YLE list -> content/reference/extracted/wordlist-en.json (wordlist-en.js)
//   fr:           the DELF Prim papers + content/src/fr/wordlist-sources.yaml -> wordlist-fr.json (wordlist-fr.js)
//   nl:           content/src/nl/wordlist-sources.yaml + NT2Lex + Naar Nederland / CNaVT attestations -> wordlist-nl.json (wordlist-nl.js)
const track = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'en';
if (!['en', 'fr', 'nl'].includes(track)) {
  console.error(`usage: npm run content:wordlist -- en|fr|nl (not "${track}")`);
  process.exit(2);
}
process.argv = [process.argv[0], new URL(`./wordlist-${track}.js`, import.meta.url).pathname, ...process.argv.slice(2).filter((a) => a !== track)];
await import(`./wordlist-${track}.js`);
