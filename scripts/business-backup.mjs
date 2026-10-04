import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { TABLES, canonical, makeBackup, encryptBackup, decryptBackup, summarizeRestore } from '../app/lib/backup-format.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function readBusinessDatabase(db) {
  return Object.fromEntries(Object.keys(TABLES).map(table => [table, {
    columns: db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name),
    rows: db.prepare(`SELECT * FROM "${table}" ORDER BY ${TABLES[table].map(key => `"${key}"`).join(',')}`).all().map(row => ({ ...row })),
  }]));
}
export function restoreDrill(backup, destination) {
  if (destination !== ':memory:' && fs.existsSync(destination)) throw new Error('Restore drill requires a new target file.');
  if (!backup || canonical(Object.keys(backup.tables).sort()) !== canonical(Object.keys(TABLES).sort())) throw new Error('Restore table coverage does not match.');
  const migrations = fs.readdirSync(path.join(root, 'migrations')).sort();
  if (!Array.isArray(backup.schemaVersion) || !backup.schemaVersion.length || canonical(backup.schemaVersion) !== canonical(migrations.slice(0, backup.schemaVersion.length))) throw new Error('Unsupported backup migration version.');
  const db = new DatabaseSync(destination);
  try {
    for (const file of fs.readdirSync(path.join(root, 'migrations')).sort()) db.exec(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
    const summary = summarizeRestore(backup, readBusinessDatabase(db));
    if (!summary.canRestore) throw new Error('Restore target is not empty or backup has no business records.');
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all();
    db.exec('BEGIN IMMEDIATE');
    try {
      // Isolated drill only: suppress fresh mutation events while replaying original history.
      for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
      for (const [table, { columns, rows }] of Object.entries(backup.tables)) {
        const statement = db.prepare(`INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        for (const row of rows) statement.run(...columns.map(column => row[column]));
      }
      for (const trigger of triggers) db.exec(trigger.sql);
      const restored = readBusinessDatabase(db);
      for (const table of Object.keys(TABLES)) if (canonical(restored[table]) !== canonical(backup.tables[table])) throw new Error(`Restore verification failed for ${table}.`);
      if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Restored database integrity check failed.');
      db.exec('COMMIT');
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
    return { verifiedAt: new Date().toISOString(), checksum: backup.checksum, tables: Object.keys(TABLES).length, records: summary.new, integrity: 'ok' };
  } finally { db.close(); }
}
export async function diskBackup(config, run = spawnSync) {
  if (!path.isAbsolute(config.directory) || !path.isAbsolute(config.keyFile)) throw new Error('Use absolute private backup and key paths.');
  if (!fs.existsSync(config.directory)) throw new Error('Backup destination is unavailable; nothing was exported.');
  const passphrase = fs.readFileSync(config.keyFile, 'utf8').trim();
  if (passphrase.length < 16) throw new Error('Backup key is invalid.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'seiko-private-export-'));
  const relative = path.relative(os.tmpdir(), temporary);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe temporary cleanup path.');
  let db;
  try {
    const raw = path.join(temporary, 'source.sql');
    const result = run(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'export', 'DB', '--remote', '--config', path.join(root, 'wrangler.jsonc'), '--output', raw], { cwd: root, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: 'true', ...(config.xdgConfigHome ? { XDG_CONFIG_HOME: config.xdgConfigHome } : {}) } });
    if (result.status !== 0) throw new Error('Cloudflare export failed. Refresh the authorized login and retry.');
    // Raw SQL is transient and includes security records. The disk/Drive archive excludes them.
    db = new DatabaseSync(':memory:'); db.exec(fs.readFileSync(raw, 'utf8'));
    const schemaVersion = db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(row => row.name);
    const backup = await makeBackup(readBusinessDatabase(db), schemaVersion, 'production-d1');
    const drill = restoreDrill(backup, ':memory:');
    const envelope = await encryptBackup(backup, passphrase);
    // Authenticate the exact encrypted bytes before calling this copy successful.
    const encoded = JSON.stringify(envelope); const decoded = await decryptBackup(JSON.parse(encoded), passphrase);
    if (decoded.checksum !== backup.checksum) throw new Error('Encrypted backup verification failed.');
    const filename = `seiko-${new Date().toISOString().replace(/[:.]/g, '-')}.seiko-backup`;
    const destination = path.join(config.directory, filename);
    fs.writeFileSync(`${destination}.partial`, encoded, { mode: 0o600, flag: 'wx' });
    fs.renameSync(`${destination}.partial`, destination);
    const report = { ...drill, file: filename, encryptedBytes: Buffer.byteLength(encoded), securityRecordsIncluded: false, driveCopy: 'not-configured' };
    if (config.driveDirectory) {
      if (!path.isAbsolute(config.driveDirectory) || !fs.existsSync(config.driveDirectory)) throw new Error('Local backup succeeded, but the configured Google Drive folder is unavailable.');
      fs.copyFileSync(destination, path.join(config.driveDirectory, filename), fs.constants.COPYFILE_EXCL);
      if (fs.readFileSync(path.join(config.driveDirectory, filename), 'utf8') !== encoded) throw new Error('Google Drive folder copy verification failed.');
      report.driveCopy = 'copied-to-sync-folder'; // This does not assert remote Google sync completion.
    }
    fs.writeFileSync(`${destination}.manifest.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    fs.appendFileSync(path.join(config.directory, 'operations.jsonl'), `${JSON.stringify(report)}\n`, { mode: 0o600 });
    return report;
  } finally {
    db?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, configFile, backupFile, target] = process.argv.slice(2);
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (command === 'export') console.log(JSON.stringify(await diskBackup(config), null, 2));
    else if (command === 'drill') {
      const backup = await decryptBackup(JSON.parse(fs.readFileSync(backupFile, 'utf8')), fs.readFileSync(config.keyFile, 'utf8').trim());
      console.log(JSON.stringify(restoreDrill(backup, target || ':memory:'), null, 2));
    } else throw new Error('Use export <private-config.json> or drill <private-config.json> <encrypted-backup> [new-local-db].');
  } catch (cause) { console.error(cause.message); process.exitCode = 1; }
}
