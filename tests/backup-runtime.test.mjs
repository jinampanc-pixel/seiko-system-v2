import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as format from '../app/lib/backup-format.mjs';
import { restoreDrill, diskBackup } from '../scripts/business-backup.mjs';
import { publishBackupStatus } from '../scripts/backup-status.mjs';

export function fixture(managedKey) {
  const sqlite = new DatabaseSync(':memory:');
  const files = fs.readdirSync('migrations').sort();
  for (const file of files) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
  sqlite.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL)');
  for (const file of files) sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(file);
  const db = { withSession() { return this; }, prepare(sql) {
    if ((sql.match(/UNION ALL/g) || []).length >= 5) throw new Error('D1 compound SELECT limit');
    const statement = sqlite.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args); }, async all() { return { results: statement.all(...args).map(row => ({ ...row })) }; } };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
    catch (cause) { sqlite.exec('ROLLBACK'); throw cause; }
  } };
  const actor = { email: 'owner@example.invalid', sessionId: 'session', mustChangePassword: false };
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/erp/backups/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: api, Response, Request, URL, TextDecoder, TextEncoder, Uint8Array, crypto, Date,
    require(name) { if (name === 'cloudflare:workers') return { env: { DB: db, BACKUP_RECOVERY_KEY: managedKey } }; if (name.endsWith('backup-format.mjs')) return format; return { authenticateActor: async () => actor }; },
  });
  for (const business of ['seiko', 'meth', 'veyn-health']) sqlite.prepare("INSERT INTO erp_memberships(id,business_id,email,role,active,created_at,created_by_email,updated_at,updated_by_email) VALUES(?,?,?,'owner',1,?,?,?,?)").run(business, business, actor.email, 'now', actor.email, 'now', actor.email);
  sqlite.prepare("INSERT INTO erp_sessions(id,user_id,token_hash,created_at,last_seen_at,expires_at) VALUES('session','owner','fixture',?,?,?)").run(new Date().toISOString(), new Date().toISOString(), new Date(Date.now() + 3600000).toISOString());
  const call = async body => { const response = await api.POST(new Request('https://test.invalid/api/erp/backups', { method: 'POST', headers: { Origin: 'https://test.invalid' }, body: JSON.stringify(body) })); return { status: response.status, ...await response.json() }; };
  return { sqlite, db, api, actor, call, files };
}
function seed(sqlite) {
  sqlite.prepare('INSERT INTO seiko_clients VALUES(?,?,?,?,?,?,?,?)').run('client', 'fixture', '', '', 0, '{"id":"client","name":"Restore fixture"}', 'owner', 'owner');
  sqlite.prepare('INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) VALUES(?,?,?,?)').run('invoice', '{"id":"invoice","invoiceNo":"INV-001"}', 10000, 'owner');
  sqlite.prepare('INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES(?,?,?,?,?)').run('payment', 'invoice', 5000, '{"id":"payment"}', 'owner');
  sqlite.prepare('INSERT INTO erp_label_records(business_id,collection,id,document_json,updated_at,updated_by_email) VALUES(?,?,?,?,?,?)').run('seiko', 'tasks-v1', 'task', '{"id":"task","unknownFutureField":true}', 'now', 'owner');
}
test('owner-managed backups unlock without returning keys and require fresh owner authentication', async () => {
  const key = 'managed fixture recovery key'; const f = fixture(key); const missing = fixture();
  try {
    seed(f.sqlite);
    const status = await f.call({ operation: 'status' }); assert.equal(status.managedRecoveryReady, true); assert.equal(status.records > 0, true); assert.equal(status.copies.length, 0); assert.equal(JSON.stringify(status).includes(key), false);
    const result = await f.call({ operation: 'managed-export' }); assert.equal(result.status, 200); assert.equal(result.backup, undefined); assert.equal(JSON.stringify(result).includes(key), false);
    const decoded = await format.decryptBackup(result.envelope, key);
    const inspected = await f.call({ operation: 'managed-inspect', envelope: result.envelope }); assert.equal(inspected.backup.checksum, decoded.checksum);
    const corrupt = structuredClone(result.envelope); corrupt.ciphertext = 'invalid'; assert.equal((await f.call({ operation: 'managed-inspect', envelope: corrupt })).status, 400);
    f.sqlite.exec("UPDATE erp_sessions SET created_at='2000-01-01T00:00:00Z'"); assert.equal((await f.call({ operation: 'managed-inspect', envelope: result.envelope })).status, 401);
    f.sqlite.exec("DELETE FROM erp_memberships WHERE business_id='seiko'"); assert.equal((await f.call({ operation: 'status' })).status, 403);
    assert.equal((await missing.call({ operation: 'managed-export' })).status, 503);
  } finally { f.sqlite.close(); missing.sqlite.close(); }
});
test('published copy receipts match decrypted archives and cannot claim an unverified Drive copy', async () => {
  const f = fixture(); const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seiko-status-test-'));
  try {
    seed(f.sqlite); const backup = (await f.call({ operation: 'export' })).backup;
    const keyFile = path.join(directory, 'key'); fs.writeFileSync(keyFile, 'private fixture receipt key');
    const report = { ...restoreDrill(backup, ':memory:'), file: 'seiko-2026-10-05T00-00-00-000Z.seiko-backup', driveCopy: 'not-configured' };
    fs.writeFileSync(path.join(directory, report.file), JSON.stringify(await format.encryptBackup(backup, 'private fixture receipt key')));
    const result = await publishBackupStatus({ directory, keyFile }, report, (_exe, args) => { f.sqlite.exec(args[args.indexOf('--command') + 1]); return { status: 0 }; });
    assert.deepEqual(result.reported, ['pc']);
    const status = await f.call({ operation: 'status' }); assert.equal(status.copies[0].location, 'pc'); assert.equal(status.copies[0].records, report.records);
    await assert.rejects(publishBackupStatus({ directory, keyFile }, { ...report, records: 999 }, () => { throw new Error('must not publish'); }), /does not match/);
    await assert.rejects(publishBackupStatus({ directory, keyFile }, { ...report, driveCopy: 'remote-byte-verified' }), /incomplete/);
  } finally { f.sqlite.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('encrypted full-business backup round-trips with exact history, excludes credentials and detects corruption', async () => {
  const f = fixture(); const passphrase = 'fixture recovery passphrase';
  try {
    seed(f.sqlite); const exported = await f.call({ operation: 'export' }); assert.equal(exported.status, 200);
    const backup = exported.backup; assert.equal(Object.keys(backup.tables).length, 14);
    assert.equal(Object.keys(backup.tables).some(table => /session|passkey|secret|users/.test(table)), false);
    const encrypted = await format.encryptBackup(backup, passphrase);
    assert.equal(JSON.stringify(encrypted).includes('Restore fixture'), false);
    const decoded = await format.decryptBackup(encrypted, passphrase); assert.equal(decoded.checksum, backup.checksum);
    await assert.rejects(format.decryptBackup(encrypted, 'wrong recovery passphrase'), /damaged/);
    await assert.rejects(format.decryptBackup({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -8)}AAAAAAAA` }, passphrase), /damaged/);
    const altered = structuredClone(backup); altered.tables.seiko_clients.rows[0].data = '{}'; await assert.rejects(format.validateBackup(altered), /checksum/);
    const drill = restoreDrill(decoded, ':memory:'); assert.equal(drill.integrity, 'ok'); assert.equal(drill.records, 8);
    assert.equal((await f.call({ operation: 'dry-run', backup })).summary.duplicate, 8);
    f.sqlite.prepare("UPDATE seiko_clients SET data='{}' WHERE id='client'").run();
    const dry = await f.call({ operation: 'dry-run', backup }); assert.equal(dry.summary.changed, 1); assert.equal(dry.summary.canRestore, false);
    assert.equal((await f.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 409);
    assert.throws(() => f.sqlite.exec('DELETE FROM erp_backup_operations'), /immutable/);
  } finally { f.sqlite.close(); }
});
test('owner restore rejects stale authentication, enforces schema and restores atomically without overwrites', async () => {
  const source = fixture(); const target = fixture();
  try {
    seed(source.sqlite); const backup = (await source.call({ operation: 'export' })).backup;
    const dry = await target.call({ operation: 'dry-run', backup }); assert.equal(dry.summary.new, 8); assert.equal(dry.summary.canRestore, true);
    target.sqlite.prepare("UPDATE erp_sessions SET created_at='2000-01-01T00:00:00Z'").run();
    assert.equal((await target.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 401);
    target.sqlite.prepare('UPDATE erp_sessions SET created_at=?').run(new Date().toISOString());
    const restored = await target.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' }); assert.equal(restored.status, 200);
    assert.equal(target.sqlite.prepare('SELECT amount_paise FROM seiko_billing_payments').get().amount_paise, 5000);
    assert.equal(target.sqlite.prepare('SELECT data FROM seiko_clients').get().data, backup.tables.seiko_clients.rows[0].data);
    assert.equal((await target.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 409);
    target.sqlite.prepare("UPDATE erp_memberships SET role='manager' WHERE business_id='meth'").run(); assert.equal((await target.call({ operation: 'export' })).status, 403);
    const response = await target.api.POST(new Request('https://test.invalid/api/erp/backups', { method: 'POST', headers: { Origin: 'https://attacker.invalid' }, body: '{}' })); assert.equal(response.status, 403);
  } finally { source.sqlite.close(); target.sqlite.close(); }
});
test('disk backup suppresses signed links, preserves encrypted copies and stops on failed export', async () => {
  const f = fixture(); const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seiko-backup-test-')); const keyFile = path.join(directory, 'key'); fs.writeFileSync(keyFile, 'fixture disk backup key');
  try {
    seed(f.sqlite);
    // Produce a trusted minimal SQL export with migrations and real fixture rows.
    let sql = fs.readdirSync('migrations').sort().map(file => fs.readFileSync(`migrations/${file}`, 'utf8')).join('\n');
    sql += '\nCREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT);';
    for (const file of f.files) sql += `\nINSERT INTO d1_migrations(name) VALUES('${file}');`;
    sql += "\nINSERT INTO seiko_clients VALUES('c','fixture','','',0,'{}','owner','owner');";
    const report = await diskBackup({ directory, keyFile }, (_exe, args, options) => { assert.equal(options.stdio, 'pipe'); fs.writeFileSync(args[args.indexOf('--output') + 1], sql); return { status: 0, stdout: 'private signed URL' }; });
    assert.equal(report.securityRecordsIncluded, false); assert.equal(report.integrity, 'ok');
    const data = JSON.parse(fs.readFileSync(path.join(directory, report.file), 'utf8')); await format.decryptBackup(data, 'fixture disk backup key');
    const prior = fs.readdirSync(directory); await assert.rejects(diskBackup({ directory, keyFile }, () => ({ status: 1 })), /export failed/); assert.deepEqual(fs.readdirSync(directory), prior);
    await assert.rejects(diskBackup({ directory: path.join(directory, 'missing-drive'), keyFile }), /unavailable/);
    const existing = path.join(directory, 'existing.sqlite'); fs.writeFileSync(existing, 'keep'); assert.throws(() => restoreDrill(null, existing), /new target/);
  } finally { f.sqlite.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('restore constraints and a concurrent write roll back the entire import', async () => {
  const source = fixture(); const target = fixture();
  try {
    seed(source.sqlite); const backup = (await source.call({ operation: 'export' })).backup;
    const invalid = structuredClone(backup); invalid.tables.seiko_clients.rows[0].name_key = null;
    const { checksum: _oldChecksum, ...payload } = invalid; void _oldChecksum; invalid.checksum = await format.checksum(payload);
    assert.equal((await target.call({ operation: 'restore', backup: invalid, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 409);
    assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM seiko_storage_audit').get().n, 0);
    assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM erp_backup_operations').get().n, 0);
    const originalBatch = target.db.batch.bind(target.db); let batches = 0;
    target.db.batch = async statements => {
      if (++batches === 2) target.sqlite.prepare('INSERT INTO seiko_clients VALUES(?,?,?,?,?,?,?,?)').run('concurrent', 'newer', '', '', 0, '{}', 'owner', 'owner');
      return originalBatch(statements);
    };
    assert.equal((await target.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 409);
    assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM seiko_clients').get().n, 1);
    assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM seiko_billing_payments').get().n, 0);
    assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM erp_backup_operations').get().n, 0);
  } finally { source.sqlite.close(); target.sqlite.close(); }
});


test('recovery preserves deleted high-water numbering and validates counter metadata', async () => {
  const source = fixture(); const target = fixture();
  try {
    seed(source.sqlite);
    source.sqlite.exec("UPDATE sqlite_sequence SET seq=80 WHERE name='seiko_billing_documents'");
    source.sqlite.exec("INSERT INTO sqlite_sequence(name,seq) VALUES('jinam_shared_changes',70)");
    const backup = (await source.call({ operation: 'export' })).backup;
    assert.equal(backup.sequences.seiko_billing_documents, 80);
    assert.equal(backup.sequences.jinam_shared_changes, 70);
    assert.equal(restoreDrill(backup, ':memory:').numberingCountersIncluded, true);
    assert.equal((await target.call({ operation: 'restore', backup, confirmation: 'RESTORE EMPTY SYSTEM' })).status, 200);
    target.sqlite.prepare('INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) VALUES(?,?,?,?)').run('next', '{}', 0, 'owner');
    assert.equal(target.sqlite.prepare("SELECT sequence FROM seiko_billing_documents WHERE id='next'").get().sequence, 81);
    assert.equal(target.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='jinam_shared_changes'").get().seq, 70);
    const invalid = structuredClone(backup); invalid.sequences.seiko_billing_documents = 0;
    const { checksum: ignored, ...payload } = invalid; void ignored; invalid.checksum = await format.checksum(payload);
    await assert.rejects(format.validateBackup(invalid), /numbering/);
    const { sequences: omitted, checksum: digest, ...oldPayload } = backup; void omitted; void digest;
    const legacy = { ...oldPayload, checksum: await format.checksum(oldPayload) };
    await format.validateBackup(legacy);
    assert.equal(restoreDrill(legacy, ':memory:').numberingCountersIncluded, false);
  } finally { source.sqlite.close(); target.sqlite.close(); }
});
