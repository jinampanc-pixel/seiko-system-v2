const assert = require('node:assert/strict');

module.exports = async ({ page, browser, sqlite, order, seed, navigate, base, ordersApi, session }) => {
  const read = id => JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id = ?').get(id).document_json);
  const second = structuredClone(order); second.orderId = 'second-order'; second.details.orderNo = 'SECOND-002'; second.details.clientName = 'Other School';
  const disposable = structuredClone(order); disposable.orderId = 'delete-order'; disposable.details.orderNo = 'DELETE-003'; disposable.details.clientName = 'Deletion fixture';
  await seed(second); await seed(disposable);
  await page.reload(); await navigate('Orders');
  const row = number => page.locator('.orderRow').filter({ has: page.locator('b', { hasText: new RegExp(`^${number}$`) }) });
  const action = async (number, name) => {
    const target = row(number); const summary = target.locator('summary').first();
    await summary.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (!await target.locator('details').first().evaluate(node => node.open)) await summary.click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await target.locator('details').first().evaluate(node => node.open), true, `Menu opens for ${number}`);
    const bounds = await target.locator('.seikoRowActionPanel').boundingBox(); const viewport = page.viewportSize();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, `Menu fits viewport for ${number}`);
    await target.getByRole('button', { name, exact: true }).click();
  };
  for (const number of ['SMOKE-001', 'SECOND-002', 'DELETE-003']) {
    await row(number).getByLabel(`Status for ${number}`, { exact: true }).waitFor({ state: "visible" });
  }
  await page.locator('.orderRowClickable').first().waitFor();
  for (const width of [1860, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.locator('.orderRow').evaluateAll(rows => rows.map(node => {
      const row = node.getBoundingClientRect(); const list = node.closest('.orderList').getBoundingClientRect();
      const readable = parseFloat(getComputedStyle(node.querySelector('.orderCenterInfo > span')).fontSize) >= 15
        && parseFloat(getComputedStyle(node.querySelector('.orderCenterInlineStatus select')).fontSize) >= 12
        && [...node.querySelectorAll('.orderCenterOperationalMeta b')].every(value => parseFloat(getComputedStyle(value).fontSize) >= 12);
      return { height: row.height, readable, contained: [...node.querySelectorAll('.orderCenterInlineStatus, .seikoRowActionMenu > summary')].every(control => {
        const box = control.getBoundingClientRect();
        return box.left >= row.left && box.right <= row.right + 1 && box.top >= row.top && box.bottom <= row.bottom + 1 && box.right <= list.right + 1;
      }) };
    }));
    assert.ok(layout.every(item => item.contained), `Status and menu stay inside their row and list at ${width}px`);
    assert.ok(layout.every(item => item.readable), `Names, status and metadata remain readable at ${width}px`);
    assert.ok(layout.every(item => item.height < (width > 720 ? 110 : 220)), `Rows stay compact at ${width}px: ${JSON.stringify(layout)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No horizontal overflow at ${width}px`);
    if (process.env.ORDER_LAYOUT_SCREENSHOTS && [1860, 390].includes(width)) {
      require('node:fs').mkdirSync(process.env.ORDER_LAYOUT_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: require('node:path').join(process.env.ORDER_LAYOUT_SCREENSHOTS, `order-center-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1365, height: 900 });
  await action('SMOKE-001', 'Open workspace');
  const cell = page.locator('td[data-column-id="field:name"] input').first();
  await cell.fill('Persisted through Save and Close'); await cell.press('Tab');
  await page.getByRole('button', { name: 'More order actions', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save & close', exact: true }).click();
  await row('SMOKE-001').waitFor();
  assert.equal(read(order.orderId).records[0].values['field:name'], 'Persisted through Save and Close');
  for (const [status, body, message] of [[502, '<html>Gateway unavailable</html>', 'unreadable response (HTTP 502)'], [401, '<html>Sign in</html>', 'sign-in session has expired'], [200, '{}', 'did not confirm the save']]) {
    await page.unroute('**/api/erp/orders');
    await page.route('**/api/erp/orders', async (route, request) => {
      if (JSON.parse(request.postData()).operation === 'upsert') await route.fulfill({ status, contentType: 'text/html', body });
      else {
        const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, {method:'POST',body:request.postData()}));
        await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
      }
    });
    await action('SMOKE-001', 'Open workspace');
    await cell.fill('Unsaved failure fixture'); await cell.press('Tab');
    await page.getByRole('button', { name: 'More order actions', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Save & close', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    assert.equal(await cell.inputValue(), 'Unsaved failure fixture');
    assert.equal(read(order.orderId).records[0].values['field:name'], 'Persisted through Save and Close');
    await page.getByRole('button', { name: 'More order actions', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Close without saving', exact: true }).click();
    await row('SMOKE-001').waitFor();
  }
  await page.unroute('**/api/erp/orders');
  await page.route('**/api/erp/orders', async route => {
    const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await action('SMOKE-001', 'Open workspace');
  assert.equal(await cell.inputValue(), 'Persisted through Save and Close');
  await page.reload(); await navigate('Orders'); await action('SMOKE-001', 'Open workspace');
  assert.equal(await cell.inputValue(), 'Persisted through Save and Close');

  // A failed shared write must keep the draft open and must never claim a save.
  await cell.fill('Unsaved failure fixture'); await cell.press('Tab');
  await page.route('**/api/erp/orders', async (route, request) => {
    if (JSON.parse(request.postData()).operation === 'upsert') await route.fulfill({ status: 503, json: { ok: false, code: 'ERP_STORAGE_ERROR', message: 'Simulated shared save failure' } });
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'More order actions', exact: true }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Save & close', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Simulated shared save failure' }).waitFor();
  assert.equal(await cell.inputValue(), 'Unsaved failure fixture');
  assert.equal(read(order.orderId).records[0].values['field:name'], 'Persisted through Save and Close');
  await page.unroute('**/api/erp/orders');
  await page.route('**/api/erp/orders', async route => {
    const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await page.getByRole('button', { name: 'More order actions', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save & close', exact: true }).click();
  await row('SMOKE-001').waitFor();
  assert.equal(read(order.orderId).records[0].values['field:name'], 'Unsaved failure fixture');
  await page.reload();
  const homeRow = page.locator('.homeOrderOperationalRow').filter({ hasText: 'SECOND-002' });
  await homeRow.locator('select').selectOption('Completed');
  await homeRow.waitFor({ state: 'detached' });
  assert.equal(read(second.orderId).status, 'Completed');
  assert.match(await page.locator('.seikoMetricCard.active').innerText(), /ACTIVE ORDERS/);
  assert.equal(await page.locator('.homeOrderOperationalRow').filter({ hasText: 'SMOKE-001' }).isVisible(), true);
  await navigate('Orders');
  await action('SMOKE-001', 'Record payment');
  const payment = page.getByRole('dialog', { name: 'Record payment · SMOKE-001', exact: true });
  await payment.getByLabel('Amount received ₹', { exact: true }).fill('25');
  await payment.getByRole('button', { name: 'Save', exact: true }).click();
  const receipt = page.frameLocator('iframe[title="Billing print preview"]');
  await receipt.getByText('Against order', { exact: false }).first().waitFor();
  assert.match(await receipt.locator('body').innerText(), /SMOKE-001/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seiko_billing_payments WHERE json_extract(data,'$.orderId') = ?").get(order.orderId).n, 2);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '← Back to Home', exact: true }).click();
  await action('SECOND-002', 'Record payment');
  const otherPayment = page.getByRole('dialog', { name: 'Record payment · SECOND-002', exact: true });
  await otherPayment.getByLabel('Amount received ₹', { exact: true }).fill('15');
  await otherPayment.getByRole('button', { name: 'Save', exact: true }).click();
  await receipt.getByText('Against order', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '← Back to Home', exact: true }).click();
  await action('SMOKE-001', 'View payments / receipts');
  const history = page.getByRole('region', { name: 'Payment history' });
  await history.getByRole('button').first().waitFor();
  assert.match(await history.innerText(), /Smoke School/); assert.doesNotMatch(await history.innerText(), /Other School|SECOND-002/);
  assert.equal(await history.getByRole('button').count(), 2);
  await page.getByRole('button', { name: '← Back to Home', exact: true }).click();
  for (const [name, title] of [['Create invoice', 'New invoice'], ['Create delivery challan', 'New delivery challan'], ['Create quotation', 'New quotation']]) {
    await action('SMOKE-001', name);
    const editor = page.getByRole('dialog', { name: title, exact: true });
    assert.equal(await editor.getByLabel('Bill source', { exact: true }).inputValue(), order.orderId);
    assert.equal(await editor.getByLabel('Client name *', { exact: true }).inputValue(), 'Smoke School');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: '← Back to Home', exact: true }).click();
  }
  await page.route('**/labels/create?*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Label route fixture</h1>' }));
  await action('SMOKE-001', 'Create labels');
  await page.waitForURL('**/labels/create?*');
  const labelUrl = new URL(page.url()); assert.equal(labelUrl.searchParams.get('order'), order.orderId); assert.equal(labelUrl.searchParams.get('business'), 'seiko');
  await page.goto(`${base}/tests/packing-browser/smoke.html`); await navigate('Orders');
  await action('SMOKE-001', 'Edit setup');
  await page.locator('.orderSetup').waitFor();
  await page.reload(); await navigate('Orders');
  await page.route('**/api/erp/orders', async (route, request) => {
    if (JSON.parse(request.postData()).operation === 'archive') await route.fulfill({ status: 503, json: { ok: false, code: 'ERP_STORAGE_ERROR', message: 'Simulated archive failure' } });
    else await route.fallback();
  });
  await action('SMOKE-001', 'Archive order');
  await page.getByRole('alert').filter({ hasText: 'Simulated archive failure' }).waitFor();
  assert.equal(read(order.orderId).archived, false); assert.equal(await row('SMOKE-001').isVisible(), true);
  await page.unroute('**/api/erp/orders');
  await page.route('**/api/erp/orders', async route => {
    const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await action('SMOKE-001', 'Archive order'); await row('SMOKE-001').waitFor({ state: 'detached' });
  assert.equal(read(order.orderId).archived, true);
  await page.reload(); await navigate('Orders'); assert.equal(await row('SMOKE-001').count(), 0);
  await page.getByRole('button', { name: 'Open order filters', exact: true }).click();
  await page.getByLabel('Archived only', { exact: true }).check();
  await action('SMOKE-001', 'Restore order');
  assert.equal(read(order.orderId).archived, false);
  await page.reload(); await navigate('Orders');
  await page.setViewportSize({ width: 900, height: 500 });
  page.once('dialog', dialog => dialog.accept('SMOKE-001'));
  await action('SMOKE-001', 'Delete order');
  await page.getByRole('alert').filter({ hasText: 'financial documents or payments' }).waitFor();
  assert.equal(read(order.orderId).deletedAt, undefined);
  page.once('dialog', dialog => dialog.accept('wrong-number')); await action('DELETE-003', 'Delete order');
  await page.getByRole('alert').filter({ hasText: 'exact order number' }).waitFor();
  page.once('dialog', dialog => dialog.accept('DELETE-003')); await action('DELETE-003', 'Delete order');
  await row('DELETE-003').waitFor({ state: 'detached' });
  assert.ok(read(disposable.orderId).deletedAt);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM erp_audit_events WHERE entity_id = ? AND json_extract(snapshot_json,'$.deletedAt') IS NOT NULL").get(disposable.orderId).n, 1);
  await page.reload(); await navigate('Orders'); assert.equal(await row('DELETE-003').count(), 0);

  // A fresh signed-in browser has no local safety copy and reads the same D1 handler.
  const context = await browser.newContext(); const fresh = await context.newPage();
  const adminSession = structuredClone(session); adminSession.businesses[0].role = 'admin';
  await fresh.route('**/api/erp/session', route => route.fulfill({ json: { ok: true, data: adminSession } }));
  await fresh.route('**/api/seiko', route => route.fulfill({ json: { ok: true, data: adminSession } }));
  await fresh.route('**/api/erp/orders', async route => {
    const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, { method: 'POST', body: route.request().postData() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await fresh.goto(`${base}/tests/packing-browser/smoke.html`);
  await fresh.getByRole('button', { name: 'Open menu', exact: true }).click();
  await fresh.getByRole('navigation', { name: 'Modules' }).getByRole('button', { name: /Orders$/ }).click();
  await fresh.locator('.orderRow').filter({ hasText: 'SMOKE-001' }).waitFor();
  assert.equal(await fresh.locator('.orderRow').filter({ hasText: 'DELETE-003' }).count(), 0);
  await fresh.locator('.orderRow').filter({ hasText: 'SMOKE-001' }).locator('summary').click();
  assert.equal(await fresh.getByRole('button', { name: 'Delete order', exact: true }).count(), 0);
  await context.close();
  console.log('PASS: shared Save & Close/reopen/reload, failed save keeps draft, Home status stays Active, visible statuses, scoped payments/receipts/document drafts/setup, archive/restore, confirmed protected deletion, audit tombstone, fresh browser.');
};
