import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diskBackup } from './business-backup.mjs';
import { copyBackupToDrive } from './drive-backup.mjs';

const required = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'BACKUP_RECOVERY_KEY', 'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID'];
try {
  if (required.some(name => !process.env[name])) throw new Error('Cloud backup is not configured: supply dedicated D1 and Jinam Drive credentials first.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jinam-cloud-backup-'));
  const relative = path.relative(os.tmpdir(), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe cloud backup workspace.');
  try {
    const keyFile = path.join(directory, 'recovery.key');
    const credentialsFile = path.join(directory, 'drive.json');
    fs.writeFileSync(keyFile, process.env.BACKUP_RECOVERY_KEY, { mode: 0o600 });
    fs.writeFileSync(credentialsFile, JSON.stringify({ clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN }), { mode: 0o600 });
    const config = { directory, keyFile, googleDrive: { credentialsFile, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID } };
    const report = await diskBackup(config);
    await copyBackupToDrive(config, report);
    // Public CI logs contain only verification metadata; never publish SQL, credentials or record bodies.
    console.log(JSON.stringify({ state: 'verified', tables: report.tables, records: report.records, numberingCountersIncluded: report.numberingCountersIncluded, encryptedSHA256: report.encryptedSHA256 }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
} catch { console.error('Cloud backup failed. Check configuration, authorization and provider availability in the private setup. Existing Drive archives remain unchanged.'); process.exitCode = 1; }
