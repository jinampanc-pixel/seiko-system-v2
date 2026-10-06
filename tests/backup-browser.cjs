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
    assert.equal(await page.getByRole('button', { name: 'Download backup', exact: true }).isEnabled(), false);
    await page.getByText('Advanced recovery — manual files and offline tools', { exact: true }).click();
    const passphrase = 'browser recovery fixture key';
    await page.getByLabel('Backup passphrase (at least 16 characters)').fill(passphrase);
    const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download encrypted backup' }).click();
    const download = await downloadPromise; const file = await download.path();
    const decoded = await decryptBackup(JSON.parse(fs.readFileSync(file, 'utf8')), passphrase); assert.equal(decoded.tables.seiko_clients.rows[0].id, 'client');
    await page.getByLabel('Encrypted backup file').setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'Checksum and schema verified' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Restore empty system' }).count(), 0);
    target = empty; await page.getByLabel('Encrypted backup file').setInputFiles([]); await page.getByLabel('Encrypted backup file').setInputFiles(file);
    await page.getByRole('button', { name: 'Restore empty system' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Restore empty system' }).isEnabled(), false);
    await page.getByLabel('Type RESTORE EMPTY SYSTEM').fill('RESTORE EMPTY SYSTEM');
    await page.getByRole('button', { name: 'Restore empty system' }).click();
    await page.getByRole('status').filter({ hasText: 'Business records restored' }).waitFor();
    assert.equal(empty.sqlite.prepare('SELECT id FROM seiko_clients').get().id, 'client');
    await page.evaluate(() => {
      localStorage.setItem('jinam:seiko:orders-v1', '[{"orderId":"offline"}]');
      localStorage.setItem('jinam:seiko:labels:shared-pending-v1', '[{"collection":"tasks-v1","id":"pending","expectedVersion":2}]');
      localStorage.setItem('jinam:session', 'must-not-export');
    });
    let offlineRequests = 0; page.on('request', request => { if (request.url().includes('/api/erp/backups')) offlineRequests++; });
    await page.context().setOffline(true);
    await page.getByLabel('Archives to search').setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'verified archive(s) ready to search' }).waitFor();
    await page.getByLabel('Record type').selectOption('seiko_clients');
    await page.getByLabel('Search archive records').fill('Browser recovery');
    await page.getByText('1 matching records', { exact: true }).waitFor();
    await page.locator('section[aria-label="Search saved archives"] summary').click();
    assert.ok(await page.locator('section[aria-label="Search saved archives"]').getByText(/Browser recovery/).count());
    await page.getByLabel('Search archive records').fill('does not exist');
    await page.getByText('0 matching records', { exact: true }).waitFor();
    assert.equal(empty.sqlite.prepare('SELECT COUNT(*) AS count FROM seiko_clients').get().count, 1);
    await page.getByLabel('Backup passphrase (at least 16 characters)').fill('incorrect archive passphrase');
    await page.getByLabel('Archives to search').setInputFiles([]);
    await page.getByLabel('Archives to search').setInputFiles(file);
    await page.getByRole('status').filter({ hasText: /passphrase.*damaged|damaged.*passphrase/i }).waitFor();
    assert.equal(await page.getByLabel('Search archive records').count(), 0);
    await page.getByLabel('Backup passphrase (at least 16 characters)').fill(passphrase);
    const offlineDownloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download local recovery copy', exact: true }).click();
    const offlineDownload = await offlineDownloadPromise; const offlineFile = await offlineDownload.path();
    const { decryptLocalRecovery } = await import('../app/lib/local-recovery.mjs');
    const local = await decryptLocalRecovery(JSON.parse(fs.readFileSync(offlineFile, 'utf8')), passphrase);
    assert.equal(local.completeD1Snapshot, false); assert.equal(local.entries['jinam:session'], undefined); assert.ok(local.entries['jinam:seiko:labels:shared-pending-v1']);
    await page.getByLabel('Encrypted backup file').setInputFiles(offlineFile);
    await page.getByRole('status').filter({ hasText: 'Local recovery verified' }).waitFor();
    assert.equal(offlineRequests, 0); assert.equal(await page.getByRole('button', { name: 'Restore empty system' }).count(), 0);
    await page.context().setOffline(false); target = managed; await page.reload();
    await page.getByRole('status').filter({ hasText: 'Backup status checked' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download backup', exact: true }).isEnabled(), true);
    await page.getByLabel('Backup to recover').setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'Backup unlocked and verified' }).waitFor();
    await page.getByRole('button', { name: 'Review recovery' }).click();
    await page.getByRole('button', { name: 'Restore empty system' }).waitFor();
    assert.equal(managed.sqlite.prepare('SELECT COUNT(*) AS count FROM seiko_clients').get().count, 0);
    await page.getByLabel('Archives to search').filter({ visible: true }).setInputFiles(file);
    await page.getByRole('status').filter({ hasText: 'verified archive(s) ready to search' }).waitFor();
    assert.deepEqual(errors, []);
    let homeDocumentRequests = 0;
    await page.route('http://127.0.0.1:5183/', async route => {
      assert.equal(route.request().resourceType(), 'document'); homeDocumentRequests++;
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Home</h1></body></html>' });
    });
    await page.getByRole('link', { name: '← Back to Home', exact: true }).click();
    await page.waitForURL('http://127.0.0.1:5183/');
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    assert.equal(homeDocumentRequests, 1, 'Back to Home must load the Home document');
    assert.deepEqual(errors, []);
    console.log('PASS: encrypted D1 recovery, offline archive search/details/wrong-key refusal and encrypted caches/outbox recovery; no server requests or live changes during archive browsing.');
  } finally { await browser?.close(); server.kill(); source.sqlite.close(); empty.sqlite.close(); managed.sqlite.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
