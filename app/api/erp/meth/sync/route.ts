import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission, type Actor } from "../../../../lib/server-erp-auth";

type Collection =
  | "orders" | "sku-mappings" | "rates" | "handoffs" | "settlements" | "shipments" | "returns"
  | "intercompany-transactions" | "intercompany-payments" | "legal-profiles" | "channel-connections";

type Mutation = { record?: unknown; expectedVersion?: number | null };
type Body = {
  operation?: "list" | "changes" | "mutate" | "import-local" | "bulk-upsert" | "audit";
  businessId?: "meth" | "seiko";
  collection?: Collection;
  mutations?: Mutation[];
  records?: unknown[];
  sinceSequence?: number;
  id?: string;
};

type StoredRow = {
  id: string;
  document_json: string;
  version: number;
  created_at: string | null;
  updated_at: string;
  updated_by_email: string;
};

type RecordEnvelope = {
  id: string;
  record: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

const COLLECTIONS: readonly Collection[] = [
  "orders", "sku-mappings", "rates", "handoffs", "settlements", "shipments", "returns",
  "intercompany-transactions", "intercompany-payments", "legal-profiles", "channel-connections",
];
const SHARED = new Set<Collection>(["handoffs", "intercompany-transactions", "intercompany-payments"]);
const MAX_RECORDS = 500;
const MAX_MUTATIONS = 100;
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_CHANGE_ROWS = 500;

export async function POST(request: Request) {
  const actor = await authenticateActor(request);
  if (!actor) return fail("AUTH_REQUIRED", "Sign in is required.", 401);

  let body: Body;
  try { body = await request.json() as Body; }
  catch { return fail("INVALID_JSON", "Invalid request.", 400); }

  const businessId = body.businessId;
  const collection = body.collection;
  if ((businessId !== "meth" && businessId !== "seiko") || !collection || !COLLECTIONS.includes(collection)) {
    return fail("INVALID_SCOPE", "Choose a valid business and collection.", 400);
  }

  const operation = body.operation;
  if (!operation) return fail("INVALID_OPERATION", "Choose a valid operation.", 400);
  if (!await canAccess(actor, businessId, collection, "read")) {
    return fail("FORBIDDEN", "You do not have permission for this data.", 403);
  }
  if (["mutate", "import-local", "bulk-upsert"].includes(operation) && !await canAccess(actor, businessId, collection, "write")) {
    return fail("FORBIDDEN", "You do not have permission to change this data.", 403);
  }

  const db = env.DB;
  if (!db) return fail("ERP_DB_NOT_CONFIGURED", "Shared Jinam storage is not connected.", 503);

  try {
    await ensureSchema(db);
    const scope = SHARED.has(collection) ? "seiko-meth" : businessId;

    if (operation === "list") return listRecords(db, scope, collection);
    if (operation === "changes") return listChanges(db, scope, collection, body.sinceSequence);
    if (operation === "mutate") return mutateRecords(db, scope, collection, actor, body.mutations);
    if (operation === "import-local" || operation === "bulk-upsert") return importLocalRecords(db, scope, collection, actor, body.records);
    if (operation === "audit") return auditRecords(db, scope, collection, body.id);
    return fail("INVALID_OPERATION", "Choose a valid operation.", 400);
  } catch (cause) {
    console.error("Jinam commerce storage failure", cause);
    return fail("ERP_STORAGE_ERROR", "Shared Jinam storage is temporarily unavailable.", 503);
  }
}

async function listRecords(db: NonNullable<typeof env.DB>, scope: string, collection: Collection) {
  const rows = await db.prepare(
    `SELECT id, document_json, version, created_at, updated_at, updated_by_email
       FROM jinam_shared_records
      WHERE scope = ? AND collection = ?
      ORDER BY updated_at DESC`,
  ).bind(scope, collection).all<StoredRow>();
  const envelopes = (rows.results || []).map(envelopeFromRow).filter((value): value is RecordEnvelope => Boolean(value));
  const cursor = await currentCursor(db, scope, collection);
  return Response.json({ ok: true, data: { records: envelopes.map(item => item.record), envelopes, cursor, scope, collection, authoritative: true } });
}

async function listChanges(db: NonNullable<typeof env.DB>, scope: string, collection: Collection, sinceSequence: number | undefined) {
  const since = Number.isInteger(sinceSequence) && Number(sinceSequence) >= 0 ? Number(sinceSequence) : 0;
  const result = await db.prepare(
    `SELECT sequence, id, version, action, at, actor_email, snapshot_json
       FROM jinam_shared_changes
      WHERE scope = ? AND collection = ? AND sequence > ?
      ORDER BY sequence ASC
      LIMIT ?`,
  ).bind(scope, collection, since, MAX_CHANGE_ROWS + 1).all<{
    sequence: number;
    id: string;
    version: number;
    action: string;
    at: string;
    actor_email: string;
    snapshot_json: string;
  }>();
  const rows = result.results || [];
  const selected = rows.slice(0, MAX_CHANGE_ROWS);
  const changes: Array<{ sequence: number; id: string; version: number; action: string; at: string; updatedBy: string; record: unknown }> = [];
  for (const row of selected) {
    try {
      changes.push({ sequence: Number(row.sequence), id: row.id, version: Number(row.version), action: row.action, at: row.at, updatedBy: row.actor_email, record: JSON.parse(row.snapshot_json) });
    } catch { /* malformed audit snapshots never break synchronization */ }
  }
  const cursor = changes.length ? changes[changes.length - 1].sequence : since;
  return Response.json({ ok: true, data: { changes, cursor, hasMore: rows.length > MAX_CHANGE_ROWS, scope, collection } });
}

async function mutateRecords(
  db: NonNullable<typeof env.DB>,
  scope: string,
  collection: Collection,
  actor: Actor,
  mutations: Mutation[] | undefined,
) {
  if (!Array.isArray(mutations)) return fail("INVALID_MUTATIONS", "No record changes were supplied.", 400);
  if (mutations.length > MAX_MUTATIONS) return fail("TOO_MANY_MUTATIONS", `Save up to ${MAX_MUTATIONS} record changes at a time.`, 413);

  const saved: RecordEnvelope[] = [];
  const conflicts: RecordEnvelope[] = [];
  const invalid: string[] = [];

  for (const mutation of mutations) {
    const candidate = mutation?.record;
    if (!candidate || typeof candidate !== "object") { invalid.push("unknown"); continue; }
    const record = candidate as Record<string, unknown>;
    const id = recordId(collection, record);
    if (!id) { invalid.push("unknown"); continue; }
    if (!recordFits(record)) { invalid.push(id); continue; }

    const current = await getStoredRow(db, scope, collection, id);
    const expectedVersion = mutation.expectedVersion;
    if (!current) {
      if (expectedVersion !== null && expectedVersion !== undefined && Number(expectedVersion) !== 0) {
        invalid.push(id);
        continue;
      }
      const now = new Date().toISOString();
      const serverRecord = stampServerTime(record, now);
      try {
        await db.prepare(
          `INSERT INTO jinam_shared_records (
             scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email
           ) VALUES (?,?,?,?,1,?,?,?,?)`,
        ).bind(scope, collection, id, JSON.stringify(serverRecord), now, now, actor.userId, actor.email).run();
        const created = await getStoredRow(db, scope, collection, id);
        const envelope = created ? envelopeFromRow(created) : null;
        if (envelope) saved.push(envelope);
        continue;
      } catch {
        const raced = await getStoredRow(db, scope, collection, id);
        const envelope = raced ? envelopeFromRow(raced) : null;
        if (envelope) { conflicts.push(envelope); continue; }
        throw new Error(`Failed to create ${collection}:${id}`);
      }
    }

    if (!Number.isInteger(expectedVersion) || Number(expectedVersion) !== Number(current.version)) {
      const envelope = envelopeFromRow(current);
      if (envelope) conflicts.push(envelope);
      continue;
    }

    const now = new Date().toISOString();
    const nextVersion = Number(current.version) + 1;
    const serverRecord = stampServerTime(record, now);
    const updated = await db.prepare(
      `UPDATE jinam_shared_records
          SET document_json = ?, version = ?, updated_at = ?, updated_by_user_id = ?, updated_by_email = ?
        WHERE scope = ? AND collection = ? AND id = ? AND version = ?
        RETURNING version`,
    ).bind(
      JSON.stringify(serverRecord), nextVersion, now, actor.userId, actor.email,
      scope, collection, id, Number(current.version),
    ).first<{ version: number }>();

    if (!updated) {
      const latest = await getStoredRow(db, scope, collection, id);
      const envelope = latest ? envelopeFromRow(latest) : null;
      if (envelope) conflicts.push(envelope);
      continue;
    }
    const latest = await getStoredRow(db, scope, collection, id);
    const envelope = latest ? envelopeFromRow(latest) : null;
    if (envelope) saved.push(envelope);
  }

  const cursor = await currentCursor(db, scope, collection);
  return Response.json({ ok: conflicts.length === 0, code: conflicts.length ? "VERSION_CONFLICT" : undefined, data: { saved, conflicts, invalid, cursor, authoritative: true } }, { status: conflicts.length ? 409 : 200 });
}

async function importLocalRecords(
  db: NonNullable<typeof env.DB>,
  scope: string,
  collection: Collection,
  actor: Actor,
  records: unknown[] | undefined,
) {
  const candidates = Array.isArray(records) ? records : [];
  if (candidates.length > MAX_RECORDS) return fail("TOO_MANY_RECORDS", `Import up to ${MAX_RECORDS} records at a time.`, 413);
  let imported = 0;
  let existing = 0;
  let invalid = 0;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") { invalid += 1; continue; }
    const record = candidate as Record<string, unknown>;
    const id = recordId(collection, record);
    if (!id || !recordFits(record)) { invalid += 1; continue; }
    const found = await getStoredRow(db, scope, collection, id);
    if (found) { existing += 1; continue; }
    const now = new Date().toISOString();
    const serverRecord = stampServerTime(record, now);
    try {
      await db.prepare(
        `INSERT INTO jinam_shared_records (
           scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email
         ) VALUES (?,?,?,?,1,?,?,?,?)`,
      ).bind(scope, collection, id, JSON.stringify(serverRecord), now, now, actor.userId, actor.email).run();
      imported += 1;
    } catch {
      const raced = await getStoredRow(db, scope, collection, id);
      if (raced) existing += 1;
      else throw new Error(`Failed to import ${collection}:${id}`);
    }
  }
  const cursor = await currentCursor(db, scope, collection);
  return Response.json({ ok: true, data: { imported, existing, invalid, cursor, authoritative: true } });
}

