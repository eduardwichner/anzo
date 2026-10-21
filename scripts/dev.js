#!/usr/bin/env node
// npm run dev — API server with --watch on :3001 plus the Vite dev server on :5173 (proxying /api and /audio).
// Uses ./data-dev so it never touches the production database in ./data (owned by the service user).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.ANZO_DEV_API_PORT || '3001';

const children = [
  spawn(process.execPath, ['--watch', 'server/src/index.js'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: API_PORT,
      HOST: '127.0.0.1',
      ANZO_DATA_DIR: process.env.ANZO_DEV_DATA_DIR || path.join(root, 'data-dev'),
      LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
    },
  }),
  spawn('npx', ['vite', '--host', '0.0.0.0'], {
    cwd: path.join(root, 'client'),
    stdio: 'inherit',
    env: { ...process.env, ANZO_DEV_API: `http://127.0.0.1:${API_PORT}` },
  }),
];

const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { stop(); process.exitCode = code ?? 0; }));
