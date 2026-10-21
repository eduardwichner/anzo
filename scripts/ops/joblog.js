// JSON-lines logger for the background jobs: /var/log/anzo/<file> (jobs.log by default) and stdout (the journal).
// Lines look like the service's pino lines ({ level (number), time, source, msg, … }) so Admin → System merges them.
import fs from 'node:fs';

const LEVELS = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

export function jobLogger(source, file = process.env.ANZO_JOB_LOG || '/var/log/anzo/jobs.log') {
  return (entry) => {
    const { level = 'info', ...rest } = entry;
    const line = JSON.stringify({ level: LEVELS[level] ?? 30, time: Date.now(), source, ...rest });
    console.log(line);
    try {
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      /* not writable (a test, a shell without the anzo-ops group): stdout only */
    }
  };
}
