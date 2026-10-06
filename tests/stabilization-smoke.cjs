const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  }, crypto, Response, Request, URL, TextDecoder, TextEncoder, Uint8Array });
  return exports;
}

(async () => {
  const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5181';
  const server = process.env.SMOKE_BASE_URL ? null : spawn(process.execPath, [
    'node_modules/vite/bin/vite.js', '--config', 'tests/packing-browser/vite.config.mjs', '--port', '5181',
  ], { stdio: 'pipe' });
  let serverOutput = '';
  server?.stdout.on('data', data => { serverOutput += data; });
  server?.stderr.on('data', data => { serverOutput += data; });
  let browser;
  const sqlite = new DatabaseSync(':memory:');
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(`${base}/tests/packing-browser/smoke.html`)).ok) break; } catch { /* starting */ }
      if (attempt >= 60 || (server && server.exitCode !== null)) throw new Error(`Smoke server did not start: ${serverOutput}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const domain = load('app/lib/order-domain.ts', { './order-statuses': load('app/lib/order-statuses.ts') });
    const order = {
      orderId: 'smoke-order', status: 'Active', archived: false,
      details: { orderNo: 'SMOKE-001', clientName: 'Smoke School', contactNumber: '9999999999',
        billTo: 'Test address', orderDate: '2026-10-03', deliveryDate: '', clientType: 'School / Institution',
        contactPerson: '', attnRequired: false, shipTo: '', remarks: '' },
      products: [{ ...domain.blankProduct(), id: 'vest', name: 'Vest', quantityMode: 'per_person', defaultQuantity: 0 }],
      fields: [{ ...domain.field("Name"), id: "name" }], measurements: [], records: [{ recordId: 'one', personId: 'one', values: { 'field:name': 'Original name', 'product:vest:qty': 2 } }],
      revisions: [], updatedAt: '2026-10-03T00:00:00Z',
    };
    for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
    const db = { withSession() { return this; }, prepare(sql) {
      const stmt = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(stmt.run(...args).changes) } }; },
        async first() { return stmt.get(...args) || null; }, async all() { return { results: stmt.all(...args) }; } };
    } };
    const auth = { authenticateActor: async () => ({ userId: 'smoke-owner', email: 'smoke@example.invalid' }), authorizePermission: async () => ({ role: 'owner' }) };
    const ordersApi = load('app/api/erp/orders/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/server-erp-auth': auth, '../../../lib/order-statuses': load('app/lib/order-statuses.ts'),
    });
    const seed = async value => {
      const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: JSON.stringify({ operation: 'upsert', businessId: 'seiko', order: value }) }));
      assert.equal(response.status, 200, await response.text());
    };
    await seed(order);
    const billing = load('app/api/erp/billing/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/seiko-billing': load('app/lib/seiko-billing.ts'),
      '../../../lib/server-erp-auth': auth,
    });
    const clients = load('app/api/erp/clients/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/seiko-clients': load('app/lib/seiko-clients.ts'),
      '../../../lib/server-erp-auth': auth,
    });
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const session = { user: { displayName: 'Smoke Owner', email: 'smoke@example.invalid' }, businesses: [{
      businessId: 'seiko', businessName: 'SEIKO', role: 'owner',
      modules: ['home', 'orders', 'labels', 'scan', 'trace', 'production', 'billing', 'admin'],
    }] };
    await page.route('**/api/erp/session', route => route.fulfill({ json: { ok: true, data: session } }));
    await page.route('**/api/seiko', route => route.fulfill({ json: { ok: true, data: session } }));
    await page.route('**/api/erp/orders', async route => {
      const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    const labels = load('app/api/erp/labels/route.ts', { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/server-erp-auth': auth });
    for (const [path, api] of [['billing', billing], ['clients', clients], ['labels', labels]]) {
      await page.route(`**/api/erp/${path}`, async route => {
        const response = await api.POST(new Request(`${base}/api/erp/${path}`, { method: 'POST', body: route.request().postData() }));
        await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      });
    }
    await page.addInitScript(value => {
      localStorage.setItem('jinam:selected-business', 'seiko');
      localStorage.setItem('jinam:seiko:orders-v1', JSON.stringify([value]));
    }, order);
    await page.goto(`${base}/tests/packing-browser/smoke.html`);
    try { await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor({ timeout: 10000 }); }
    catch { throw new Error(`Application did not mount: ${JSON.stringify(errors)}. ${await page.locator('body').innerText()}`); }
    const navigate = async name => {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Modules' }).getByRole('button', { name: new RegExp(`${name}$`) }).click();
    };
    if(process.argv.includes('--billing-production')){
      const second=structuredClone(order);second.orderId='second-order';second.details.orderNo='SECOND-002';second.details.clientName='Other School';
      await seed(second);await navigate('Orders');await page.locator('.orderRow').filter({hasText:'SECOND-002'}).waitFor();
      await require('./billing-production-browser.cjs')({page,billing,sqlite,navigate,base});assert.deepEqual(errors,[]);return;
    }
    await require('./order-creation-recovery-browser.cjs')({page, sqlite, base, navigate});
    await navigate('Orders');
    await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
    await navigate('Billing');
    const surface = page.getByRole('region', { name: 'SEIKO billing', exact: true });
    await surface.getByRole('button', { name: 'Record payment', exact: true }).click();
    await page.getByRole('button', { name: /Smoke School · SMOKE-001 · Received/ }).click();
    const form = page.getByRole('dialog', { name: 'Record payment · SMOKE-001', exact: true });
    await form.getByLabel('Amount received ₹', { exact: true }).fill('60');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    const receipt = page.frameLocator('iframe[title="Billing print preview"]');
    await receipt.getByText('Against order', { exact: false }).first().waitFor();
    const text = await receipt.locator('body').innerText();
    assert.match(text, /SMOKE-001/); assert.match(text, /₹60.00/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seiko_billing_payments').get().n, 1);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await surface.getByRole('button', { name: '← Back to Home', exact: true }).click();
    assert.equal(await surface.count(), 0);
    await navigate('(Home|Overview)');
    await page.getByText('ACTIVE ORDERS', { exact: true }).first().waitFor();
    if (process.argv.includes('--order-workflows')) await require('./order-workflows-browser.cjs')({ page, browser, sqlite, order, seed, navigate, base, ordersApi, session, errors });
    if (process.argv.includes('--order-workflows')) await require('./order-cache-browser.cjs')({ page, sqlite, navigate, ordersApi, base });
    if (process.argv.includes('--order-workflows')) await require('./billing-production-browser.cjs')({page,billing,sqlite,navigate,base});
    assert.deepEqual(errors, []);
    console.log('PASS: Home → Orders → Billing → order payment → persisted receipt → Back/Home; no page errors.');
  } finally {
    await browser?.close(); sqlite.close(); server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
