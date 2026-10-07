import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { authorizeDriveBackup } from '../scripts/authorize-drive-backup.mjs';

test('direct Drive setup rejects wrong callback state, uses PKCE and keeps tokens only in private configuration', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jinam-oauth-test-'));
  const configFile = path.join(directory, 'config.json'); const clientFile = path.join(directory, 'client.json');
  fs.writeFileSync(configFile, JSON.stringify({ directory, keyFile: '/existing/key' }));
  fs.writeFileSync(clientFile, JSON.stringify({ installed: { client_id: 'fixture-client', client_secret: 'fixture-secret' } }));
  let authorization; let calls = 0;
  try {
    const result = await authorizeDriveBackup(configFile, clientFile, {
      onAuthorize: async link => {
        authorization = new URL(link);
        assert.equal(authorization.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
        const callback = new URL(authorization.searchParams.get('redirect_uri'));
        callback.search = new URLSearchParams({ state: 'wrong-state', code: 'fixture-code' });
        assert.equal((await fetch(callback)).status, 400);
        callback.searchParams.set('state', authorization.searchParams.get('state'));
        assert.equal((await fetch(callback)).status, 200);
      },
      request: async (url, options) => {
        calls++;
        if (url === 'https://oauth2.googleapis.com/token') {
          assert.equal(options.body.get('code'), 'fixture-code');
          assert.equal(crypto.createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'));
          return Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh' });
        }
        assert.equal(url, 'https://www.googleapis.com/drive/v3/files?fields=id');
        assert.equal(options.headers.Authorization, 'Bearer fixture-access');
        assert.equal(JSON.parse(options.body).mimeType, 'application/vnd.google-apps.folder');
        return Response.json({ id: 'private-fixture-folder' });
      },
    });
    assert.equal(calls, 2); assert.equal(result.state, 'authorized');
    assert.doesNotMatch(JSON.stringify(result), /fixture-refresh|fixture-secret|fixture-access/);
    const config = JSON.parse(fs.readFileSync(configFile));
    assert.equal(config.keyFile, '/existing/key');
    assert.equal(config.googleDrive.folderId, 'private-fixture-folder');
    assert.equal(JSON.parse(fs.readFileSync(config.googleDrive.credentialsFile)).refreshToken, 'fixture-refresh');
    await assert.rejects(authorizeDriveBackup(configFile, clientFile), /already exists/);
  } finally {
    assert.ok(path.relative(os.tmpdir(), directory).startsWith('jinam-oauth-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
