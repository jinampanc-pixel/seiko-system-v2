const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

(async () => {
  const base = 'http://127.0.0.1:5182';
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/packing-browser/vite.config.mjs', '--port', '5182'], { stdio: 'pipe' });
  let output = ''; server.stdout.on('data', data => output += data); server.stderr.on('data', data => output += data);
  const sqlite = new DatabaseSync(':memory:'); let browser;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(`${base}/tests/packing-browser/index.html`)).ok) break; } catch { /* starting */ }
      if (attempt > 60 || server.exitCode !== null) throw new Error(`Browser fixture failed to start: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
    const db = { withSession() { return this; }, prepare(sql) {
      const statement = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, async run() { return { meta: { changes: Number(statement.run(...args).changes) } }; }, async all() { return { results: statement.all(...args) }; } };
    } };
    const api = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/erp/labels/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: api, Response, Request, URL, TextDecoder, Uint8Array,
      require(name) { return name === 'cloudflare:workers' ? { env: { DB: db } } : { authenticateActor: async () => ({ email: 'fixture@example.invalid' }), authorizePermission: async () => ({ role: 'owner' }) }; },
    });
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const errors = [];
    const context = async (initial, openTask) => {
      const context = await browser.newContext(); let unavailable = false;
      await context.route('**/api/erp/labels', async route => {
        if (unavailable) return route.fulfill({ status: 503, json: { ok: false, message: 'Fixture storage unavailable; local changes retained.' } });
        const response = await api.POST(new Request(`${base}/api/erp/labels`, { method: 'POST', body: route.request().postData() }));
        await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      });
      await context.addInitScript(({ initial, openTask }) => {
        if (initial && !localStorage.getItem('fixture-seeded')) { for (const [key, value] of Object.entries(initial)) localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('fixture-seeded', '1'); }
        if (openTask) sessionStorage.setItem('jinam:seiko:labels:open-task', openTask);
      }, { initial, openTask });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      return { page, context, offline(value) { unavailable = value; } };
    };
    const key = 'jinam:seiko:labels:tasks-v1';
    const legacy = { id: 'legacy-fixture', name: 'Browser only', unknownFutureField: { preserved: true } };
    const preset = { id: 'preset-fixture', name: 'Custom size', width: 50, height: 25, unknownFutureField: true };
    const oldLayout = { id: 'layout-fixture', name: 'Old v2 layout', unknownFutureField: true };
    const first = await context({ [key]: [legacy], 'jinam:seiko:labels:presets-v1': [preset], 'jinam:seiko:labels:layouts-v2': [oldLayout] });
    await first.page.goto(`${base}/tests/packing-browser/index.html?shared`);
    await first.page.getByRole('button', { name: 'Save label set', exact: true }).waitFor();
    assert.deepEqual(JSON.parse(sqlite.prepare("SELECT document_json FROM erp_label_records WHERE collection='tasks-v1' AND id=?").get(legacy.id).document_json), legacy);
    assert.ok(await first.page.evaluate(() => localStorage.getItem('jinam:seiko:labels:browser-adoption-backup-v1')));
    await first.page.locator('.physicalPackageSummary:not(.physicalInfo)').getByRole('button', { name: 'Customize', exact: true }).click();
    for (const name of ['Kurti', 'Vest', 'T-Shirt', 'Track Pant']) await first.page.locator('.physicalProductChoices label').filter({ has: first.page.locator('b', { hasText: new RegExp(`^${name}$`) }) }).getByRole('checkbox').uncheck();
    await first.page.getByRole('button', { name: 'Apply', exact: true }).click();
    await first.page.getByRole('button', { name: 'Save label set', exact: true }).click();
    await first.page.getByRole('status').filter({ hasText: 'Labels saved to shared storage.' }).waitFor();
    const row = sqlite.prepare("SELECT * FROM erp_label_records WHERE collection='tasks-v1' AND id<>?").get(legacy.id);
    const task = JSON.parse(row.document_json); assert.equal(task.orderId, 'quantity-regression'); assert.ok(task.items.length); assert.ok(task.selectedRows.length);
    const layoutSaved = first.page.waitForResponse(response => response.url().endsWith('/api/erp/labels') && response.request().postDataJSON().collection === 'templates-v1');
    await first.page.getByRole('button', { name: 'Save layout', exact: true }).click();
    assert.equal((await layoutSaved).status(), 200);
    assert.ok(sqlite.prepare("SELECT 1 FROM erp_label_records WHERE collection='presentation'").get());
    const fresh = await context(null, task.id);
    await fresh.page.goto(`${base}/tests/packing-browser/index.html?shared`);
    await fresh.page.getByRole('button', { name: 'Save label set', exact: true }).waitFor();
    const cached = await fresh.page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(cached.length, 2); assert.deepEqual(cached.find(item => item.id === legacy.id), legacy);
    const libraries = await fresh.page.evaluate(() => ({ presets: JSON.parse(localStorage.getItem('jinam:seiko:labels:presets-v1')), layouts: JSON.parse(localStorage.getItem('jinam:seiko:labels:layouts-v2')), templates: JSON.parse(localStorage.getItem('jinam:seiko:labels:templates-v1')) }));
    assert.deepEqual(libraries.presets, [preset]); assert.deepEqual(libraries.layouts, [oldLayout]);
    assert.equal(libraries.templates[0].designerKind, 'packing-person-v4'); assert.ok(libraries.templates[0].presentationRules);
    await fresh.page.emulateMedia({ media: 'print' });
    assert.equal(await fresh.page.locator('.labelStorageStatus').evaluate(node => getComputedStyle(node).display), 'none');
    await fresh.page.emulateMedia({ media: 'screen' });
    await fresh.page.getByRole('button', { name: 'Save label set', exact: true }).click();
    await fresh.page.getByRole('status').filter({ hasText: 'Labels saved to shared storage.' }).waitFor();
    assert.equal(sqlite.prepare('SELECT version FROM erp_label_records WHERE id=?').get(task.id).version, 2);
    await first.page.getByRole('button', { name: 'Save label set', exact: true }).click();
    await first.page.getByRole('status').filter({ hasText: 'changed on another device' }).waitFor();
    assert.equal(sqlite.prepare('SELECT version FROM erp_label_records WHERE id=?').get(task.id).version, 2);
    const pending = await first.page.evaluate(() => JSON.parse(localStorage.getItem('jinam:seiko:labels:shared-pending-v1')));
    assert.equal(pending.find(item => item.id === task.id).blocked, 409);
    const deletion = await api.POST(new Request(`${base}/api/erp/labels`, { method: 'POST', body: JSON.stringify({ businessId: 'seiko', operation: 'delete', collection: 'tasks-v1', id: legacy.id, expectedVersion: 1 }) }));
    assert.equal(deletion.status, 200);
    const stale = await context({ [key]: [legacy] }); await stale.page.goto(`${base}/tests/packing-browser/index.html?shared`);
    await stale.page.getByRole('button', { name: 'Save label set', exact: true }).waitFor();
    assert.equal((await stale.page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).some(item => item.id === legacy.id), false);
    const offline = await context({ [key]: [] }); offline.offline(true);
    await offline.page.goto(`${base}/tests/packing-browser/index.html?shared`);
    await offline.page.getByRole('button', { name: 'Save label set', exact: true }).click();
    assert.ok((await offline.page.evaluate(() => JSON.parse(localStorage.getItem('jinam:seiko:labels:shared-pending-v1')))).length);
    offline.offline(false); await offline.page.getByRole('button', { name: 'Retry label sync', exact: true }).click();
    await offline.page.waitForFunction(() => !JSON.parse(localStorage.getItem('jinam:seiko:labels:shared-pending-v1')).some(item => item.collection === 'tasks-v1'));
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM erp_label_records WHERE collection='tasks-v1' AND deleted=0").get().n, 2);
    assert.deepEqual(errors, []);
    console.log('Shared label browser workflows passed: browser adoption, fresh device, version conflict, tombstone and offline recovery.');
  } finally { await browser?.close(); sqlite.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
