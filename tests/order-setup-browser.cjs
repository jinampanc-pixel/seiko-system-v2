const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm'); const ts = require('typescript'); const { DatabaseSync } = require('node:sqlite');
function load(path, imports = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => imports[name], crypto, Response, Request, TextEncoder }); return exports; }

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(fs.readFileSync('drizzle/0001_erp_foundation.sql', 'utf8'));
  const db = { withSession() { return this; }, prepare(sql) { const stmt = sqlite.prepare(sql); let args = []; return { bind(...values) { args = values; return this; }, async run() { return stmt.run(...args); }, async first() { return stmt.get(...args) || null; }, async all() { return { results: stmt.all(...args) }; } }; } };
  const api = load('app/api/erp/orders/route.ts', { 'cloudflare:workers': { env: { DB: db } }, '../../../lib/order-statuses': load('app/lib/order-statuses.ts'), '../../../lib/server-erp-auth': { authenticateActor: async () => ({ userId: 'test-owner', email: 'test@example.invalid' }), authorizePermission: async () => ({ role: 'owner' }) } });
  await page.route('**/api/erp/orders', async route => { const response = await api.POST(new Request('http://127.0.0.1:5176/api/erp/orders', { method: 'POST', body: route.request().postData() })); await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }); });
  const session = { user: { displayName: 'Test owner', email: 'test@example.invalid' }, businesses: [{ businessId: 'seiko', businessName: 'SEIKO', role: 'owner', modules: ['home', 'orders'], permissions: ['orders.view', 'orders.create', 'orders.edit'] }] };
  await page.route('**/api/erp/session', route => route.fulfill({ json: { ok: true, data: session } }));
  await page.route('**/api/seiko', route => route.fulfill({ json: { ok: true, data: session } }));
  await page.goto('http://127.0.0.1:5176/tests/packing-browser/index.html?orders');await page.getByRole('button',{name:'+ New order',exact:true}).click();
  const create=page.getByRole('button',{name:'Create workspace',exact:true}).first();await create.click();assert.match(await page.getByRole('alert').innerText(),/Client name is required/);assert.match(await page.getByRole('alert').innerText(),/Phone number is required/);
  await page.locator('.clientDetails label').filter({has:page.locator('span',{hasText:/^Client name \*$/})}).locator('input').fill('Regression Client');await create.click();assert.match(await page.getByRole('alert').innerText(),/Phone number is required/);
 await page.locator('.clientDetails input[type=tel]').fill('   ');await create.click();assert.match(await page.getByRole('alert').innerText(),/Phone number is required/);
 await page.locator('.clientDetails input[type=tel]').fill('+91 90000 00000');
  const cards=page.locator('.productPolicy');await cards.first().getByRole('combobox',{name:'Product',exact:true}).fill('Pant');
 await cards.first().getByRole('button',{name:'+ Measurement',exact:true}).click();
  const name=cards.first().getByRole('combobox',{name:'Measurement',exact:true});await name.pressSequentially('Waist',{delay:35});await page.waitForTimeout(150);assert.equal(await name.inputValue(),'Waist','typing survives setup enhancement rerenders');
 await cards.first().getByRole('combobox',{name:'Measurement requirement'}).selectOption('Always');
 await page.getByRole('button',{name:'+ Product',exact:true}).click();await cards.nth(1).getByRole('combobox',{name:'Product',exact:true}).fill('Shirt');
 await cards.nth(1).getByRole('button',{name:'+ Measurement',exact:true}).click();await cards.nth(1).getByRole('combobox',{name:'Measurement',exact:true}).fill('Sleeve');
 await cards.nth(1).getByRole('button',{name:'+ Measurement',exact:true}).click();await cards.nth(1).getByRole('combobox',{name:'Measurement',exact:true}).nth(1).fill('Temporary');
 await cards.nth(1).getByRole('button',{name:'Remove Temporary from Shirt',exact:true}).click();assert.equal(await cards.nth(1).locator('.productMeasurementRow').count(),1);assert.equal(await name.inputValue(),'Waist');
  await create.click();await page.locator('.workspacePage').waitFor();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('jinam:seiko:orders-v1'))[0]);assert.equal(saved.details.contactNumber,'+91 90000 00000');assert.equal(saved.measurements.length,2);
 assert.equal(JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id = ?').get(saved.orderId).document_json).details.contactNumber, '+91 90000 00000');
 const pant=saved.products.find(p=>p.name==='Pant'),shirt=saved.products.find(p=>p.name==='Shirt');assert.deepEqual(saved.measurements.find(m=>m.name==='Waist').appliesTo,[pant.id]);assert.equal(saved.measurements.find(m=>m.name==='Waist').requiredMode,'Always');assert.deepEqual(saved.measurements.find(m=>m.name==='Sleeve').appliesTo,[shirt.id]);
 await page.reload();await page.getByRole('button',{name:'Open order',exact:true}).click();await page.getByRole('button',{name:'More order actions'}).click();await page.getByRole('button',{name:'Edit setup',exact:true}).click();assert.equal(await page.locator('.productMeasurementRow').count(),2);assert.equal(await page.getByRole('combobox',{name:'Measurement',exact:true}).first().inputValue(),'Waist');
 assert.deepEqual(errors,[]);await page.screenshot({path:'work/order-setup-fixed.png',fullPage:true});console.log('PASS: required client/phone, whitespace rejection, add/type/change/remove per-product measurements, saved assignments and reopen.');await browser.close();sqlite.close();
})().catch(e=>{console.error(e);process.exit(1)});
