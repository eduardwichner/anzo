#!/usr/bin/env node
// anzo-disk.timer (hourly): free space on / → status/disk.json; amber below 2 GB and red below 1 GB are logged to
// jobs.log so they reach Admin → System's Problems list too (the Disk tile itself reads the disk live).
import fs from 'node:fs';
import { jobLogger } from './joblog.js';
import { writeStatus } from '../../server/src/ops/spool.js';
import { DISK_AMBER, DISK_RED } from '../../server/src/ops/system.js';

const s = fs.statfsSync('/');
const free = s.bavail * s.bsize;
const level = free < DISK_RED ? 'red' : free < DISK_AMBER ? 'amber' : 'green';
const gb = (n) => (n / 1024 ** 3).toFixed(1);
writeStatus(process.env.ANZO_SPOOL_DIR || '/var/spool/anzo', 'disk', { freeBytes: free, totalBytes: s.blocks * s.bsize, level });
const log = jobLogger('disk');
if (level !== 'green') log({ level: level === 'red' ? 'error' : 'warn', msg: `low disk space: ${gb(free)} GB free on /`, freeBytes: free });
else console.log(`disk ok: ${gb(free)} GB free of ${gb(s.blocks * s.bsize)} GB`);
