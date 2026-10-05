import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decryptBackup } from '../app/lib/backup-format.mjs';
import { restoreDrill } from './business-backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function publishBackupStatus(config, report, run = spawnSync) {
  if (!/^seiko-[\dTZ.-]+\.seiko-backup$/.test(report.file || '')) throw new Error('Invalid backup filename.');
  const bytes = fs.readFileSync(path.join(config.directory, report.file));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const backup = await decryptBackup(JSON.parse(bytes), fs.readFileSync(config.keyFile, 'utf8').trim());
  const drill = restoreDrill(backup, ':memory:');
  if (drill.checksum !== report.checksum || drill.records !== report.records || report.integrity !== 'ok' || !Number.isFinite(Date.parse(report.verifiedAt))) throw new Error('Backup receipt does not match verified bytes.');
  const copies = [{ location: 'pc', verifiedAt: report.verifiedAt }];
  if (report.driveCopy === 'remote-byte-verified') {
    if (report.encryptedSHA256 !== hash || !/^[A-Za-z0-9_-]+$/.test(report.driveFileId || report.cloudFileId || '') || !Number.isFinite(Date.parse(report.cloudVerifiedAt))) throw new Error('Drive receipt is incomplete.');
    copies.push({ location: 'drive', verifiedAt: report.cloudVerifiedAt });
  }
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const statements = copies.map(copy => {
    const details = { ...copy, file: report.file, encryptedBytes: bytes.length, encryptedSHA256: hash, records: drill.records, numberingCountersIncluded: drill.numberingCountersIncluded };
    return `INSERT OR IGNORE INTO erp_backup_operations(id,operation,actor_email,at,checksum,details_json,status) VALUES(${[`${copy.location}:${hash}`, `${copy.location}-copy-verified`, 'backup-runner', copy.verifiedAt, report.checksum, JSON.stringify(details), 'verified'].map(quote).join(',')});`;
  });
  const result = run(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote', '--config', path.join(root, 'wrangler.jsonc'), '--command', statements.join('\n')], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: 'true', ...(config.xdgConfigHome ? { XDG_CONFIG_HOME: config.xdgConfigHome } : {}) } });
  if (result.status !== 0) throw new Error('Backup copies remain safe, but status reporting failed. Retry publication.');
  return { reported: copies.map(copy => copy.location), checksum: report.checksum };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const report = JSON.parse(fs.readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, '')); console.log(JSON.stringify(await publishBackupStatus(config, report))); }
  catch { console.error('Verified backup status publication failed. Existing encrypted copies remain unchanged.'); process.exitCode = 1; }
}
