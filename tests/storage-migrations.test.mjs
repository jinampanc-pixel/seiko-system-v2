import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { legacySharedUpgrade, migrate } from '../scripts/d1-migrations.mjs';
import { releaseState } from '../scripts/release-state.mjs';

const baseline = fs.readFileSync('migrations/0001_reproducible_baseline.sql', 'utf8');
test('remote migration verifies its export, hides signed URLs and stops before changes on export failure', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seiko-migration-test-'));
  const oldDirectory = process.env.SEIKO_D1_BACKUP_DIR;
  const oldLog = console.log; const logs = []; const calls = [];
  try {
    process.env.SEIKO_D1_BACKUP_DIR = directory; console.log = value => logs.push(value);
    migrate(['--remote'], (_executable, args, options) => {
      calls.push(args);
      if (args.includes('export')) {
        assert.equal(options.stdio, 'pipe', 'Export links must never be inherited into public logs');
        fs.writeFileSync(args[args.indexOf('--output') + 1], 'CREATE TABLE fixture(id TEXT);');
        return { status: 0, stdout: 'https://fixture.invalid/private-export?secret=fixture', stderr: '' };
      }
      return { status: 0, stdout: JSON.stringify([{ results: [] }]), stderr: '' };
    });
    assert.equal(calls[0][2], 'export');
    assert.ok(calls.at(-1).includes('apply'));
    assert.equal(logs.some(log => log.includes('secret=fixture')), false);
    assert.equal(fs.readdirSync(directory).filter(file => file.endsWith('.manifest.json')).length, 1);
    const failed = [];
    assert.throws(() => migrate(['--remote'], (_executable, args) => { failed.push(args); return { status: 1 }; }), /deployment must stop/);
    assert.equal(failed.length, 1); assert.ok(failed[0].includes('export'));
  } finally {
    console.log = oldLog;
    if (oldDirectory === undefined) delete process.env.SEIKO_D1_BACKUP_DIR; else process.env.SEIKO_D1_BACKUP_DIR = oldDirectory;
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
});
test('release requires successful CI for the latest main revision and refuses failed or superseded builds', () => {
  const success = { id: 1, head_sha: 'current', head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' };
  assert.equal(releaseState('current', 'current', [success]), 'ready');
  assert.equal(releaseState('current', 'current', [{ ...success, head_sha: 'old' }]), 'waiting');
  assert.equal(releaseState('current', 'current', [success, { ...success, id: 2, status: 'in_progress' }]), 'waiting');
  assert.throws(() => releaseState('current', 'newer', [success]), /latest/);
  assert.throws(() => releaseState('current', 'current', [success, { ...success, id: 2, conclusion: 'failure' }]), /failed/);
});
test('committed baseline reproduces every runtime-created schema object and adopts existing data', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(baseline);
    db.exec("INSERT INTO seiko_clients VALUES ('fixture-client','fixture','123','',0,'{}','owner','owner')");
    db.exec(baseline);
    assert.equal(db.prepare('SELECT count(*) AS n FROM seiko_clients').get().n, 1);
    const objects = new Set(db.prepare('SELECT name FROM sqlite_schema').all().map(row => row.name));
    let found = 0;
    for (const file of fs.readdirSync('app', { recursive: true }).filter(file => /\.tsx?$/.test(file))) {
      const source = ts.createSourceFile(file, fs.readFileSync(`app/${file}`, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'prepare') {
          const arg = node.arguments[0];
          if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
            const match = arg.text.trim().match(/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)/i);
            if (match) { found++; assert.ok(objects.has(match[1]), `Missing ${match[1]} from ${file}`); }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    assert.ok(found >= 52);
  } finally { db.close(); }
});

test('legacy shared rows gain versions and creation times without changing documents', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE jinam_shared_records(scope TEXT,collection TEXT,id TEXT,document_json TEXT,updated_at TEXT,updated_by_user_id TEXT,updated_by_email TEXT,PRIMARY KEY(scope,collection,id)); INSERT INTO jinam_shared_records VALUES('meth','orders','fixture','{\"preserved\":true}','2026-10-03','owner','owner')");
    for (const sql of legacySharedUpgrade(db.prepare('PRAGMA table_info(jinam_shared_records)').all())) db.exec(sql);
    db.exec(baseline);
    for (const sql of legacySharedUpgrade(db.prepare('PRAGMA table_info(jinam_shared_records)').all())) db.exec(sql);
    const row = db.prepare('SELECT * FROM jinam_shared_records').get();
    assert.equal(row.document_json, '{"preserved":true}');
    assert.equal(row.version, 1); assert.equal(row.created_at, row.updated_at);
  } finally { db.close(); }
});

test('billing and client history preserve snapshots, attribution, numbering and transaction rollback', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(baseline);
    db.exec("INSERT INTO seiko_billing_documents(id,data,total_paise,created_by) VALUES('invoice-fixture','{\"revision\":0}',10000,'creator')");
    db.exec(fs.readFileSync('migrations/0002_immutable_billing_client_history.sql', 'utf8'));
    db.prepare('UPDATE seiko_billing_documents SET data=?,total_paise=12000 WHERE id=?').run('{"revision":1,"amendedBy":"amender"}', 'invoice-fixture');
    const history = db.prepare("SELECT * FROM seiko_storage_audit WHERE entity_type='billing-document' ORDER BY sequence").all();
    assert.equal(history[0].action, 'baseline'); assert.equal(history[0].actor_email, null);
    assert.equal(JSON.parse(JSON.parse(history[1].before_json).data).revision, 0);
    assert.equal(JSON.parse(JSON.parse(history[1].after_json).data).revision, 1);
    assert.equal(JSON.parse(history[1].after_json).created_by, 'creator');
    assert.equal(JSON.parse(history[1].after_json).sequence, 1);
    assert.equal(history[1].actor_email, 'amender'); assert.ok(history[1].at.endsWith('Z'));
    db.exec("INSERT INTO seiko_clients VALUES('client-fixture','client','123','',0,'{}','creator','creator'); UPDATE seiko_clients SET archived=1,updated_by='archiver' WHERE id='client-fixture'; INSERT INTO seiko_billing_payments(id,invoice_id,amount_paise,data,created_by) VALUES('payment-fixture','invoice-fixture',100,'{}','cashier')");
    assert.equal(db.prepare("SELECT actor_email FROM seiko_storage_audit WHERE entity_type='client' AND action='update'").get().actor_email, 'archiver');
    assert.equal(db.prepare("SELECT actor_email FROM seiko_storage_audit WHERE entity_type='payment'").get().actor_email, 'cashier');
    assert.throws(() => db.exec('UPDATE seiko_storage_audit SET actor_email=NULL'), /immutable/);
    assert.throws(() => db.exec('DELETE FROM seiko_storage_audit'), /immutable/);
    db.exec("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON seiko_storage_audit BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
    assert.throws(() => db.exec("UPDATE seiko_clients SET archived=0 WHERE id='client-fixture'"), /fixture audit failure/);
    assert.equal(db.prepare("SELECT archived FROM seiko_clients WHERE id='client-fixture'").get().archived, 1);
  } finally { db.close(); }
});
