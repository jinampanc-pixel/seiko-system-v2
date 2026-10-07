import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { driveToken } from './drive-backup.mjs';

async function provisionFolder(configPath, config, credentialsFile, token, request = fetch) {
  const response = await request('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Jinam Automatic Encrypted Backups', mimeType: 'application/vnd.google-apps.folder' }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Private authorization saved, but Drive folder creation failed. Check that Google Drive API is enabled.');
  const folder = await response.json();
  if (!folder.id) throw new Error('Google returned no backup folder identity.');
  config.googleDrive = { credentialsFile, folderId: folder.id };
  fs.writeFileSync(`${configPath}.partial`, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(`${configPath}.partial`, configPath);
  return { state: 'authorized', folderId: folder.id };
}

// Owner-operated loopback OAuth: no connector credential, password, or authorization code is logged.
export async function authorizeDriveBackup(configFile, clientFile, { request = fetch, onAuthorize = url => console.log('Open this Google authorization page in your browser:\n' + url) } = {}) {
  const configPath = fs.realpathSync(configFile);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.googleDrive) throw new Error('Direct Drive authorization already exists; refusing to replace it.');
  const client = JSON.parse(fs.readFileSync(clientFile, 'utf8')).installed;
  if (!client?.client_id || !client?.client_secret) throw new Error('Use the Google Desktop app JSON downloaded by the owner.');
  const credentialsFile = path.join(path.dirname(configPath), 'google-drive.json');
  if (fs.existsSync(credentialsFile)) {
    const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    if (credentials.clientId !== client.client_id) throw new Error('The existing authorization belongs to a different client; refusing to replace it.');
    return provisionFolder(configPath, config, credentialsFile, await driveToken(credentials, request), request);
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const server = http.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Authorization timed out. No existing backup was changed.')), 10 * 60 * 1000);
      queueMicrotask(() => { Promise.resolve(onAuthorize(url.toString())).catch(error => { clearTimeout(timer); reject(error); }); });
      server.on('request', (request, response) => {
        const received = new URL(request.url, redirect);
        if (received.pathname !== '/oauth/callback' || received.searchParams.get('state') !== state) { response.writeHead(400); response.end('Invalid authorization callback.'); return; }
        clearTimeout(timer);
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
        if (!received.searchParams.get('code')) { response.end('Authorization declined. Existing backups are unchanged.'); reject(new Error('Owner declined Drive authorization.')); return; }
        response.end('Google authorization received. Return to the backup setup window for verification.');
        resolve(received.searchParams.get('code'));
      });
    });
    const tokenResponse = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(30000) });
    if (!tokenResponse.ok) throw new Error('Google token exchange failed. No credential was printed.');
    const tokens = await tokenResponse.json();
    if (!tokens.refresh_token || !tokens.access_token) throw new Error('Google did not return unattended authorization.');
    // Preserve the new credential privately even if folder creation needs a later retry.
    fs.writeFileSync(credentialsFile, JSON.stringify({ clientId: client.client_id, clientSecret: client.client_secret, refreshToken: tokens.refresh_token }), { mode: 0o600, flag: 'wx' });
    return await provisionFolder(configPath, config, credentialsFile, tokens.access_token, request);
  } finally { server.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await authorizeDriveBackup(process.argv[2], process.argv[3]))); }
  catch { console.error('Direct Drive setup did not finish. Existing archives are unchanged; inspect private setup state before retrying.'); process.exitCode = 1; }
}
