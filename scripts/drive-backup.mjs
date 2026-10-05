import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
export async function driveToken(credentials, request = fetch) {
  if (!credentials?.clientId || !credentials.clientSecret || !credentials.refreshToken) throw new Error('Direct Jinam Google Drive authorization is missing.');
  const response = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Google Drive authorization expired or was refused. Reconnect Jinam directly.');
  const result = await response.json();
  if (!result.access_token) throw new Error('Google Drive returned no access token.');
  return result.access_token;
}
export async function uploadVerified(file, folderId, token, request = fetch) {
  if (!safeId(folderId)) throw new Error('Invalid private Drive folder ID.');
  const bytes = fs.readFileSync(file); const name = path.basename(file);
  const headers = { Authorization: `Bearer ${token}` };
  const call = async (url, options = {}) => {
    const response = await request(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Google Drive backup transfer failed; the local copy is retained.');
    return response;
  };
  const metadataUrl = id => `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,size,parents,permissions(type,role),trashed`;
  const folder = await (await call(metadataUrl(folderId))).json();
  if (folder.trashed || !folder.permissions?.length || folder.permissions.some(permission => permission.type !== 'user' || permission.role !== 'owner')) throw new Error('Backup folder must be private to its owner.');
  const quote = value => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  const query = `name='${quote(name)}' and '${folderId}' in parents and trashed=false`;
  const existing = await (await call(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=2`)).json();
  if (existing.files?.length > 1) throw new Error('Duplicate Drive backup names require review. No copy was overwritten.');
  let id = existing.files?.[0]?.id;
  if (!id) {
    const started = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(bytes.length) }, body: JSON.stringify({ name, parents: [folderId] }) });
    const location = started.headers.get('location');
    // Never send the bearer token to an arbitrary URL returned by a proxy or malformed response.
    if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new Error('Invalid Google Drive upload destination.');
    const uploaded = await (await call(location, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })).json(); id = uploaded.id;
  }
  if (!safeId(id)) throw new Error('Invalid uploaded Drive identity.');
  const metadata = await (await call(metadataUrl(id))).json();
  if (metadata.trashed || metadata.name !== name || Number(metadata.size) !== bytes.length || !metadata.parents?.includes(folderId) || !metadata.permissions?.length || metadata.permissions.some(permission => permission.type !== 'user' || permission.role !== 'owner')) throw new Error('Drive backup identity, size or privacy verification failed.');
  const downloaded = Buffer.from(await (await call(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).arrayBuffer());
  const digest = hash(bytes);
  if (hash(downloaded) !== digest) throw new Error('Drive backup byte verification failed.');
  return { driveCopy: 'remote-byte-verified', driveFileId: id, encryptedSHA256: digest, cloudVerifiedAt: new Date().toISOString() };
}
export async function copyBackupToDrive(config, report, request = fetch) {
  const credentials = JSON.parse(fs.readFileSync(config.googleDrive.credentialsFile, 'utf8'));
  const token = await driveToken(credentials, request);
  const file = path.join(config.directory, report.file);
  const verified = await uploadVerified(file, config.googleDrive.folderId, token, request);
  Object.assign(report, verified);
  fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  fs.appendFileSync(path.join(config.directory, 'operations.jsonl'), `${JSON.stringify(report)}\n`, { mode: 0o600 });
  await uploadVerified(`${file}.manifest.json`, config.googleDrive.folderId, token, request);
  return report;
}
