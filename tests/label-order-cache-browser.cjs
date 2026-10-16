const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

(async () => {
  const base = 'http://127.0.0.1:5185';
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/packing-browser/vite.config.mjs', '--port', '5185'], { stdio: 'pipe' });
  let output = ''; let browser;
  server.stdout.on('data', data => output += data); server.stderr.on('data', data => output += data);
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(`${base}/tests/packing-browser/index.html`)).ok) break; } catch { /* starting */ }
      if (attempt > 60 || server.exitCode !== null) throw Error(output);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/erp/preferences', route => route.fulfill({ json: { ok: true, data: {} } }));
    await page.goto(`${base}/tests/packing-browser/index.html?label-orders&business=seiko`);
    const picker = page.locator('.labelCreateOrderChoice select');
    await picker.getByRole('option', { name: /Packing label validation/ }).waitFor({ state: 'attached' });
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('jinam:seiko:orders-v1')));
    // Simulate ErpOrderSync finishing after the picker mounted, while the old
    // persisted order list cannot be overwritten because browser storage is full.
    await page.evaluate(async initial => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'jinam:seiko:orders-v1') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      const fresh = structuredClone(initial[0]);
      fresh.orderId = 'follow-up-fixture'; fresh.details.orderNo = 'FOLLOW-UP'; fresh.details.clientName = 'Follow-up only';
      const archived = structuredClone(fresh); archived.orderId = 'archived-fixture'; archived.archived = true;
      const { writeOrderCache } = await import('/app/lib/order-cache.ts');
      writeOrderCache('seiko', [fresh, archived, ...initial]);
    }, initial);
    await picker.getByRole('option', { name: 'FOLLOW-UP — Follow-up only', exact: true }).waitFor({ state: 'attached' });
    assert.equal(await picker.locator('option[value="archived-fixture"]').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jinam:seiko:orders-v1')).length), initial.length);
    const search = page.getByRole('searchbox', { name: 'Search orders by order number, client, attention name or phone number' });
    await search.fill('Follow-up only');
    await page.getByRole('button', { name: /FOLLOW-UP — Follow-up only/ }).click();
    assert.equal(await picker.inputValue(), 'follow-up-fixture');
    await page.getByRole('button', { name: 'Production ⌄', exact: true }).click();
    await page.getByRole('option', { name: 'Packing', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to designer', exact: true }).click();
    await page.locator('.physicalPackingEditor').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: delayed shared orders remain searchable and open in packing designer when browser storage is full; archived orders stay hidden.');
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
