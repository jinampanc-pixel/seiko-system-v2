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
    // Exact class matching must not include class 13, and mixed groups keep one numbering sequence.
    const selection = await context(null);
    await selection.page.goto(`${base}/tests/packing-browser/index.html?selection`);
    await selection.page.getByRole('button', { name: 'Save label set', exact: true }).waitFor();
    const editor = selection.page.getByRole('application', { name: 'Packing label editor', exact: true });
    assert.equal(await selection.page.locator('.physicalViewControls').getAttribute('open'),null);
    assert.equal(await selection.page.locator('.physicalFilterControls').getAttribute('open'),null);
    await selection.page.locator('.physicalFilterControls>summary').click();
    await selection.page.getByLabel('Label filter field', { exact: true }).selectOption('field:class');
    await selection.page.getByLabel('Label filter value', { exact: true }).selectOption('3');
    await selection.page.getByRole('button', { name: 'Only matching', exact: true }).click();
    assert.equal(Number(await editor.getAttribute('data-selected-count')), 42);
    await selection.page.getByLabel('Label filter value', { exact: true }).selectOption('BV');
    await selection.page.getByRole('button', { name: 'Add matching', exact: true }).click();
    assert.equal(Number(await editor.getAttribute('data-selected-count')), 44);
    await selection.page.getByLabel('Label filter value', { exact: true }).selectOption('8A');
    await selection.page.locator('.physicalRecord input[type=checkbox]').first().check();
    assert.equal(Number(await editor.getAttribute('data-selected-count')), 45);
    // Changing filters alone never discards the selection from other classes.
    await selection.page.getByLabel('Label filter value', { exact: true }).selectOption('3');
    assert.equal(Number(await editor.getAttribute('data-selected-count')), 45);
    await selection.page.getByRole('button', { name: 'Save label set', exact: true }).click();
    const selectedTask = await selection.page.evaluate(() => JSON.parse(localStorage.getItem('jinam:seiko:labels:tasks-v1')).at(-1));
    assert.equal(selectedTask.selectedRows.length, 45);
    assert.equal(new Set(selectedTask.selectedRows).size, 45);
    await selection.page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const labels = selection.page.locator('.physicalPrintedLabel');
    assert.equal(await labels.count(), 45);
    for (let index = 0; index < 45; index++) {
      assert.ok((await labels.nth(index).textContent()).includes(`${index + 1} of 45`));
    }
    for (const width of [390, 1280]) {
      await selection.page.setViewportSize({ width, height: 900 });
      assert.ok(await selection.page.getByLabel('Label filter value', { exact: true }).isVisible());
      assert.ok((await selection.page.locator('.physicalRecordFilters').boundingBox()).width < width);
    }
    await selection.page.locator('.physicalFilterControls>summary').click();
    assert.equal(await selection.page.getByLabel('Label filter field',{exact:true}).isVisible(),false);
    assert.match(await selection.page.locator('.physicalFilterControls>summary').innerText(),/1 applied/);
    assert.equal(Number(await editor.getAttribute('data-selected-count')),45);
    await selection.page.locator('.physicalFilterControls>summary').click();
    await selection.page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await selection.page.getByRole('button', {name:'+ Filter',exact:true}).click();
    await selection.page.getByLabel('Label filter field 2',{exact:true}).selectOption('field:gender');
    await selection.page.getByLabel('Label filter value 2',{exact:true}).selectOption('Female');
    await selection.page.getByRole('button',{name:'Only matching',exact:true}).click();
    assert.equal(Number(await editor.getAttribute('data-selected-count')),21);
    const mixed=await context(null);
    await mixed.page.goto(`${base}/tests/packing-browser/index.html?selection&multi`);
    const multiEditor=mixed.page.getByRole('application',{name:'Packing label editor',exact:true});
    await mixed.page.getByRole('button',{name:'Save label set',exact:true}).waitFor();
    assert.equal(Number(await multiEditor.getAttribute('data-selected-count')),52);
    await mixed.page.getByRole('button',{name:'Save label set',exact:true}).click();
    const multiTask=await mixed.page.evaluate(()=>JSON.parse(localStorage.getItem('jinam:seiko:labels:tasks-v1')).at(-1));
    assert.equal(multiTask.orderIds.length,2);assert.equal(new Set(multiTask.selectedRows).size,52);
    await mixed.page.getByRole('button',{name:'Customize label information',exact:true}).click();
    await mixed.page.getByRole('dialog').getByRole('checkbox',{name:'Client',exact:true}).check();
    await mixed.page.getByRole('dialog').getByRole('button',{name:'Apply',exact:true}).click();
    await mixed.page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    const mixedLabels=mixed.page.locator('.physicalPrintedLabel');
    assert.equal(await mixedLabels.count(),52);
    assert.ok((await mixedLabels.last().textContent()).includes('Factory B'));
    assert.ok((await mixedLabels.last().textContent()).includes('52 of 52'));
    const contextual=await context(null);
    await contextual.page.goto(`${base}/tests/packing-browser/index.html?label-orders&selection&multi&order=quantity-regression`);
    await contextual.page.getByRole('heading',{name:'Create labels',exact:true}).waitFor();
    assert.equal(await contextual.page.locator('.labelCreateOrderChoice select').first().isDisabled(),true);
    assert.equal(await contextual.page.locator('.labelSourceOrders').count(),0);
    const general=await context(null);
    await general.page.goto(`${base}/tests/packing-browser/index.html?label-orders&selection&multi`);
    await general.page.getByRole('heading',{name:'Create labels',exact:true}).waitFor();
    await general.page.locator('.labelCreateOrderChoice select').first().selectOption('quantity-regression');
    await general.page.locator('.labelSourceOrders summary').click();
    await general.page.locator('.labelSourceOrders input').check();
    await general.page.getByRole('button',{name:'Continue to designer',exact:true}).click();
    await general.page.locator('.labelProductSelection').waitFor();
    for(const box of await general.page.locator('.labelProductSelection input').all())await box.uncheck();
    const pantBoxes=general.page.locator('.labelProductSelection label').filter({hasText:/^Pant/}).getByRole('checkbox');
    assert.equal(await pantBoxes.count(),2);
    for(const box of await pantBoxes.all())await box.check();
    await general.page.locator('.labelSidebar .panelHead button').click();
    assert.equal(await general.page.locator('.printSheet .printedLabel').count(),52);
    const codes=await general.page.locator('.printSheet .fakeQr').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
    assert.equal(new Set(codes).size,52);
    assert.ok(codes.some(code=>code.includes('another-order')));
    assert.deepEqual(errors, []);
    console.log('Shared label browser workflows passed: browser adoption, fresh device, version conflict, tombstone and offline recovery.');
  } finally { await browser?.close(); sqlite.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
