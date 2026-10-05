// One portable format for browser exports, scheduled disk copies and restore drills.
export const BACKUP_VERSION = 1;
export const SEQUENCE_TABLES = ['seiko_billing_documents', 'seiko_billing_payments', 'seiko_storage_audit', 'erp_label_history', 'jinam_shared_changes'];
export const TABLES = {
  erp_orders: ['id'], erp_audit_events: ['id'], erp_preferences: ['business_id', 'key'],
  seiko_billing_documents: ['id'], seiko_billing_payments: ['id'], seiko_clients: ['id'],
  seiko_storage_audit: ['sequence'], erp_label_records: ['business_id', 'collection', 'id'],
  erp_label_history: ['sequence'], jinam_shared_records: ['scope', 'collection', 'id'],
  jinam_shared_changes: ['sequence'], jinam_meth_fulfilment_settings: ['id'],
  jinam_meth_finished_stock: ['meth_sku'], jinam_meth_order_routing_claims: ['claim_id'],
};
export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const encoder = new TextEncoder();
export async function checksum(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function makeBackup(tables, schemaVersion, source, sequences) {
  const payload = { format: 'seiko-business-backup', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), schemaVersion, source, tables, ...(sequences ? { sequences } : {}) };
  return { ...payload, checksum: await checksum(payload) };
}
export async function validateBackup(backup) {
  if (!backup || backup.format !== 'seiko-business-backup' || backup.version !== BACKUP_VERSION || !Array.isArray(backup.schemaVersion) || !backup.schemaVersion.length || !backup.tables || typeof backup.tables !== 'object') throw new Error('Unsupported or incomplete backup.');
  const { checksum: digest, ...payload } = backup;
  if (digest !== await checksum(payload)) throw new Error('Backup checksum does not match.');
  if (canonical(Object.keys(backup.tables).sort()) !== canonical(Object.keys(TABLES).sort())) throw new Error('Backup table coverage does not match.');
  for (const [table, keys] of Object.entries(TABLES)) {
    const { columns, rows } = backup.tables[table];
    if (!Array.isArray(columns) || !columns.length || new Set(columns).size !== columns.length || columns.some(column => typeof column !== 'string' || !/^[a-z_]+$/.test(column)) || keys.some(key => !columns.includes(key)) || !Array.isArray(rows)) throw new Error('Invalid backup table.');
    const seen = new Set();
    for (const row of rows) {
      if (!row || canonical(Object.keys(row).sort()) !== canonical([...columns].sort()) || Object.values(row).some(value => value !== null && (!['string', 'number'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value))) || keys.some(key => row[key] === null)) throw new Error('Invalid backup record.');
      const key = canonical(keys.map(key => row[key]));
      if (seen.has(key)) throw new Error('Duplicate backup identity.');
      seen.add(key);
    }
  }
  if (backup.sequences !== undefined) {
    if (!backup.sequences || canonical(Object.keys(backup.sequences).sort()) !== canonical([...SEQUENCE_TABLES].sort())) throw new Error('Invalid backup numbering coverage.');
    for (const table of SEQUENCE_TABLES) {
      const counter = backup.sequences[table];
      if (!Number.isSafeInteger(counter) || counter < 0 || backup.tables[table].rows.some(row => !Number.isSafeInteger(row.sequence) || row.sequence > counter)) throw new Error('Invalid backup numbering counter.');
    }
  }
  return backup;
}
export function summarizeRestore(backup, current) {
  const summary = { new: 0, duplicate: 0, changed: 0, rejected: 0, existing: 0, tables: {} };
  for (const [table, keys] of Object.entries(TABLES)) {
    const key = row => canonical(keys.map(key => row[key]));
    const stored = new Map(current[table].rows.map(row => [key(row), row]));
    const result = { new: 0, duplicate: 0, changed: 0, rejected: 0, existing: stored.size };
    if (canonical(backup.tables[table].columns) !== canonical(current[table].columns)) throw new Error('Backup schema differs from target database.');
    for (const row of backup.tables[table].rows) {
      const old = stored.get(key(row));
      result[!old ? 'new' : canonical(old) === canonical(row) ? 'duplicate' : 'changed']++;
    }
    for (const field of ['new', 'duplicate', 'changed', 'rejected', 'existing']) summary[field] += result[field];
    summary.tables[table] = result;
  }
  // Initial recovery deliberately targets an empty database. A live merge needs separate review.
  return { ...summary, numberingCountersIncluded: backup.sequences !== undefined, canRestore: summary.existing === 0 && summary.new > 0 };
}
function base64(bytes) {
  let text = ''; for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
}
const unbase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 16) throw new Error('Use a backup passphrase of at least 16 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(backup, password) {
  await validateBackup(backup);
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('SEIKO-BACKUP-1') }, await keyFor(password, salt), encoder.encode(JSON.stringify(backup)));
  return { format: 'seiko-encrypted-backup', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 100000, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
}
export async function decryptBackup(envelope, password) {
  if (!envelope || envelope.format !== 'seiko-encrypted-backup' || envelope.version !== 1 || envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== 100000) throw new Error('Unsupported encrypted backup.');
  try {
    const salt = unbase64(envelope.salt); const iv = unbase64(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption metadata.');
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('SEIKO-BACKUP-1') }, await keyFor(password, salt), unbase64(envelope.ciphertext));
    return await validateBackup(JSON.parse(new TextDecoder().decode(decrypted)));
  } catch { throw new Error('Backup is damaged or the passphrase is incorrect.'); }
}
