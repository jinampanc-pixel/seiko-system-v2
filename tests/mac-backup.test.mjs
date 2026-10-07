import test from 'node:test';
import assert from 'node:assert/strict';
import { macBackupPlist, installMacBackup } from '../scripts/install-mac-backup.mjs';

test('Mac job keeps spaced paths as separate arguments, escapes XML and schedules daily catch-up', () => {
  const plist = macBackupPlist({ node: '/Applications/Node/bin/node', config: '/Users/owner/Private & Keys/config.json', repository: '/Users/owner/Jinam app', directory: '/Users/owner/Backups' });
  assert.match(plist, /<string>\/Users\/owner\/Private &amp; Keys\/config.json<\/string>/);
  assert.match(plist, /<string>\/Users\/owner\/Jinam app\/scripts\/pc-backup.mjs<\/string>/);
  assert.match(plist, /<key>Hour<\/key><integer>20<\/integer>/);
  assert.match(plist, /<key>StartInterval<\/key><integer>1800<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.doesNotMatch(plist, /Codex|refreshToken|recovery.key/);
});

test('Mac installer refuses other platforms and unsafe paths before invoking system commands', () => {
  assert.throws(() => installMacBackup('unused', { platform: 'win32', run: () => assert.fail('must not execute') }), /Run this installer once on the Mac/);
  for (const node of ['relative', '/node\ninvalid']) assert.throws(() => macBackupPlist({ node, config: '/config', repository: '/repo', directory: '/backups' }), /absolute Mac paths/);
});
