import { env } from 'cloudflare:workers';
import { authenticateActor } from '../../../lib/server-erp-auth';
import { TABLES, SEQUENCE_TABLES, makeBackup, validateBackup, summarizeRestore, canonical } from '../../../lib/backup-format.mjs';

type Row = Record<string, string | number | null>;
type TableData = { columns: string[]; rows: Row[] };
type Backup = { checksum: string; schemaVersion: string[]; tables: Record<string, TableData>; sequences?: Record<string, number> };
const names = Object.keys(TABLES);
const histories = ['erp_audit_events', 'seiko_storage_audit', 'erp_label_history', 'jinam_shared_changes'];
const reply = (message: string, status = 400) => Response.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply('Invalid request origin.', 403);
  try {
    const actor = await authenticateActor(request);
    if (!actor || actor.mustChangePassword) return reply('Sign in is required.', 401);
    if (!env.DB) return reply('Backup storage is unavailable.', 503);
    const db = env.DB.withSession('first-primary');
    // A complete system snapshot crosses business boundaries: check fresh ownership, never UI grants.
    const memberships = await db.prepare('SELECT business_id FROM erp_memberships WHERE lower(email)=lower(?) AND role=\'owner\' AND active=1').bind(actor.email).all<{ business_id: string }>();
    if (!['seiko', 'meth', 'veyn-health'].every(business => memberships.results.some(row => row.business_id === business))) return reply('Complete system backups require owner access to SEIKO, MeTh and VÉYN.', 403);
    const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 16 * 1024 * 1024) { await reader.cancel(); return reply('Use the local recovery tool for backups larger than 16 MB.', 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { operation?: string; backup?: Backup; confirmation?: string };
    if (!['export', 'dry-run', 'restore'].includes(body.operation || '')) return reply('Choose a valid backup operation.');
    const schema = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>();
    const schemaVersion = schema.results.map(row => row.name);
    const columnRows = await db.prepare(names.map(table => `SELECT '${table}' AS table_name,name,cid FROM pragma_table_info('${table}')`).join(' UNION ALL ')).all<{ table_name: string; name: string; cid: number }>();
    const columns = names.map(table => columnRows.results.filter(row => row.table_name === table).sort((a, b) => a.cid - b.cid).map(row => row.name));
    if (columns.some(fields => !fields.length)) return reply('Database migrations are incomplete.', 503);
    // D1 batch reads are one transaction, so records and their histories describe one snapshot.
    const results = await db.batch([...names.map(table => db.prepare(`SELECT * FROM "${table}" ORDER BY ${TABLES[table as keyof typeof TABLES].map((key: string) => `"${key}"`).join(',')}`)), db.prepare('SELECT name,seq FROM sqlite_sequence')]);
    const tables: Record<string, TableData> = Object.fromEntries(names.map((table, index) => [table, { columns: columns[index], rows: results[index].results as Row[] }]));
    const audit = (operation: string, checksum: string, details: object, status = 'verified') => db.prepare('INSERT INTO erp_backup_operations(id,operation,actor_email,at,checksum,details_json,status) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(), operation, actor.email, new Date().toISOString(), checksum, JSON.stringify(details), status);
    if (body.operation === 'export') {
      const counters = results[names.length].results as { name: string; seq: number }[];
      const sequences = Object.fromEntries(SEQUENCE_TABLES.map((table: string) => [table, counters.find(row => row.name === table)?.seq || 0]));
      const backup = await makeBackup(tables, schemaVersion, 'production-d1', sequences);
      await audit('export', backup.checksum, { records: results.slice(0, names.length).reduce((count, result) => count + result.results.length, 0) }).run();
      return Response.json({ ok: true, backup }, { headers: { 'Cache-Control': 'no-store' } });
    }
    let backup: Backup;
    try { backup = await validateBackup(body.backup); } catch { return reply('Backup validation failed. No records changed.'); }
    if (canonical(backup.schemaVersion) !== canonical(schemaVersion)) return reply('Backup migration version differs. Use the isolated recovery tool first.', 409);
    let summary;
    try { summary = summarizeRestore(backup, tables); } catch { return reply('Backup columns do not match this database.', 409); }
    if (body.operation === 'dry-run') {
      await audit('restore-dry-run', backup.checksum, summary).run();
      return Response.json({ ok: true, summary }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!actor.sessionId) return reply('Sign in again with your ERP account before restoring.', 401);
    const session = await db.prepare('SELECT created_at FROM erp_sessions WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(actor.sessionId, new Date().toISOString()).first<{ created_at: string }>();
    const age = session ? Date.now() - Date.parse(session.created_at) : Infinity;
    if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return reply('Sign in again; restore requires authentication within the last ten minutes.', 401);
    if (body.confirmation !== 'RESTORE EMPTY SYSTEM' || !summary.canRestore) return reply('Restore requires an empty system. Existing or newer records will not be overwritten.', 409);
    const statements = [];
    const count = names.map(table => `(SELECT count(*) FROM "${table}")`).join('+');
    // Re-check emptiness INSIDE the write transaction. A concurrent write makes CHECK fail and rolls everything back.
    statements.push(db.prepare(`INSERT INTO erp_backup_operations(id,operation,actor_email,at,checksum,details_json,status) SELECT ?,?,?,?,?,?,CASE WHEN (${count})=0 THEN 'verified' ELSE 'blocked' END`).bind(crypto.randomUUID(), 'restore', actor.email, new Date().toISOString(), backup.checksum, JSON.stringify(summary)));
    for (const table of [...histories, ...names.filter(table => !histories.includes(table))]) {
      const { columns: fields, rows } = backup.tables[table];
      let group: Row[] = []; let groupBytes = 2;
      const flush = () => {
        if (!group.length) return;
        const select = fields.map(field => `json_extract(value,'$.${field}')`).join(',');
        statements.push(db.prepare(`INSERT INTO "${table}" (${fields.map(field => `"${field}"`).join(',')}) SELECT ${select} FROM json_each(?)`).bind(JSON.stringify(group)));
        group = []; groupBytes = 2;
      };
      for (const row of rows) {
        const length = new TextEncoder().encode(JSON.stringify(row)).length + 1;
        if (length > 1800000) return reply('A record exceeds safe restore limits. Use isolated local recovery.', 413);
        if (groupBytes + length > 1800000) flush();
        group.push(row); groupBytes += length;
      }
      flush();
    }
    if (backup.sequences) {
      const counters = JSON.stringify(backup.sequences);
      statements.push(db.prepare('INSERT INTO sqlite_sequence(name,seq) SELECT key,value FROM json_each(?) WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name=key)').bind(counters));
      // Recovery triggers may already have advanced history counters; never move them backwards.
      statements.push(db.prepare('UPDATE sqlite_sequence SET seq=max(seq,(SELECT value FROM json_each(?) WHERE key=name)) WHERE name IN(SELECT key FROM json_each(?))').bind(counters, counters));
    }
    if (statements.length > 19) return reply('Backup is too large for an atomic free-plan restore. Use isolated local recovery.', 413);
    try { await db.batch(statements); } catch { return reply('Restore refused or rolled back. A conflict or database constraint prevented import.', 409); }
    return Response.json({ ok: true, summary, message: 'Business records restored. Reload all open devices. Accounts and connector credentials were not imported.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return reply('Backup operation failed. Retry after checking storage availability.', 503); }
}
