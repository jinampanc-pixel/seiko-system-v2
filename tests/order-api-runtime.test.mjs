import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(imports[name], `Unexpected import: ${name}`); return imports[name]; }, crypto, Response, Request, TextEncoder, ...globals });
  return exports;
}

test('cold Orders API initialization never generates IDs in Workers global scope', async () => {
  const globalCrypto = { randomUUID() { throw new Error('Random values forbidden at module scope'); } };
  const statuses = load('app/lib/order-statuses.ts', {}, { crypto: globalCrypto });
  const api = load('app/api/erp/orders/route.ts', {
    'cloudflare:workers': { env: {} },
    '../../../lib/order-statuses': statuses,
    '../../../lib/server-erp-auth': { authenticateActor: async () => null },
  }, { crypto: globalCrypto });
  const response = await api.POST(new Request('https://test.invalid/api/erp/orders', { method: 'POST', body: JSON.stringify({ operation: 'list', businessId: 'seiko' }) }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});

test('order API returns JSON when authentication or session initialization fails', async () => {
  for (const stage of ['authentication', 'session']) {
    const api = load('app/api/erp/orders/route.ts', {
      'cloudflare:workers': { env: { DB: { withSession() { throw new Error('session unavailable'); } } } },
      '../../../lib/order-statuses': load('app/lib/order-statuses.ts'),
      '../../../lib/server-erp-auth': { authenticateActor: async () => {
        if (stage === 'authentication') throw new Error('identity storage unavailable');
        return { userId: 'test-owner', email: 'owner@example.invalid' };
      } },
    });
    const response = await api.POST(new Request('https://test.invalid/api/erp/orders', { method: 'POST', body: JSON.stringify({ operation: 'list', businessId: 'seiko' }) }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'ERP_STORAGE_ERROR');
  }
});

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
      '../../../lib/order-statuses': load('app/lib/order-statuses.ts'),
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


test('acknowledged orders survive quota failure without evicting drafts or losing later cache changes', async () => {
  const values = new Map([['jinam:seiko:orders-v1', '[]'], ['recovery-draft', 'keep']]);
  let quota = true;
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (quota) throw new Error('QuotaExceededError');
    values.set(key, value);
  } };
  const events = [];
  const globals = { localStorage: storage, window: { dispatchEvent: event => events.push(event.type) }, CustomEvent: class { constructor(type) { this.type = type; } } };
  const domain = { orderStoreKey: business => `jinam:${business}:orders-v1`, normalizeProductMeasurements: order => order };
  const cache = load('app/lib/order-cache.ts', { './order-domain': domain }, globals);
  const commands = load('app/lib/order-commands.ts', { './order-domain': domain, './order-cache': cache }, {
    ...globals, fetch: async () => Response.json({ok:true, data:{order:{orderId:'saved',records:[{name:'persisted'}]},version:2}}),
  });
  commands.orderVersions('seiko').set('saved', 1);
  const saved = await commands.saveSharedOrder('seiko', {orderId:'saved'});
  assert.equal(saved.records[0].name, 'persisted');
  assert.equal(cache.readOrderCache('seiko')[0].orderId, 'saved');
  assert.equal(cache.orderCacheIsVolatile('seiko'), true);
  assert.equal(values.get('recovery-draft'), 'keep');
  assert.ok(events.includes('seiko:order-command-saved'));
  assert.equal(cache.readOrderCache('meth').length, 0);
  // Another tab can still supply a newer local cache; fallback must not hide it.
  values.set('jinam:seiko:orders-v1', '[{"orderId":"other-tab"}]');
  assert.equal(cache.readOrderCache('seiko')[0].orderId, 'other-tab');
  quota = false;
  cache.writeOrderCache('seiko', [saved]);
  assert.equal(cache.orderCacheIsVolatile('seiko'), false);
  assert.equal(JSON.parse(values.get('jinam:seiko:orders-v1'))[0].orderId, 'saved');
});

test('generated identities preserve package status and return normally when their cache is full', () => {
  const domain = { quantityForRecord: () => 2 };
  const previous = {orderId:'one',packages:[{id:'one:package:person',status:'sealed'}]};
  const production = load('app/lib/production-domain.ts', {'./order-domain':domain}, {
    window: {}, localStorage: {getItem: () => JSON.stringify([previous]), setItem: () => {throw new Error('QuotaExceededError');}},
  });
  const result = production.generateOrderArtifacts('seiko', {orderId:'one',products:[{id:'vest',name:'Vest'}],records:[{recordId:'person',personId:'person',values:{}}]});
  assert.equal(result.garments.length, 2);
  assert.equal(result.garments[0].scanToken, 'garment:one:person:vest:1');
  assert.equal(result.packages[0].status, 'sealed');
});


test('a newer poll version cannot authorize overwriting an older workspace revision', async () => {
  const operations = [];
  const commands = load('app/lib/order-commands.ts', {
    './order-domain': {normalizeProductMeasurements: order => order},
    './order-cache': {readOrderCache: () => [], writeOrderCache: () => {}},
  }, {fetch: async (_url, options) => {
    const body = JSON.parse(options.body); operations.push(body.operation);
    return Response.json({ok:true,data:{orders:[{order:{orderId:'one',updatedAt:'newer-server-revision',records:[{name:'retained'}]},version:8}]}});
  }});
  commands.orderVersions('seiko').set('one', 8);
  await assert.rejects(commands.saveSharedOrder('seiko', {orderId:'one',records:[]}, 'older-workspace-revision'), /changed in another window or device/);
  assert.equal(operations.join(','), 'list');
});
