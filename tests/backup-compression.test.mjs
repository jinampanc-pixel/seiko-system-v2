import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, decryptPayload } from '../app/lib/backup-format.mjs';

test('compressed encrypted snapshots preserve every value, read older files and authenticate compression metadata', async () => {
  const key = 'fixture-backup-key-long-enough';
  const data = { history: Array.from({ length: 500 }, (_, id) => ({ id, saved: 'Repeated historical order data, sizes, quantities and original audit history.' })) };
  const plain = await encryptPayload(data, key, 'test', 'TEST');
  const compressed = await encryptPayload(data, key, 'test', 'TEST', { compress: true });
  assert.equal(plain.version, 1); assert.equal(compressed.version, 2);
  assert.ok(JSON.stringify(compressed).length < JSON.stringify(plain).length / 5);
  assert.deepEqual(await decryptPayload(plain, key, 'test', 'TEST'), data);
  assert.deepEqual(await decryptPayload(compressed, key, 'test', 'TEST'), data);
  await assert.rejects(decryptPayload(compressed, 'different-fixture-key-long-enough', 'test', 'TEST'), /damaged/);
  await assert.rejects(decryptPayload({ ...compressed, compression: 'unknown' }, key, 'test', 'TEST'), /Unsupported/);
  const downgraded = { ...compressed, version: 1 }; delete downgraded.compression;
  await assert.rejects(decryptPayload(downgraded, key, 'test', 'TEST'), /damaged/);
  await assert.rejects(decryptPayload({ ...plain, version: 2, compression: 'gzip' }, key, 'test', 'TEST'), /damaged/);
});
