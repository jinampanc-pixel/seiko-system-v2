import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import os from 'node:os';
import path from 'node:path';
import { withBackupLock } from '../scripts/backup-lock.mjs';

test('idle sync avoids order parsing and full downloads, preserves event saves and pauses hidden reads', async () => {
  const events = new EventTarget(); const document = new EventTarget(); document.visibilityState = 'visible';
  const timers = new Map(); const cleanups = []; const calls = []; const requests = []; let normalizations = 0;
  let local = [{ orderId: 'one', updatedAt: 'first', records: [{ value: 'kept' }] }]; let remote = structuredClone(local); let version = 1;
  const key = 'jinam:seiko:orders-v1';
  const storage = new Map([[key, JSON.stringify(local)]]);
  const cache = { readOrderCache: () => structuredClone(local), orderCacheIsVolatile: () => false, writeOrderCache: (_id, orders) => { local = structuredClone(orders); storage.set(key, JSON.stringify(local)); events.dispatchEvent(new Event('seiko:orders-cache-updated')); } };
  const versions = new Map();
  const imports = {
    react: { useEffect: effect => cleanups.push(effect()) },
    './access-control': { useAccess: () => ({ businessId: 'seiko', membership: { modules: ['orders'] }, can: () => true }) },
    './lib/order-domain': { normalizeProductMeasurements: order => { normalizations++; return order; } },
    './lib/order-cache': cache,
    './lib/order-commands': { orderVersions: () => versions, requestOrders: async body => {
      calls.push(body.operation);
      requests.push(body);
      if (body.operation === 'versions') return { ok: true, data: { versions: [['one', version]] } };
      if (body.operation === 'upsert') { assert.equal(body.expectedVersion, version); remote = [structuredClone(body.order)]; version++; return { ok: true, data: { order: remote[0], version } }; }
      return { ok: true, data: { orders: remote.map(order => ({ order: structuredClone(order), version, updatedAt: order.updatedAt })) } };
    } },
  };
  const exports = {};
  const window = { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), setInterval: (callback, delay) => { timers.set(delay, callback); return delay; }, clearInterval: id => timers.delete(id) };
  class DetailEvent extends Event { constructor(name, options) { super(name); this.detail = options.detail; } }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/erp-order-sync.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => imports[name], window, document, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, queueMicrotask, CustomEvent: DetailEvent, Date });
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
  exports.ErpOrderSync(); await flush();
  assert.equal(requests.find(body => body.operation === 'list').limit, 25);
  timers.get(60000)(); await flush(); const before = normalizations;
  for (let i = 0; i < 5; i++) { timers.get(60000)(); timers.get(15000)(); await flush(); }
  assert.equal(normalizations, before); assert.equal(calls.filter(value => value === 'list').length, 1);
  document.visibilityState = 'hidden'; const reads = calls.length; timers.get(15000)(); await flush(); assert.equal(calls.length, reads);
  local[0].records[0].value = 'edited'; storage.set(key, JSON.stringify(local)); events.dispatchEvent(new Event('seiko:orders-cache-updated')); await flush();
  assert.equal(remote[0].records[0].value, 'edited'); assert.equal(version, 2);
  document.visibilityState = 'visible'; remote[0].records.push({ value: 'other device' }); version++; timers.get(15000)(); await flush();
  assert.equal(local[0].records.length, 2);
  assert.deepEqual(Array.from(requests.filter(body => body.operation === 'list').at(-1).orderIds), ['one'], 'Cross-device changes fetch only changed orders');
  const listsBeforeLoss = calls.filter(value => value === 'list').length;
  local = []; storage.set(key, '[]'); events.dispatchEvent(new Event('seiko:orders-cache-updated')); await flush();
  assert.equal(local[0].records.length, 2, 'Missing cached orders recover without a server version change');
  assert.equal(calls.filter(value => value === 'list').length, listsBeforeLoss + 1);
  cleanups.forEach(cleanup => cleanup()); assert.equal(timers.size, 0);
});

test('backup lock excludes concurrent exports, releases on failure and recovers only exited owners', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jinam-lock-test-'));
  try {
    let release; const running = withBackupLock(directory, () => new Promise(resolve => { release = resolve; }));
    await assert.rejects(withBackupLock(directory, () => assert.fail('overlapping export')), /already running/);
    release('verified'); assert.equal(await running, 'verified');
    await assert.rejects(withBackupLock(directory, () => { throw Error('fixture failure'); }), /fixture failure/);
    assert.equal(fs.existsSync(path.join(directory, '.export.lock')), false);
    fs.writeFileSync(path.join(directory, '.export.lock'), JSON.stringify({ pid: 99999999, token: 'exited fixture' }));
    assert.equal(await withBackupLock(directory, async () => 'recovered', { isAlive: () => false }), 'recovered');
  } finally { for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file)); fs.rmdirSync(directory); }
});
