import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => imports[name], crypto, Response, Request, TextEncoder });
  return exports;
}

test('order commands enforce versions, business scope, owner deletion, financial protection and tombstones', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(fs.readFileSync('drizzle/0001_erp_foundation.sql', 'utf8'));
    const db = { withSession() { return this; }, prepare(sql) {
      const statement = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, async run() { return statement.run(...args); }, async first() { return statement.get(...args) || null; }, async all() { return { results: statement.all(...args) }; } };
    } };
    let role = 'owner';
    const api = load('app/api/erp/orders/route.ts', {
      'cloudflare:workers': { env: { DB: db } },
      '../../../lib/order-domain': load('app/lib/order-domain.ts'),
      '../../../lib/server-erp-auth': { authenticateActor: async () => ({ userId: 'test-owner', email: 'owner@example.invalid' }), authorizePermission: async () => role ? { role } : null },
    });
    const call = async body => { const response = await api.POST(new Request('https://test.invalid/api/erp/orders', { method: 'POST', body: JSON.stringify({ businessId: 'seiko', ...body }) })); return { status: response.status, ...await response.json() }; };
    const order = { orderId: 'test-order', details: { orderNo: 'TEST-001' }, status: 'Active', archived: false };
    assert.equal((await call({ operation: 'upsert', order })).status, 200);
    assert.equal((await call({ operation: 'archive', orderId: order.orderId, archived: true, expectedVersion: 1 })).data.version, 2);
    assert.equal((await call({ operation: 'upsert', order, expectedVersion: 1 })).code, 'VERSION_CONFLICT');
    assert.equal((await call({ operation: 'status', orderId: order.orderId, status: 'Completed', expectedVersion: 2 })).data.version, 3);
    assert.equal((await call({ operation: 'status', orderId: order.orderId, status: 'bogus', expectedVersion: 3 })).status, 400);
    assert.equal((await call({ operation: 'archive', businessId: 'other', orderId: order.orderId, archived: true, expectedVersion: 3 })).status, 404);
    role = 'admin';
    assert.equal((await call({ operation: 'delete', orderId: order.orderId, confirmOrderNo: 'TEST-001', expectedVersion: 3 })).status, 403);
    role = null; assert.equal((await call({ operation: 'list' })).status, 403); role = 'owner';
    assert.equal((await call({ operation: 'delete', orderId: order.orderId, confirmOrderNo: 'wrong', expectedVersion: 3 })).status, 400);
    sqlite.exec('CREATE TABLE seiko_billing_documents(id TEXT, data TEXT); CREATE TABLE seiko_billing_payments(id TEXT, data TEXT);');
    for (const table of ['seiko_billing_documents', 'seiko_billing_payments']) {
      sqlite.prepare(`INSERT INTO ${table} VALUES(?,?)`).run('finance-test', JSON.stringify({ orderId: order.orderId }));
      assert.equal((await call({ operation: 'delete', orderId: order.orderId, confirmOrderNo: 'TEST-001', expectedVersion: 3 })).code, 'ORDER_HAS_FINANCIAL_RECORDS');
      sqlite.prepare(`DELETE FROM ${table}`).run();
    }
    const deleted = await call({ operation: 'delete', orderId: order.orderId, confirmOrderNo: 'TEST-001', expectedVersion: 3 });
    assert.equal(deleted.status, 200); assert.ok(deleted.data.order.deletedAt);
    assert.equal((await call({ operation: 'list' })).data.orders.length, 0);
    assert.equal((await call({ operation: 'upsert', order, expectedVersion: 4 })).code, 'ORDER_DELETED');
    assert.equal((await call({ operation: 'import-local', orders: [order] })).data.imported.length, 0);
    assert.equal((await call({ operation: 'list' })).data.orders.length, 0);
    const audit = sqlite.prepare("SELECT snapshot_json FROM erp_audit_events WHERE entity_id = ? ORDER BY version DESC LIMIT 1").get(order.orderId);
    assert.equal(JSON.parse(audit.snapshot_json).deletedBy, 'owner@example.invalid');
  } finally { sqlite.close(); }
});
