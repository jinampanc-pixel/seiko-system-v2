import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

test('shared label API enforces scope, permissions, versions, safe adoption and deletion tombstones', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
    const db = { withSession() { return this; }, prepare(sql) {
      const statement = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async first() { return statement.get(...args); }, async all() { return { results: statement.all(...args) }; } };
    } };
    let signedIn = true; let write = true;
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/erp/labels/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, Response, Request, URL, TextDecoder, Uint8Array,
      require(name) { return name === 'cloudflare:workers' ? { env: { DB: db } } : { authenticateActor: async () => signedIn ? { email: 'owner@example.invalid' } : null, authorizePermission: async (_actor, business, permission) => business === 'seiko' && (permission === 'labels.view' || write) ? { role: 'owner' } : null }; },
    });
    const call = async body => { const response = await exports.POST(new Request('https://test.invalid/api/erp/labels', { method: 'POST', body: JSON.stringify({ businessId: 'seiko', ...body }) })); return { status: response.status, ...await response.json() }; };
    const value = { id: 'fixture-task', name: 'Original', unknownFutureField: { preserved: true }, selectedRows: ['one'] };
    let result = await call({ operation: 'import-local', collection: 'tasks-v1', id: value.id, value });
    assert.equal(result.status, 200); assert.equal(result.records[0].version, 1);
    result = await call({ operation: 'import-local', collection: 'tasks-v1', id: value.id, value: { ...value, name: 'Stale browser' } });
    assert.equal(result.records[0].value.name, 'Original');
    result = await call({ operation: 'save', collection: 'tasks-v1', id: value.id, value: { ...value, name: 'Updated' }, expectedVersion: 1 });
    assert.equal(result.records[0].version, 2); assert.deepEqual(result.records[0].value.unknownFutureField, { preserved: true });
    assert.equal((await call({ operation: 'save', collection: 'tasks-v1', id: value.id, value, expectedVersion: 1 })).status, 409);
    assert.equal((await call({ operation: 'save', collection: 'tasks-v1', id: 'wrong', value, expectedVersion: 0 })).status, 400);
    write = false;
    assert.equal((await call({ operation: 'list' })).status, 200);
    assert.equal((await call({ operation: 'save', collection: 'tasks-v1', id: value.id, value, expectedVersion: 2 })).status, 403);
    assert.equal((await call({ operation: 'list', businessId: 'meth' })).status, 403);
    write = true;
    result = await call({ operation: 'delete', collection: 'tasks-v1', id: value.id, expectedVersion: 2 });
    assert.equal(result.records[0].deleted, true);
    result = await call({ operation: 'import-local', collection: 'tasks-v1', id: value.id, value });
    assert.equal(result.records[0].deleted, true);
    assert.equal((await call({ operation: 'save', collection: 'tasks-v1', id: value.id, value, expectedVersion: 0 })).status, 409);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM erp_label_history').get().n, 3);
    assert.throws(() => sqlite.exec('DELETE FROM erp_label_history'), /immutable/);
    const tooLarge = new Request('https://test.invalid/api/erp/labels', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) });
    assert.equal((await exports.POST(tooLarge)).status, 413);
    signedIn = false; assert.equal((await call({ operation: 'list' })).status, 401);
  } finally { sqlite.close(); }
});