async function auditRecords(db: NonNullable<typeof env.DB>, scope: string, collection: Collection, id: string | undefined) {
  const entityId = typeof id === "string" ? id.trim().slice(0, 160) : "";
  const query = entityId
    ? `SELECT sequence,id,version,action,at,actor_email FROM jinam_shared_changes WHERE scope = ? AND collection = ? AND id = ? ORDER BY sequence DESC LIMIT 250`
    : `SELECT sequence,id,version,action,at,actor_email FROM jinam_shared_changes WHERE scope = ? AND collection = ? ORDER BY sequence DESC LIMIT 250`;
  const result = entityId
    ? await db.prepare(query).bind(scope, collection, entityId).all()
    : await db.prepare(query).bind(scope, collection).all();
  return Response.json({ ok: true, data: { events: result.results || [], scope, collection } });
}

async function canAccess(actor: Actor, businessId: "meth" | "seiko", collection: Collection, mode: "read" | "write") {
  if (collection === "handoffs") {
    if (businessId === "seiko") return Boolean(await authorizePermission(actor, "seiko", mode === "read" ? "production.view" : "production.manage"));
    return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "orders.view" : "orders.edit"));
  }
  if (collection === "intercompany-transactions" || collection === "intercompany-payments") {
    if (mode === "read") return Boolean(await authorizePermission(actor, businessId, "financials.view"));
    return Boolean(await authorizePermission(actor, businessId, "billing.invoices.manage"));
  }
  if (collection === "legal-profiles" || collection === "channel-connections" || collection === "sku-mappings" || collection === "rates") {
    return Boolean(await authorizePermission(actor, businessId, "settings.manage"));
  }
  if (businessId !== "meth") return false;
  if (collection === "settlements") return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "financials.view" : "billing.invoices.manage"));
  if (collection === "shipments") return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "delivery.view" : "delivery.manage"));
  return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "orders.view" : "orders.edit"));
}

