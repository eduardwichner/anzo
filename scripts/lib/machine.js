// The machine the heavy jobs run on (at most two heavy jobs at once): CPUs and memory, so defaults scale with the machine — 12 vCPU / 8 GB
// while developing, 4 vCPU / 4 GB in normal use. ANZO_MACHINE_CPUS and ANZO_MACHINE_MEM_GB pretend another size
// (to try the small defaults on a big machine; together with `taskset -c 0-3`).
import os from 'node:os';

export function machine(env = process.env) {
  const cpus = Number(env.ANZO_MACHINE_CPUS) || os.availableParallelism?.() || os.cpus().length;
  const memGB = Number(env.ANZO_MACHINE_MEM_GB) || os.totalmem() / 1024 ** 3;
  return { cpus, memGB, small: cpus <= 4 || memGB <= 4.5 };
}

/**
 * How many workers of `perWorkerGB` fit: at most `max`, at most one CPU less than the machine has, and leaving `reserveGB`
 * for the service, the developer's tools and the editor (≈ 1.5–2 GB together). Never fewer than 1.
 */
export function workersFor({ max, perWorkerGB, reserveGB = 2 }, m = machine()) {
  return Math.max(1, Math.min(max, m.cpus - 1, Math.floor((m.memGB - reserveGB) / perWorkerGB)));
}
