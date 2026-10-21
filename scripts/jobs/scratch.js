// A scratch copy of the repository for testing the content job without touching /opt/anzo:
// a clone that shares git objects, with the current working tree (uncommitted changes and new files) committed on top,
// symlinks to the heavy untracked tools (node_modules, Piper venv, voices, the derived word lists), hard links to the
// audio clips (the manifest is a real copy: it is rewritten in place) and an empty spool.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SPOOL_DIRS } from '../../server/src/ops/spool.js';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024, ...opts });

export function makeScratchRepo(base, { realRoot, withAudio = true } = {}) {
  fs.mkdirSync(base, { recursive: true });
  const root = path.join(base, 'repo');
  sh('git', ['clone', '-q', '--shared', realRoot, root]);
  // The working tree as it is now (so uncommitted work is what gets tested).
  const patch = sh('git', ['-C', realRoot, 'diff', 'HEAD', '--binary']);
  if (patch.trim()) sh('git', ['-C', root, 'apply', '--whitespace=nowarn'], { input: patch });
  const untracked = sh('git', ['-C', realRoot, 'ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const f of untracked) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.copyFileSync(path.join(realRoot, f), path.join(root, f));
  }
  sh('git', ['-C', root, 'add', '-A']);
  sh('git', ['-C', root, '-c', 'user.name=scratch', '-c', 'user.email=scratch@anzo.invalid', 'commit', '-q', '--allow-empty', '-m', 'scratch: working tree']);
  sh('git', ['-C', root, 'config', 'user.name', 'scratch']);
  sh('git', ['-C', root, 'config', 'user.email', 'scratch@anzo.invalid']);
  const links = ['node_modules', 'server/node_modules', 'client/node_modules', 'tools/piper-venv', 'models/piper', 'content/reference/extracted'];
  // A symlink is a file to git: "dir/" ignore patterns do not cover it.
  fs.appendFileSync(path.join(root, '.git/info/exclude'), links.map((l) => `/${l}\n`).join(''));
  for (const link of links) {
    if (fs.existsSync(path.join(realRoot, link))) {
      fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
      fs.symlinkSync(path.join(realRoot, link), path.join(root, link));
    }
  }
  const audioDir = path.join(base, 'audio');
  if (withAudio && fs.existsSync(path.join(realRoot, 'audio'))) {
    sh('cp', ['-al', path.join(realRoot, 'audio'), audioDir]);
    fs.rmSync(path.join(audioDir, 'manifest.json'), { force: true });
    fs.copyFileSync(path.join(realRoot, 'audio/manifest.json'), path.join(audioDir, 'manifest.json'));
  } else fs.mkdirSync(audioDir, { recursive: true });
  const spoolDir = path.join(base, 'spool');
  for (const d of SPOOL_DIRS) fs.mkdirSync(path.join(spoolDir, d), { recursive: true });
  return { root, audioDir, spoolDir };
}
