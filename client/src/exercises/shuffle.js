// Stable shuffle: the same seed always gives the same order, so a re-render never reshuffles.
export function seededShuffle(list, seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.codePointAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
