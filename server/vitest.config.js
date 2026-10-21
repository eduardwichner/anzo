// Unit tests (npm test): forked workers, at most 2 at once (vitest's default is one per vCPU minus one, so the memory peak
// would grow with the CPU count; 4 workers exhaust 4 GB beside the service and an editor); each worker loads the whole
// content.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { machine, workersFor } from '../scripts/lib/machine.js';

// The defaults follow the machine (scripts/lib/machine.js): 2 workers while ≥ 3.6 GB stay free of the 2 GB reserve
// (12 vCPU / 8 GB and 4 vCPU / 4 GB alike), and on a small machine (≤ 4 vCPU or ≤ 4.5 GB) twice the time per test and hook — the
// content loads in ≈ 10 s on an idle 12-vCPU machine, slower beside a second worker on 4.
const m = machine();
const slow = m.small ? 2 : 1;

export default defineConfig({
  test: {
    pool: 'forks',
    maxWorkers: workersFor({ max: 2, perWorkerGB: 0.8 }, m),
    testTimeout: 30_000 * slow,
    hookTimeout: 60_000 * slow,
    // the generic seed accounts (kid1, kid2, admin), whatever this machine's config/seed.local.json holds
    env: { ANZO_SEED_FILE: fileURLToPath(new URL('../config/seed.example.json', import.meta.url)) },
  },
});
