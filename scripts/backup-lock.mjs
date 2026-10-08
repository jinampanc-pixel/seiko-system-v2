import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
export async function withBackupLock(directory, action, { isAlive = alive } = {}) {
  const file = path.join(directory, '.export.lock');
  const recovery = `${file}.recovery`;
  const owner = JSON.stringify({ pid: process.pid, token: crypto.randomUUID() });
  const acquire = (recovering = false) => {
    if (!recovering && fs.existsSync(recovery)) throw new Error('Backup lock recovery is running; retry later.');
    fs.writeFileSync(file, owner, { flag: 'wx', mode: 0o600 });
    if (!recovering && fs.existsSync(recovery)) {
      if (fs.readFileSync(file, 'utf8') === owner) fs.unlinkSync(file);
      throw new Error('Backup lock recovery is running; retry later.');
    }
  };
  try { acquire(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Serialize stale-lock recovery too, so competing runners cannot steal a new lock.
    fs.writeFileSync(recovery, owner, { flag: 'wx', mode: 0o600 });
    try {
      let pid;
      try { pid = JSON.parse(fs.readFileSync(file, 'utf8')).pid; } catch { throw new Error('Backup lock requires review; no archive was changed.'); }
      if (!Number.isSafeInteger(pid) || pid < 1 || isAlive(pid)) throw new Error('Another backup export is already running.');
      fs.unlinkSync(file);
      acquire(true);
    } finally { if (fs.readFileSync(recovery, 'utf8') === owner) fs.unlinkSync(recovery); }
  }
  try { return await action(); }
  finally { if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === owner) fs.unlinkSync(file); }
}
