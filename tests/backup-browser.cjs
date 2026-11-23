const uiLabel=require("./ui-label.cjs");
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const { fixture } = await import('./backup-runtime.test.mjs');
  const { decryptBackup } = await import('../app/lib/backup-format.mjs');
  const source = fixture(); const empty = fixture(); let target = source;
  const managed = fixture('browser recovery fixture key');
  source.sqlite.prepare('INSERT INTO seiko_clients VALUES(?,?,?,?,?,?,?,?)').run('client', 'fixture', '', '', 0, '{"id":"client","name":"Browser recovery"}', 'owner', 'owner');
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/backups-browser/vite.config.mjs'], { stdio: 'pipe' });
  let output = ''; server.stdout.on('data', data => output += data); server.stderr.on('data', data => output += data); let browser;
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch('http://127.0.0.1:5183/tests/backups-browser/index.html')).ok) break; } catch { /* Starting fixture. */ }
      if (attempt > 60 || server.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/erp/backups', async route => {
      const response = await target.api.POST(new Request('https://test.invalid/api/erp/backups', { method: 'POST', headers: { Origin: 'https://test.invalid' }, body: route.request().postData() }));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await page.goto('http://127.0.0.1:5183/tests/backups-browser/index.html');
    await page.getByRole('status').filter({ hasText: 'Backup status checked' }).waitFor();
    assert.equal(await page.getByRole('button', { name: uiLabel('Download backup', true), exact: true }).isEnabled(), false);
    await page.getByText(uiLabel('Advanced recovery — manual files and offline tools', true), { exact: true }).click();
    const passphrase = 'browser recovery fixture key';
    await page.getByLabel(uiLabel('Backup passphrase (at least 16 characters)', false)).fill(passphrase);
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: uiLabel('Download encrypted backup', false) }).click();
    const download = await downloadPromise; const file = await download.path();
    const decoded = await decryptBackup(JSON.parse(fs.readFileSync(file, 'utf8')), passphrase); assert.equal(decoded.tables.seiko_clients.rows[0].id, 'client');
    await page.getByLabel(uiLabel('Encrypted backup file', false)).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'Checksum and schema verified' }).waitFor();
    assert.equal(await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).count(), 0);
    target = empty; await page.getByLabel(uiLabel('Encrypted backup file', false)).setInputFiles([]); await page.getByLabel(uiLabel('Encrypted backup file', false)).setInputFiles(file);
    await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).waitFor();
    assert.equal(await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).isEnabled(), false);
    await page.getByLabel(uiLabel('Type RESTORE EMPTY SYSTEM', false)).fill('RESTORE EMPTY SYSTEM');
    await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).click();
    await page.getByRole('status').filter({ hasText: 'Business records restored' }).waitFor();
    assert.equal(empty.sqlite.prepare('SELECT id FROM seiko_clients').get().id, 'client');
    await page.evaluate(() => {
      localStorage.setItem('jinam:seiko:orders-v1', '[{"orderId":"offline"}]');
      localStorage.setItem('jinam:seiko:labels:shared-pending-v1', '[{"collection":"tasks-v1","id":"pending","expectedVersion":2}]');
      localStorage.setItem('jinam:session', 'must-not-export');
    });
    let offlineRequests = 0; page.on('request', request => { if (request.url().includes('/api/erp/backups')) offlineRequests++; });
    await page.context().setOffline(true);
    await page.getByLabel(uiLabel('Archives to search', false)).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'verified archive(s) ready to search' }).waitFor();
    await page.getByLabel(uiLabel('Record type', false)).selectOption('seiko_clients');
    await page.getByLabel(uiLabel('Search archive records', false)).fill('Browser recovery');
    await page.getByText(uiLabel('1 matching records', true), { exact: true }).waitFor();
    await page.locator('section[aria-label="Search saved archives" i] summary').click();
    assert.ok(await page.locator('section[aria-label="Search saved archives" i]').getByText(uiLabel(/Browser recovery/, false)).count());
    await page.getByLabel(uiLabel('Search archive records', false)).fill('does not exist');
    await page.getByText(uiLabel('0 matching records', true), { exact: true }).waitFor();
    assert.equal(empty.sqlite.prepare('SELECT COUNT(*) AS count FROM seiko_clients').get().count, 1);
    await page.getByLabel(uiLabel('Backup passphrase (at least 16 characters)', false)).fill('incorrect archive passphrase');
    await page.getByLabel(uiLabel('Archives to search', false)).setInputFiles([]);
    await page.getByLabel(uiLabel('Archives to search', false)).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: /passphrase.*damaged|damaged.*passphrase/i }).waitFor();
    assert.equal(await page.getByLabel(uiLabel('Search archive records', false)).count(), 0);
    await page.getByLabel(uiLabel('Backup passphrase (at least 16 characters)', false)).fill(passphrase);
    const offlineDownloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: uiLabel('Download local recovery copy', true), exact: true }).click();
    const offlineDownload = await offlineDownloadPromise; const offlineFile = await offlineDownload.path();
    const { decryptLocalRecovery } = await import('../app/lib/local-recovery.mjs');
    const local = await decryptLocalRecovery(JSON.parse(fs.readFileSync(offlineFile, 'utf8')), passphrase);
    assert.equal(local.completeD1Snapshot, false); assert.equal(local.entries['jinam:session'], undefined); assert.ok(local.entries['jinam:seiko:labels:shared-pending-v1']);
    await page.getByLabel(uiLabel('Encrypted backup file', false)).setInputFiles(offlineFile);
    await page.getByRole('status').filter({ hasText: 'Local recovery verified' }).waitFor();
    assert.equal(offlineRequests, 0); assert.equal(await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).count(), 0);
    await page.context().setOffline(false); target = managed; await page.reload();
    await page.getByRole('status').filter({ hasText: 'Backup status checked' }).waitFor();
    assert.equal(await page.getByRole('button', { name: uiLabel('Download backup', true), exact: true }).isEnabled(), true);
    await page.getByLabel(uiLabel('Backup to recover', false)).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'Backup unlocked and verified' }).waitFor();
    await page.getByRole('button', { name: uiLabel('Review recovery', false) }).click();
    await page.getByRole('button', { name: uiLabel('Restore empty system', false) }).waitFor();
    assert.equal(managed.sqlite.prepare('SELECT COUNT(*) AS count FROM seiko_clients').get().count, 0);
    await page.getByLabel(uiLabel('Archives to search', false)).filter({ visible: true }).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'verified archive(s) ready to search' }).waitFor();
    assert.deepEqual(errors, []);
    let homeDocumentRequests = 0;
    await page.route('http://127.0.0.1:5183/', async route => {
      assert.equal(route.request().resourceType(), 'document'); homeDocumentRequests++;
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Home</h1></body></html>' });
    });
    await page.getByRole('link', { name: uiLabel('← Back', true), exact: true }).click();
    await page.waitForURL('http://127.0.0.1:5183/');
    await page.getByRole('heading', { name: uiLabel('Home', true), exact: true }).waitFor();
    assert.equal(homeDocumentRequests, 1, 'Back to Home must load the Home document');
    assert.deepEqual(errors, []);
    console.log('PASS: encrypted D1 recovery, offline archive search/details/wrong-key refusal and encrypted caches/outbox recovery; no server requests or live changes during archive browsing.');
  } finally { await browser?.close(); server.kill(); source.sqlite.close(); empty.sqlite.close(); managed.sqlite.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
