// A pack from its unit sources: content/src/<target>/<level>/ → generatePack → for a variant course (fr-en,
// French for English speakers) the ids of its own prefix. Used by npm run content:generate, content:status and the tests.
import { generatePack } from './generator.js';
import { generatorOptions, LEVEL_ORDER, packSourceDir, readPackSources, SRC_DIR } from './sources.js';

/**
 * The generated pack with a variant course's ids: every id of the target's sources (fr.bonjour, fr-a1-1-u01-l01-e01) under
 * the variant's prefix (fe.bonjour, fe-a1-1-u01-l01-e01), `track` the variant's track id. Ids are recognised by their form
 * (a "<target>." item id or a "<target>-<level>" id); target-language text never has that form.
 */
export function withPrefix(pack, target, variant) {
  const levels = (LEVEL_ORDER[target] ?? []).map((l) => l.replace(/-/g, '\\-')).join('|');
  const item = new RegExp(`^${target}\\.(?=[a-z0-9])`);
  const unit = new RegExp(`^${target}-(?=(?:${levels})(?:-|$))`);
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (typeof x === 'string') return x.replace(item, `${variant.prefix}.`).replace(unit, `${variant.prefix}-`);
    if (!x || typeof x !== 'object') return x;
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
  };
  return { ...walk(pack), track: variant.track };
}

/**
 * { pack, skipped }: the pack `packId` generated from its sources — null for a variant course none of whose units has its
 * native meanings yet (the course then shows as Coming soon) — and the source units left out for lack of them.
 */
export function buildPack(packId, srcDir = SRC_DIR) {
  const { target, variant } = packSourceDir(packId, srcDir);
  const { meta, units, skipped } = readPackSources(packId, srcDir);
  if (meta.id !== packId) throw new Error(`pack.yaml id "${meta.id}" ≠ ${packId}`);
  if (!units.length) return { pack: null, skipped };
  const pack = generatePack({ track: target, ...meta }, units, generatorOptions(packId, srcDir));
  return { pack: variant ? withPrefix(pack, target, variant) : pack, skipped };
}
