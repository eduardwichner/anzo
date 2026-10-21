// Every UI string exists in every locale (client/src/i18n/*.json), is non-empty and has the same {placeholders}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTRUCTION_KEYS, localesMissing, readLocales } from '../src/content/instructions.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/src/i18n');
const locales = readLocales(dir);

function flatten(node, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const flat = Object.fromEntries(Object.entries(locales).map(([lang, cat]) => [lang, flatten(cat)]));
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('locale files', () => {
  it('Dutch and English exist', () => {
    expect(Object.keys(locales).sort()).toEqual(['en', 'nl']);
  });

  it('have exactly the same keys', () => {
    const keys = Object.values(flat).map((f) => Object.keys(f).sort());
    for (const k of keys) expect(k).toEqual(keys[0]);
    expect(keys[0].length).toBeGreaterThan(150);
  });

  it('have no empty values and only strings as leaves', () => {
    for (const [lang, f] of Object.entries(flat)) {
      for (const [key, value] of Object.entries(f)) {
        expect(typeof value, `${lang}:${key}`).toBe('string');
        expect(value.trim(), `${lang}:${key}`).not.toBe('');
      }
    }
  });

  it('use the same {placeholders} for each key', () => {
    for (const key of Object.keys(flat.nl)) expect(placeholders(flat.en[key]), key).toEqual(placeholders(flat.nl[key]));
  });

  it('contain every default exercise instruction', () => {
    for (const key of DEFAULT_INSTRUCTION_KEYS) expect(localesMissing(locales, key), key).toEqual([]);
  });

  it('name the reset confirmation word per language', () => {
    expect(flat.nl['settings.resetWord']).toBe('WISSEN');
    expect(flat.en['settings.resetWord']).toBe('RESET');
  });
});

describe('language names (Admin → Levels never shows a raw key such as "languages.nl")', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(dir, '../../../content/packs/manifest.json'), 'utf8'));
  it('every manifest track has languages.<track> and its native language nativeLanguages.<native> in every locale', () => {
    for (const [lang, f] of Object.entries(flat)) {
      for (const track of manifest.tracks) {
        expect(f[`languages.${track.id}`], `${lang}: languages.${track.id}`).toBeTruthy();
        expect(f[`nativeLanguages.${track.native}`], `${lang}: nativeLanguages.${track.native}`).toBeTruthy();
      }
    }
  });
});
