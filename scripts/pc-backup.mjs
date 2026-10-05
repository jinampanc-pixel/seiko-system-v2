import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diskBackup } from './business-backup.mjs';
import { copyBackupToDrive } from './drive-backup.mjs';
import { publishBackupStatus } from './backup-status.mjs';

export async function pcBackup(config, { exportCopy = diskBackup, driveCopy = copyBackupToDrive, publish = publishBackupStatus, now = new Date(), force = false } = {}) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const statusFile = path.join(config.directory, 'pc-status.json'); let status = {};
  try { status = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch { /* First run or an interrupted status write: retry export. */ }
  const write = () => { fs.writeFileSync(`${statusFile}.partial`, JSON.stringify(status, null, 2), { mode: 0o600 }); fs.renameSync(`${statusFile}.partial`, statusFile); };
  const reportToApp = async () => {
    if (!config.reportToApp || status.localState !== 'verified') return;
    try { await publish(config, status.localVerified); status.appReportState = 'reported'; }
    catch { status.appReportState = 'failed'; }
    write();
  };
  if (force || status.day !== day || status.localState !== 'verified' || !status.localVerified || !fs.existsSync(path.join(config.directory, status.localVerified.file))) {
    try {
      const report = await exportCopy(config); status = { day, localVerified: report, localState: 'verified', cloudState: config.googleDrive ? 'pending' : 'not-configured' }; write();
    } catch {
      status.localState = 'failed'; status.lastFailureAt = now.toISOString(); write();
      throw new Error('PC export failed. Previous backups remain safe; the Windows job will retry.');
    }
  }
  // A Drive outage never invalidates a verified local export, and retries reuse that dated archive.
  if (config.googleDrive && status.cloudState !== 'verified') {
    try { status.localVerified = await driveCopy(config, status.localVerified); status.cloudState = 'verified'; write(); }
    catch { status.cloudState = 'failed'; status.lastFailureAt = now.toISOString(); write(); await reportToApp(); throw new Error('PC backup verified; Drive copy failed and will retry independently.'); }
  }
  await reportToApp();
  return { localState: status.localState, cloudState: status.cloudState, appReportState: status.appReportState || 'not-configured', file: status.localVerified.file };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await pcBackup(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), { force: process.argv.includes('--force') }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