async function getStoredRow(db: NonNullable<typeof env.DB>, scope: string, collection: Collection, id: string) {
  return db.prepare(
    `SELECT id, document_json, version, created_at, updated_at, updated_by_email
       FROM jinam_shared_records WHERE scope = ? AND collection = ? AND id = ?`,
  ).bind(scope, collection, id).first<StoredRow>();
}

function envelopeFromRow(row: StoredRow): RecordEnvelope | null {
  try {
    return {
      id: row.id,
      record: JSON.parse(row.document_json),
      version: Math.max(1, Number(row.version) || 1),
      createdAt: row.created_at || row.updated_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by_email,
    };
  } catch { return null; }
}

function recordId(collection: Collection, record: Record<string, unknown>) {
  const direct = typeof record.id === "string" ? record.id.trim() : "";
  if (direct) return direct.slice(0, 160);
  if (collection === "legal-profiles" && typeof record.businessId === "string") return String(record.businessId).slice(0, 160);
  return "";
}

function recordFits(record: Record<string, unknown>) {
  try { return new TextEncoder().encode(JSON.stringify(record)).byteLength <= MAX_RECORD_BYTES; }
  catch { return false; }
}

function stampServerTime(record: Record<string, unknown>, now: string) {
  return { ...record, updatedAt: now };
}

