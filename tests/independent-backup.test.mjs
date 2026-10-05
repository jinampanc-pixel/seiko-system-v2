import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pcBackup } from '../scripts/pc-backup.mjs';
import { driveToken, uploadVerified } from '../scripts/drive-backup.mjs';
import { makeLocalRecovery, encryptLocalRecovery, decryptLocalRecovery } from '../app/lib/local-recovery.mjs';
import { decryptBackup } from '../app/lib/backup-format.mjs';

async function temporary(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jinam-independent-test-'));
  try { await action(directory); } finally {
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('PC and Drive failure states are independent, retry the same archive, and catch up next day', async () => temporary(async directory => {
  let exports = 0; let copies = 0; let failDrive = true; let failExport = false;
  const config = { directory, googleDrive: {} };
  const dependencies = { now: new Date('2026-10-05T15:00:00Z'), exportCopy: async () => {
    exports++; if (failExport) throw Error('private provider error');
    const file = `copy-${exports}.seiko-backup`; fs.writeFileSync(path.join(directory, file), 'encrypted fixture'); return { file, integrity: 'ok' };
  }, driveCopy: async (_config, report) => { copies++; if (failDrive) throw Error('secret token'); return { ...report, driveCopy: 'remote-byte-verified' }; } };
  await assert.rejects(pcBackup(config, dependencies), /PC backup verified/);
  const status = JSON.parse(fs.readFileSync(path.join(directory, 'pc-status.json'))); assert.equal(status.localState, 'verified'); assert.equal(status.cloudState, 'failed');
  failDrive = false; assert.equal((await pcBackup(config, dependencies)).cloudState, 'verified'); assert.equal(exports, 1); assert.equal(copies, 2);
  await pcBackup(config, dependencies); assert.equal(copies, 2);
  dependencies.now = new Date('2026-10-06T15:00:00Z'); failExport = true;
  await assert.rejects(pcBackup(config, dependencies), /PC export failed/); assert.equal(fs.readFileSync(path.join(directory, 'copy-1.seiko-backup'), 'utf8'), 'encrypted fixture');
  failExport = false; await pcBackup(config, dependencies); assert.equal(exports, 3);
}));
test('Drive resumable upload verifies private metadata and actual bytes, refuses corrupt duplicates without overwriting', async () => temporary(async directory => {
  const file = path.join(directory, 'dated.seiko-backup'); const bytes = Buffer.from('authenticated encrypted fixture'); fs.writeFileSync(file, bytes);
  const calls = []; let corrupt = false; let existing = false; let publicFolder = false; let maliciousUpload = false;
  const request = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.includes('/folder?')) return Response.json({ permissions: publicFolder ? [{ type: 'anyone', role: 'reader' }] : [{ type: 'user', role: 'owner' }] });
    if (url.includes('/files?q=')) return Response.json({ files: existing ? [{ id: 'archive' }] : [] });
    if (url.includes('uploadType=')) return new Response(null, { headers: { location: maliciousUpload ? 'https://attacker.invalid/upload' : 'https://www.googleapis.com/upload/session' } });
    if (url.endsWith('/upload/session')) { assert.equal(options.method, 'PUT'); assert.ok(Buffer.from(options.body).equals(bytes)); return Response.json({ id: 'archive' }); }
    if (url.includes('alt=media')) return new Response(corrupt ? Buffer.from('corrupt') : bytes);
    return Response.json({ id: 'archive', name: path.basename(file), size: String(bytes.length), parents: ['folder'], permissions: [{ type: 'user', role: 'owner' }] });
  };
  assert.equal((await uploadVerified(file, 'folder', 'fixture-token', request)).driveCopy, 'remote-byte-verified');
  existing = true; calls.length = 0; corrupt = true;
  await assert.rejects(uploadVerified(file, 'folder', 'fixture-token', request), /byte verification/); assert.equal(calls.some(call => call.method !== 'GET'), false);
  publicFolder = true; await assert.rejects(uploadVerified(file, 'folder', 'fixture-token', request), /private/);
  publicFolder = false; existing = false; maliciousUpload = true; await assert.rejects(uploadVerified(file, 'folder', 'fixture-token', request), /destination/);
  assert.equal(calls.some(call => call.url.includes('attacker.invalid')), false);
  assert.ok(fs.readFileSync(file).equals(bytes));
}));
test('Jinam direct OAuth refresh failures are sanitized and have no Codex connector dependency', async () => {
  await assert.rejects(driveToken({}), /authorization is missing/);
  await assert.rejects(driveToken({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' }, async (_url, options) => {
    assert.equal(options.body.get('grant_type'), 'refresh_token'); return new Response('sensitive provider response', { status: 401 });
  }), /authorization expired/);
});
test('offline recovery preserves caches/outbox exactly, excludes credentials and cannot become a D1 restore', async () => {
  const entries = { 'jinam:seiko:orders-v1': '[{"id":"cached"}]', 'jinam:seiko:labels:shared-pending-v1': '[{"expectedVersion":3}]', 'jinam:seiko:scan-queue': 'malformed but recoverable raw data', 'jinam:meth:channel-connections:v1': 'private token', 'jinam:session': 'session secret', unrelated: 'other application' };
  const storage = { length: Object.keys(entries).length, key: index => Object.keys(entries)[index], getItem: key => entries[key] };
  const copy = await makeLocalRecovery(storage); assert.equal(copy.completeD1Snapshot, false); assert.equal(Object.keys(copy.entries).length, 3);
  const key = 'offline fixture recovery passphrase'; const encrypted = await encryptLocalRecovery(copy, key); assert.equal(JSON.stringify(encrypted).includes('cached'), false);
  const decoded = await decryptLocalRecovery(encrypted, key); assert.equal(decoded.entries['jinam:seiko:scan-queue'], entries['jinam:seiko:scan-queue']);
  await assert.rejects(decryptBackup(encrypted, key), /Unsupported/); await assert.rejects(decryptLocalRecovery(encrypted, 'wrong offline recovery key'), /damaged/);
});
