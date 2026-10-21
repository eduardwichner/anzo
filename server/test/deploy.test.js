// deploy/ holds templates: scripts/ops/render-deploy.sh fills in the developer account (ANZO_DEV_USER, default anzo-dev),
// its group and home; scripts/install-ops.sh installs what it renders. No account name is written into the templates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anzo-deploy-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const me = os.userInfo();
const render = (env) => execFileSync('bash', [path.join(root, 'scripts/ops/render-deploy.sh'), path.join(tmp, 'out')],
  { encoding: 'utf8', env: { ...process.env, ...env } }).trim();

describe('deploy templates', () => {
  it('name no account: the developer account is a placeholder', () => {
    for (const f of fs.readdirSync(path.join(root, 'deploy'))) {
      const text = fs.readFileSync(path.join(root, 'deploy', f), 'utf8');
      expect(text, f).not.toMatch(/^(User|Group)=(?!anzo$|root$|@DEV_)/m);
      expect(text, f).not.toMatch(/\/home\/[a-z]/);
    }
    const sudoers = fs.readFileSync(path.join(root, 'deploy/anzo-jobs.sudoers'), 'utf8');
    expect(sudoers).toMatch(/^@DEV_USER@ ALL=\(root\) NOPASSWD: \/usr\/bin\/systemctl reload anzo, \/usr\/bin\/systemctl restart anzo$/m);
    // check:integrity runs `sudo -n -u anzo sqlite3 …` and `rm -f` on its copy as the developer account: one rule each
    const asAnzo = sudoers.match(/^@DEV_USER@ ALL=\(anzo\) NOPASSWD: (?:.*\\\n)*.*$/m)[0].replace(/\\\n\s*/g, '');
    for (const rule of [
      "/usr/bin/sqlite3 /opt/anzo/data/anzo.sqlite .backup '/tmp/anzo-integrity-*'",
      '/usr/bin/sqlite3 /tmp/anzo-integrity-* PRAGMA journal_mode\\=DELETE;',
      '/usr/bin/rm -f /tmp/anzo-integrity-*',
      '/usr/bin/sqlite3 -readonly *',
    ]) expect(asAnzo, rule).toContain(rule);
    expect(asAnzo).not.toMatch(/NOPASSWD: ALL|\(ALL\)/);
  });

  it('every `sudo -n` of the scripts is covered by the sudoers template', () => {
    const sudoers = fs.readFileSync(path.join(root, 'deploy/anzo-jobs.sudoers'), 'utf8');
    const files = [];
    const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((e) => {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.(js|sh)$/.test(e.name)) files.push(`${dir}/${e.name}`);
    });
    walk('scripts');
    walk('server/src');
    let found = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      // `sudo -n [-u anzo] <command>` in code: the shell-string form and the execFileSync('sudo', ['-n', …]) form
      for (const m of text.matchAll(/sudo['"]?,? ?\[?['"]?-n['"]?,? ?(?:['"]?-u['"]?,? ?['"]?anzo['"]?,? ?)?['"]?([a-z0-9]+)/g)) {
        found += 1;
        expect(sudoers, `${f}: sudo -n ${m[1]}`).toContain(`/usr/bin/${m[1]} `);
      }
    }
    expect(found).toBeGreaterThanOrEqual(5); // check-integrity (3), publish-check, listen, the content job's reload
  });

  it('render for ANZO_DEV_USER: every placeholder filled, the user, its group and its home', () => {
    expect(render({ ANZO_DEV_USER: me.username })).toBe(me.username);
    const out = path.join(tmp, 'out');
    expect(fs.readdirSync(out).sort()).toEqual(fs.readdirSync(path.join(root, 'deploy')).sort());
    for (const f of fs.readdirSync(out)) expect(fs.readFileSync(path.join(out, f), 'utf8'), f).not.toContain('@DEV_');
    const job = fs.readFileSync(path.join(out, 'anzo-content-job.service'), 'utf8');
    const group = execFileSync('id', ['-gn', me.username], { encoding: 'utf8' }).trim();
    expect(job).toContain(`User=${me.username}\nGroup=${group}\n`);
    expect(job).toContain(`Environment=HOME=${me.homedir}`);
    expect(fs.readFileSync(path.join(out, 'anzo-jobs.sudoers'), 'utf8')).toMatch(new RegExp(`^${me.username} ALL=\\(root\\)`, 'm'));
  });

  it('an account that does not exist is refused', () => {
    expect(() => render({ ANZO_DEV_USER: 'no-such-account-x9' })).toThrow();
  });

  it('the account comes from the environment, else .env, else anzo-dev', () => {
    const lib = path.join(root, 'scripts/lib/dev-user.sh');
    const envFile = path.join(tmp, 'env');
    const ask = (env, file) => execFileSync('bash', ['-c', `source "${lib}"; anzo_dev_user "${file}"`], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }).trim();
    fs.writeFileSync(envFile, 'PORT=3000\nANZO_DEV_USER="builder"\n');
    expect(ask({ ANZO_DEV_USER: 'first' }, envFile)).toBe('first');
    expect(ask({}, envFile)).toBe('builder');
    expect(ask({}, path.join(tmp, 'missing'))).toBe('anzo-dev');
  });
});