async function currentCursor(db: NonNullable<typeof env.DB>, scope: string, collection: Collection) {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) AS cursor FROM jinam_shared_changes WHERE scope = ? AND collection = ?`,
  ).bind(scope, collection).first<{ cursor: number }>();
  return Number(row?.cursor) || 0;
}

async function ensureSchema(db: NonNullable<typeof env.DB>) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_shared_changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    action TEXT NOT NULL,
    at TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS jinam_shared_changes_scope_idx ON jinam_shared_changes(scope,collection,sequence)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS jinam_shared_changes_entity_idx ON jinam_shared_changes(scope,collection,id,sequence)`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_shared_records (
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    document_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL,
    PRIMARY KEY (scope, collection, id)
  )`).run();
  const columns = await db.prepare(`PRAGMA table_info(jinam_shared_records)`).all<{ name: string }>();
  const names = new Set((columns.results || []).map(column => column.name));
  if (!names.has("version")) await db.prepare(`ALTER TABLE jinam_shared_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1`).run();
  if (!names.has("created_at")) await db.prepare(`ALTER TABLE jinam_shared_records ADD COLUMN created_at TEXT`).run();
  await db.prepare(`UPDATE jinam_shared_records SET created_at = updated_at WHERE created_at IS NULL`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS jinam_shared_records_updated_idx ON jinam_shared_records(scope,collection,updated_at)`).run();

  await db.prepare(`CREATE TRIGGER IF NOT EXISTS jinam_shared_records_insert_audit
    AFTER INSERT ON jinam_shared_records
    BEGIN
      INSERT INTO jinam_shared_changes (scope,collection,id,version,action,at,actor_user_id,actor_email,snapshot_json)
      VALUES (NEW.scope,NEW.collection,NEW.id,NEW.version,'created',NEW.updated_at,NEW.updated_by_user_id,NEW.updated_by_email,NEW.document_json);
    END`).run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS jinam_shared_records_update_audit
    AFTER UPDATE OF document_json, version ON jinam_shared_records
    BEGIN
      INSERT INTO jinam_shared_changes (scope,collection,id,version,action,at,actor_user_id,actor_email,snapshot_json)
      VALUES (NEW.scope,NEW.collection,NEW.id,NEW.version,'updated',NEW.updated_at,NEW.updated_by_user_id,NEW.updated_by_email,NEW.document_json);
    END`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_channel_events (
    provider TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    received_at TEXT NOT NULL,
    payload_fingerprint TEXT NOT NULL,
    PRIMARY KEY (provider, connection_id, external_event_id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_connector_secrets (
    credential_ref TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at TEXT NOT NULL,
    rotated_at TEXT
  )`).run();
}

function fail(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status });
}
