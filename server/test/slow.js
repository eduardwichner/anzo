// A test's explicit timeout on this machine: twice as long on a small machine (≤ 4 vCPU or ≤ 4.5 GB), like the defaults in
// vitest.config.js.
import { machine } from '../../scripts/lib/machine.js';

const factor = machine().small ? 2 : 1;
export const ms = (n) => n * factor;
