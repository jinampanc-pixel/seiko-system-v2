const uiLabel=require("./ui-label.cjs");
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
    if(name==="./measurement-entry-grid")return load("app/lib/measurement-entry-grid.ts",{"./order-domain":imports["./order-domain"]});
    if(name==="./packing-label-model"&&!imports[name])return load("app/lib/packing-label-model.ts",{"./order-domain":imports["./order-domain"]});
    if(name.endsWith("server-order-sheets"))return {syncOrderSheet:async()=>{},orderSheetLink:async()=>({synced_at:new Date().toISOString()})};
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  }, crypto, Response, Request, URL, TextDecoder, TextEncoder, Uint8Array, atob, btoa, ReadableStream });
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
    const commercialModel=load('app/lib/order-commerce.ts',{'./order-domain':domain});
    const order = {
      orderId: 'smoke-order', status: 'Active', archived: false,
      details: { orderNo: 'SMOKE-001', clientName: 'Smoke School', contactNumber: '9999999999',
        billTo: 'Test address', orderDate: '2026-10-03', deliveryDate: '', clientType: 'School / Institution',
        contactPerson: '', attnRequired: false, shipTo: '', remarks: '' },
      products: [{ ...domain.blankProduct(), id: 'vest', name: 'Vest', quantityMode: 'per_person', defaultQuantity: 0 }],
      fields: [{ ...domain.field("Name"), id: "name" }], measurements: [], records: [{ recordId: 'one', personId: 'one', values: { 'field:name': 'Original name', 'product:vest:qty': 2 } }],
      revisions: [], updatedAt: '2026-10-03T00:00:00Z',
    };
    order.products[0].specifications=[{...domain.blankSpecification(),id:'fixture-size',name:'Size',defaultValue:'M',required:false}];
    for (const file of fs.readdirSync('migrations').sort()) sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'));
    const db = { withSession() { return this; }, async batch(statements){sqlite.exec("BEGIN");try{const results=statements.map(stmt=>stmt.runSync());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}}, prepare(sql) {
      const stmt = sqlite.prepare(sql); let args = [];
      return { bind(...values) { args = values; return this; }, runSync() { return { meta: { changes: Number(stmt.run(...args).changes) } }; }, async run() { return this.runSync(); },
        async first() { return stmt.get(...args) || null; }, async all() { return { results: stmt.all(...args) }; } };
    } };
    const auth = { authenticateActor: async () => ({ userId: 'smoke-owner', email: 'smoke@example.invalid' }), authorizePermission: async () => ({ role: 'owner' }) };
    const ordersApi = load('app/api/erp/orders/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/server-erp-auth': auth, '../../../lib/order-statuses': load('app/lib/order-statuses.ts'),'../../../lib/order-commerce':commercialModel,
    });
    const seed = async value => {
      const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: JSON.stringify({ operation: 'upsert', businessId: 'seiko', order: value }) }));
      assert.equal(response.status, 200, await response.text());
    };
    await seed(order);
    if (process.argv.includes('--large-orders')) {
      for (let i = 1; i <= 1000; i++) {
        const value = structuredClone(order);
        value.orderId = `scale-${String(i).padStart(4, '0')}`;
        value.details.orderNo = `SCALE-${String(i).padStart(4, '0')}`;
        value.details.clientName = `Synthetic client ${i}`;
        if (i === 1000) value.status = 'Production';
        value.records = Array.from({ length: 100 }, (_, n) => ({ ...structuredClone(order.records[0]), recordId: `person-${n}`, personId: `person-${n}` }));
        value.records[0].values['field:name'] = `Unique-person-${i}`;
        await seed(value);
      }
      // Make the newest fixture deterministic even when several inserts share a millisecond.
      const newest = new Date(Date.now() + 1000).toISOString();
      sqlite.prepare("UPDATE erp_orders SET updated_at = ?, document_json = json_set(document_json, '$.updatedAt', ?) WHERE id = ?").run(newest, newest, 'scale-1000');
    }
    const billing = load('app/api/erp/billing/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/seiko-billing': load('app/lib/seiko-billing.ts'), '../../../lib/billing-profile': load('app/lib/billing-profile.ts'),
      '../../../lib/server-erp-auth': auth,
    });
    const orderBilling=load('app/api/erp/order-billing/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../../../lib/invoice-order-brief':load('app/lib/invoice-order-brief.ts',{'./order-commerce':commercialModel,'./order-domain':domain,'./seiko-billing':load('app/lib/seiko-billing.ts')}),'../../../lib/billing-profile':load('app/lib/billing-profile.ts'),'../../../lib/order-commerce':commercialModel,'../../../lib/seiko-billing':load('app/lib/seiko-billing.ts')});
    const billingProfile = load('app/api/erp/billing-profile/route.ts', { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/billing-profile': load('app/lib/billing-profile.ts'), '../../../lib/server-erp-auth': auth });
    const artwork=load('app/api/erp/artwork/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth});
    const orderEvidence=load('app/api/erp/order-evidence/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth});
    const people=load('app/api/erp/people/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../../../lib/order-commerce':commercialModel,'../../../lib/order-domain':domain,'../../../lib/seiko-billing':load('app/lib/seiko-billing.ts')});
    const search=load('app/api/erp/search/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../people/route':people,'../../../lib/seiko-billing':load('app/lib/seiko-billing.ts')});
    const clients = load('app/api/erp/clients/route.ts', {
      'cloudflare:workers': { env: { DB: db } }, '../../../lib/seiko-clients': load('app/lib/seiko-clients.ts'),
      '../../../lib/server-erp-auth': auth,
    });
    browser = await chromium.launch({ headless: true, ...(process.env.TEST_DOWNLOAD_DIR?{downloadsPath:process.env.TEST_DOWNLOAD_DIR}:{}), ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({acceptDownloads:true,...(process.argv.includes("--mobile-device")?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})}); const errors = []; const diagnostics=[]; page.on("console",m=>{if(m.type()==="error")diagnostics.push(m.text());}); page.on("requestfailed",r=>diagnostics.push(r.url()+" "+r.failure()?.errorText));
    page.on('pageerror', error => errors.push(error.message));
    const session = { user: { displayName: 'Smoke Owner', email: 'smoke@example.invalid' }, businesses: [{
      businessId: 'seiko', businessName: 'SEIKO', logoUrl: load('app/lib/business-catalog.ts').businessCatalogEntry('seiko').logoUrl, role: 'owner',
      modules: ['home', 'orders', 'labels', 'scan', 'trace', 'production', 'billing', 'admin'],
    }] };
    await page.route('**/api/erp/session', route => route.fulfill({ json: { ok: true, data: session } }));
    await page.route('**/api/seiko', route => route.fulfill({ json: { ok: true, data: session } }));
    await page.route("**/api/erp/order-sheets",route=>route.fulfill({json:{ok:true,connection:{configured:false,connected:false,accountEmail:""},canConnect:true,canCreate:true,link:null}}));
    await page.route('**/api/erp/orders', async route => {
      const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    const productionDomain=load('app/lib/production-handoffs.ts',{'./order-domain':domain,'./packing-label-model':load('app/lib/packing-label-model.ts',{'./order-domain':domain})});
    const production=load('app/api/erp/production/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth,'../../../lib/production-handoffs':productionDomain});
    const activity=load('app/api/erp/activity/route.ts',{'cloudflare:workers':{env:{DB:db}},'../../../lib/server-erp-auth':auth});
    const labels = load('app/api/erp/labels/route.ts', { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/server-erp-auth': auth });
    await page.route('**/api/erp/artwork?*',async route=>{
      const request=new Request(route.request().url(),{method:route.request().method(),headers:route.request().headers(),...(route.request().method()==='POST'?{body:route.request().postDataBuffer()}: {})});
      const response=await (request.method==='POST'?artwork.POST(request):artwork.GET(request));
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    });
    await page.route('**/api/erp/order-evidence?*',async route=>{const r=route.request();const response=r.method()==='GET'?await orderEvidence.GET(new Request(r.url())):await orderEvidence.POST(new Request(r.url(),{method:'POST',headers:r.headers(),body:r.postDataBuffer()}));await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
    await page.route('**/api/erp/billing-profile?asset=*',async route=>{
      const response=await billingProfile.GET(new Request(route.request().url()));
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    });
    await page.route('**/api/erp/activity?*',async route=>{const response=await activity.GET(new Request(route.request().url()));await route.fulfill({status:response.status,json:await response.json()});});
    for (const [path, api] of [['activity',activity],['search',search],['people',people],['order-billing',orderBilling],['billing-profile', billingProfile], ['billing', billing], ['clients', clients], ['labels', labels], ['production',production]]) {
      await page.route(`**/api/erp/${path}`, async route => {
        const response = await api.POST(new Request(`${base}/api/erp/${path}`, { method: 'POST', body: route.request().postData() }));
        await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      });
    }
    await page.addInitScript(value => {
      if (window.top !== window || localStorage.getItem('jinam:seiko:orders-v1') !== null) return;
      localStorage.setItem('jinam:selected-business', 'seiko');
      localStorage.setItem('jinam:seiko:orders-v1', JSON.stringify([value]));
    }, order);
    await page.goto(`${base}/tests/packing-browser/smoke.html`);
    try { await page.getByRole('button', { name: uiLabel('Open menu', true), exact: true }).waitFor({ timeout: 10000 }); }
    catch { throw new Error(`Application did not mount: ${JSON.stringify(errors)}. ${JSON.stringify(diagnostics)} ${serverOutput} ${await page.locator('body').innerText()}`); }
    const navigate = async name => {
      const moduleMenu=page.getByRole('button',{name:uiLabel('Open billing navigation', true),exact:true});
      if(await moduleMenu.isVisible())await moduleMenu.click();
      else await page.getByRole('button', { name: uiLabel('Open menu', true), exact: true }).click();
      await page.getByRole('navigation', { name: uiLabel('Modules', false) }).getByRole('button', { name: uiLabel(new RegExp(`${name}$`), false) }).click();
    };
    if (process.argv.includes('--large-orders')) {
      const started = Date.now();
      const home = page.locator('.seikoOperationalDashboard');
      const list = home.getByRole('region', {name: uiLabel('Home orders', true), exact:true});
      await list.locator('.homeOrderOpen').first().waitFor();
      await page.waitForFunction(()=>document.querySelector('.homeOrderScroll .homeOrderOpen')?.textContent.includes('SCALE-1000'));
      assert.match(await list.locator('.homeOrderOpen').first().innerText(), /SCALE-1000/);
      assert.equal(await home.getByRole('button',{name:uiLabel('Next', true),exact:true}).count(),0);
      assert.equal(await home.getByLabel(uiLabel('Search Home orders', false)).count(),0);
      assert.equal(await home.getByLabel(uiLabel('Visible rows', false)).count(),0);
      await home.getByRole('button',{name:uiLabel('Filter orders', true),exact:true}).click();
      await home.getByLabel(uiLabel('Visible rows', false)).selectOption('5');
      await home.getByRole('button',{name:uiLabel('Filter orders', true),exact:true}).click();
      assert.ok(await list.locator('article').count()<=9);
      await list.evaluate(node=>node.scrollTop=node.scrollHeight);
      await list.locator('.homeOrderOpen').filter({hasText:'SMOKE-001'}).waitFor();
      await home.getByRole('button',{name:uiLabel('Search orders', true),exact:true}).click();
      await home.getByLabel(uiLabel('Search Home orders', false)).fill('Unique-person-1000');
      await home.getByRole('button',{name:uiLabel('Submit order search', true),exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.homeOrderScroll article').length===1);
      assert.match(await list.innerText(),/SCALE-1000/);
      await home.getByLabel(uiLabel('Search Home orders', false)).fill('no-such-order-parameter');
      await list.getByText(uiLabel('No orders match your search or filters.', false)).waitFor();
      await home.getByLabel(uiLabel('Search Home orders', false)).fill('');
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>document.querySelector('.homeOrderScroll article')?.getBoundingClientRect().height===184);
      assert.ok(await list.locator('article').count()<=9);
      if(process.env.SEIKO_HOME_SCREENSHOT){await home.locator('.homeOrderSearch').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.SEIKO_HOME_SCREENSHOT,fullPage:false});}
      await page.setViewportSize({width:1280,height:900});
      await home.getByRole('button',{name:uiLabel('Filter orders', true),exact:true}).click();
      await home.getByLabel(uiLabel('Visible rows', false)).selectOption('10');

      await navigate('Orders');
      await page.getByPlaceholder('Search order, client, type or status').fill('SCALE-1000');
      await page.locator('.orderRow').filter({ hasText: 'SCALE-1000' }).waitFor({ timeout: 30000 });
      assert.equal(await page.locator('.orderRow').count(), 1);
      await page.getByPlaceholder('Search order, client, type or status').fill('Unique-person-1000');
      await page.locator('.orderRow').filter({ hasText: 'SCALE-1000' }).waitFor();
      assert.equal(await page.locator('.orderRow').count(), 1);
      await page.getByPlaceholder('Search order, client, type or status').fill('');
      await page.waitForFunction(() => document.querySelectorAll('.orderRow').length === 10);
      await page.getByRole('button', { name: uiLabel('Open order filters', true), exact: true }).click();
      await page.locator('.orderAdvancedFilter.status select').selectOption('Production');
      await page.waitForFunction(() => document.querySelectorAll('.orderRow').length === 1);
      await page.locator('.orderRow').filter({ hasText: 'SCALE-1000' }).waitFor();
      await page.getByRole('button', { name: uiLabel('Clear all', true), exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.orderRow').length === 10);
      await page.getByRole('button', { name: uiLabel('Next', true), exact: true }).click();
      assert.equal(await page.locator('.orderRow').count(), 10);
      if (process.env.SEIKO_SCALE_SCREENSHOT) await page.screenshot({ path: process.env.SEIKO_SCALE_SCREENSHOT, fullPage: false });
      assert.deepEqual(errors, []);
      console.log(`PASS: 1,001 synthetic orders / 100,001 records; last-order search, bounded 10-row rendering and page navigation (${Date.now() - started} ms, local Chrome).`);
      return;
    }
    if(process.argv.includes('--save-print')){await require('./save-print-browser.cjs')({page,navigate,seed,order});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--home-workspace')){await require('./home-workspace-browser.cjs')({page,navigate,seed,order});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--invoice-brief')){await require('./invoice-brief-browser.cjs')({page,seed,navigate,order,sqlite});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--dialog-ux')){await require('./dialog-interactions-browser.cjs')({page,navigate,base});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--order-rules')){await require('./order-rules-browser.cjs')({page,seed,navigate,order,sqlite,domain,sheetModel:load('app/lib/order-sheet-model.ts',{'./order-domain':domain})});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--responsive-audit')){await require('./responsive-audit-browser.cjs')({page,navigate,billing,base});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--google-sheets')){try{await require('./google-sheets-browser.cjs')({page,seed,navigate,order,sqlite,base});}catch(e){fs.mkdirSync('work/browser-failures',{recursive:true});fs.writeFileSync('work/browser-failures/sheets-failure.html',await page.content());await page.screenshot({path:'work/browser-failures/sheets-failure.png',fullPage:true});throw e;}assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--order-delivery')){try { await require('./order-delivery-browser.cjs')({page,seed,navigate,order,sqlite}); } catch(error) { fs.mkdirSync('work/browser-failures',{recursive:true});require('node:fs').writeFileSync('work/browser-failures/delivery-failure.html',await page.content()); await page.screenshot({path:'work/browser-failures/delivery-failure.png',fullPage:true}); throw error; }assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--order-service')){await require('./order-service-browser.cjs')({page,seed,navigate,order,sqlite,base});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--production-pagination')){await require('./production-pagination-browser.cjs')({page,seed,navigate});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--production-handoffs')){try{await require('./production-handoff-browser.cjs')({page,seed,navigate,base,production});}catch(error){fs.mkdirSync('work/browser-failures',{recursive:true});fs.writeFileSync('work/browser-failures/production-failure.html',await page.content());await page.screenshot({path:'work/browser-failures/production-failure.png',fullPage:true});throw error;}assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--shared-measurements')){await require('./shared-measurements-browser.cjs')({page,sqlite,seed,navigate,order,base,domain,sheetModel:load('app/lib/order-sheet-model.ts',{'./order-domain':domain})});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--artwork')){await require('./artwork-browser.cjs')({page,seed,navigate,order,sqlite,domain});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--billing-assets')){await require('./billing-assets-browser.cjs')({page,billing,sqlite,navigate,base,printing:load('app/lib/seiko-billing-print.ts',{'./seiko-billing':load('app/lib/seiko-billing.ts')})});assert.deepEqual(errors,[]);return;}
    if(process.argv.includes('--billing-production')){
      const second=structuredClone(order);second.orderId='second-order';second.details.orderNo='SECOND-002';second.details.clientName='Other School';
      await seed(second);await navigate('Orders');await page.locator('.orderRow').filter({hasText:'SECOND-002'}).waitFor();
      await require('./billing-production-browser.cjs')({page,billing,sqlite,navigate,base,seed,order});assert.deepEqual(errors,[]);return;
    }
    await require('./order-creation-recovery-browser.cjs')({page, sqlite, base, navigate});
    await navigate('Orders');
    await page.getByRole('heading', { name: uiLabel('Orders', true), exact: true }).waitFor();
    await navigate('Billing');
    const surface = page.getByRole('region', { name: uiLabel('SEIKO billing', true), exact: true });
    await surface.getByRole('button', { name: uiLabel('Record payment', true), exact: true }).click();
    await page.getByRole('button', { name: uiLabel(/Smoke School · SMOKE-001 · Received/, false) }).click();
    const form = page.getByRole('dialog', { name: uiLabel('Record payment · SMOKE-001', true), exact: true });
    await form.getByLabel(uiLabel('Amount received ₹', true), { exact: true }).fill('60');
    await form.getByRole('button', { name: uiLabel('Save and print', true), exact: true }).click();
    const receipt = page.frameLocator('iframe[title="Billing print preview" i]');
    await receipt.getByText(uiLabel('Against order', false), { exact: false }).first().waitFor();
    const text = await receipt.locator('body').innerText();
    assert.match(text, /SMOKE-001/); assert.match(text, /₹60.00/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seiko_billing_payments').get().n, 1);
    await page.getByText(uiLabel('Document actions', true),{exact:true}).click();await page.getByRole('button',{name:uiLabel('Amend receipt', true),exact:true}).click();
    const amendReceipt=page.getByRole('dialog',{name:uiLabel(/Amend Receipt · RCP-/, true)});
    await amendReceipt.getByLabel(uiLabel('Amount received ₹', true),{exact:true}).fill('55');
    await amendReceipt.getByLabel(uiLabel('Reference / transaction ID', true),{exact:true}).fill('Corrected reference');
    await amendReceipt.getByRole('button',{name:uiLabel('Save and print', true),exact:true}).click();
    await receipt.getByText(uiLabel('₹55.00', true),{exact:true}).first().waitFor();
    const correctedReceipt=JSON.parse(sqlite.prepare('SELECT data FROM seiko_billing_payments').get().data);
    assert.equal(correctedReceipt.amount,55);assert.equal(correctedReceipt.reference,'Corrected reference');assert.equal(correctedReceipt.revision,1);assert.ok(correctedReceipt.receiptNumber.startsWith('RCP-'));
    await page.getByRole('button', { name: uiLabel('Close', true), exact: true }).click();
    await surface.getByRole('button', { name: uiLabel('← Back', true), exact: true }).click();
    assert.equal(await surface.count(), 0);
    await navigate('(Home|Overview)');
    await page.getByText(uiLabel('ACTIVE ORDERS', true), { exact: true }).first().waitFor();
    if (process.argv.includes('--handover')) await require('./order-handover-browser.cjs')({page,sqlite,order,seed,navigate});
    if (process.argv.includes('--order-workflows')) await require('./order-workflows-browser.cjs')({ page, browser, sqlite, order, seed, navigate, base, ordersApi, session, errors });
    if (process.argv.includes('--order-workflows')) await require('./order-cache-browser.cjs')({ page, sqlite, navigate, ordersApi, base });
    if (process.argv.includes('--order-workflows')) await require('./billing-production-browser.cjs')({page,billing,sqlite,navigate,base,seed,order});
    if (process.argv.includes('--order-workflows')) try{await require('./production-handoff-browser.cjs')({page,seed,navigate,base,production});}catch(error){fs.mkdirSync('work/browser-failures',{recursive:true});fs.writeFileSync('work/browser-failures/production-failure.html',await page.content());await page.screenshot({path:'work/browser-failures/production-failure.png',fullPage:true});throw error;}
    assert.deepEqual(errors, []);
    console.log('PASS: Home → Orders → Billing → order payment → persisted receipt → Back/Home; no page errors.');
  } finally {
    await browser?.close(); sqlite.close(); server?.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
