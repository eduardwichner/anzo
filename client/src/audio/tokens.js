// Mirror of server/src/audio/clips.js tokenKey(): a displayed word -> its key in pack.wordAudio.
// Keep the two in sync (the server test "tokenKey matches the client" guards this).
const EDGE_PUNCT = /^[\s.,!?;:"«»()…¿¡-]+|[\s.,!?;:"«»()…¿¡-]+$/gu;

export function tokenKey(word) {
  return String(word ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(EDGE_PUNCT, '');
}
