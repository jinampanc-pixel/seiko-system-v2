const assert = require('node:assert/strict');

module.exports = async ({page, sqlite, navigate, ordersApi, base}) => {
  await navigate('Orders');
  const row = page.locator('.orderRow').filter({hasText:'SECOND-002'});
  await row.locator('.orderCenterInfo').click();
  const cell = page.locator('td[data-column-id="field:name"] input').first();
  await cell.fill('Older workspace draft'); await cell.press('Tab');
  const before = sqlite.prepare('SELECT document_json, version FROM erp_orders WHERE id = ?').get('second-order');
  const remote = JSON.parse(before.document_json);
  remote.records[0].values['field:name'] = 'Newer device records';
  const response = await ordersApi.POST(new Request(`${base}/api/erp/orders`, {method:'POST',body:JSON.stringify({operation:'upsert',businessId:'seiko',order:remote,expectedVersion:before.version})}));
  assert.equal(response.status, 200);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'changed in another window or device'}).waitFor();
  assert.equal(await cell.inputValue(), 'Older workspace draft');
  assert.equal(JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id = ?').get('second-order').document_json).records[0].values['field:name'], 'Newer device records');
  await page.reload();
  await navigate('Orders');
  await row.waitFor();
  await navigate('(Home|Overview)');
  // Keep real browser storage; reject only the two writes that fail when its quota is exhausted.
  await page.evaluate(() => {
    localStorage.setItem('quota-test-recovery-draft', 'retain this draft');
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'jinam:seiko:orders-v1' || key === 'jinam:seiko:generated-order-artifacts-v1') {
        throw new DOMException('Quota exhausted', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  await navigate('Orders');
  await row.locator('.orderCenterInfo').click();
  for (const size of [{width:390,height:844}, {width:360,height:640}]) {
    await page.setViewportSize(size);
    const save = page.getByRole('button', {name:'Save',exact:true});
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= size.width, 'Direct Save stays visible on mobile');
    await page.getByRole('button', {name:'More order actions',exact:true}).click();
    const menu = await page.locator('.orderActionMenu').boundingBox();
    assert.ok(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= size.width && menu.y + menu.height <= size.height, 'Entire mobile order menu fits the viewport');
    assert.ok(await page.getByRole('button',{name:'Save now',exact:true}).isVisible());
    await page.getByRole('button', {name:'More order actions',exact:true}).click();
  }
  await cell.fill('Saved despite full device cache'); await cell.press('Tab');
  await page.getByRole('button',{name:'More order actions',exact:true}).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Save & close',exact:true}).click();
  await page.getByRole('heading',{name:'Orders',exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'cannot keep an offline order copy'}).waitFor();
  const saved = JSON.parse(sqlite.prepare('SELECT document_json FROM erp_orders WHERE id = ?').get('second-order').document_json);
  assert.equal(saved.records[0].values['field:name'], 'Saved despite full device cache');
  assert.equal(await page.evaluate(() => localStorage.getItem('quota-test-recovery-draft')), 'retain this draft');
  await row.locator('.orderCenterInfo').click();
  assert.equal(await cell.inputValue(), 'Saved despite full device cache');
  await page.setViewportSize({width:1365,height:900});
  console.log('PASS: stale workspace cannot overwrite newer device records; full cache cannot crash Orders or fail a confirmed server save; mobile Save/menu fit; drafts retained.');
};
