// French packs are up to date with their sources (helper: packs-current.js).
import { describe, it } from 'vitest';
import { expectPackCurrent, packIdsOf } from './packs-current.js';
import { ms } from './slow.js';

describe('the fr packs are up to date with their sources (npm run content:generate -- --check)', () => {
  for (const id of packIdsOf('fr')) it(id, () => expectPackCurrent(id), ms(300_000));
});
