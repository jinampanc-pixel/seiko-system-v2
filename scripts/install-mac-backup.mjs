import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const label = 'com.jinam.daily-backup';
const root = fileURLToPath(new URL('../', import.meta.url));
const xml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

export function macBackupPlist({ node, config, repository, directory }) {
  for (const value of [node, config, repository, directory]) {
    if (!path.posix.isAbsolute(value) || Array.from(value).some(character => character.charCodeAt(0) < 32)) throw new Error('Use absolute Mac paths without control characters.');
  }
  const args = [node, path.posix.join(repository, 'scripts/pc-backup.mjs'), config];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(value => `<string>${xml(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(repository)}</string>
<key>RunAtLoad</key><true/>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
<key>StartInterval</key><integer>1800</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(path.posix.join(directory, 'mac-job.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.posix.join(directory, 'mac-job-error.log'))}</string>
<key>EnvironmentVariables</key><dict><key>UV_THREADPOOL_SIZE</key><string>1</string><key>NODE_OPTIONS</key><string>--max-old-space-size=768</string></dict>
</dict></plist>\n`;
}

export function installMacBackup(configPath, { platform = process.platform, node = process.execPath, home = os.homedir(), uid = process.getuid?.(), run = spawnSync } = {}) {
  if (platform !== 'darwin') throw new Error('Run this installer once on the Mac that will keep its own backup.');
  const config = fs.realpathSync(configPath);
  const settings = JSON.parse(fs.readFileSync(config, 'utf8'));
  const directory = fs.realpathSync(settings.directory);
  const key = fs.realpathSync(settings.keyFile);
  if (fs.readFileSync(key, 'utf8').trim().length < 16) throw new Error('The existing recovery key is missing or invalid.');
  fs.chmodSync(config, 0o600); fs.chmodSync(key, 0o600);
  const agents = path.join(home, 'Library/LaunchAgents'); fs.mkdirSync(agents, { recursive: true });
  const target = path.join(agents, `${label}.plist`);
  const contents = macBackupPlist({ node, config, repository: root, directory });
  const temporary = `${target}.partial`;
  fs.writeFileSync(temporary, contents, { mode: 0o600 });
  const checked = run('/usr/bin/plutil', ['-lint', temporary], { stdio: 'pipe' });
  if (checked.status !== 0) { fs.unlinkSync(temporary); throw new Error('Mac schedule validation failed; the existing schedule was not replaced.'); }
  // Verify the first real backup before registering a background job.
  const first = run(node, [path.join(root, 'scripts/pc-backup.mjs'), config], { cwd: root, stdio: 'inherit', env: { ...process.env, UV_THREADPOOL_SIZE: '1', NODE_OPTIONS: '--max-old-space-size=768' } });
  if (first.status !== 0) { fs.unlinkSync(temporary); throw new Error('First backup failed. Earlier copies are retained; automatic scheduling was not enabled.'); }
  fs.renameSync(temporary, target);
  run('/bin/launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'pipe' });
  const installed = run('/bin/launchctl', ['bootstrap', `gui/${uid}`, target], { stdio: 'pipe' });
  if (installed.status !== 0) throw new Error('Backup verified, but macOS refused schedule registration.');
  const verified = run('/bin/launchctl', ['print', `gui/${uid}/${label}`], { stdio: 'pipe' });
  if (verified.status !== 0) throw new Error('macOS schedule registration could not be verified.');
  return { state: 'installed', cloudUploadConfigured: !!settings.googleDrive };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(installMacBackup(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
