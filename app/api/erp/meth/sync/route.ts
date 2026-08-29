import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission, type Actor } from "../../../../lib/server-erp-auth";

type Collection =
  | "orders" | "sku-mappings" | "rates" | "handoffs" | "settlements" | "shipments" | "returns"
  | "intercompany-transactions" | "intercompany-payments" | "legal-profiles" | "channel-connections";

type Body = {
  operation?: "list" | "bulk-upsert";
  businessId?: "meth" | "seiko";
  collection?: Collection;
  records?: unknown[];
};

const COLLECTIONS: readonly Collection[] = [
  "orders", "sku-mappings", "rates", "handoffs", "settlements", "shipments", "returns",
  "intercompany-transactions", "intercompany-payments", "legal-profiles", "channel-connections",
];
const SHARED = new Set<Collection>(["handoffs", "intercompany-transactions", "intercompany-payments"]);
const MAX_RECORDS = 500;
const MAX_RECORD_BYTES = 512 * 1024;

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

  const canRead = await canAccess(actor, businessId, collection, "read");
  if (!canRead) return fail("FORBIDDEN", "You do not have permission for this data.", 403);
  if (body.operation === "bulk-upsert" && !await canAccess(actor, businessId, collection, "write")) {
    return fail("FORBIDDEN", "You do not have permission to change this data.", 403);
  }

  const db = env.DB;
  if (!db) return fail("ERP_DB_NOT_CONFIGURED", "Shared Jinam storage is not connected.", 503);
  await ensureSchema(db);
  const scope = SHARED.has(collection) ? "seiko-meth" : businessId;

  if (body.operation === "list") {
    const rows = await db.prepare(
      `SELECT id, document_json, updated_at, updated_by_email
         FROM jinam_shared_records
        WHERE scope = ? AND collection = ?
        ORDER BY updated_at DESC`,
    ).bind(scope, collection).all<{ id: string; document_json: string; updated_at: string; updated_by_email: string }>();
    const records: unknown[] = [];
    for (const row of rows.results || []) {
      try { records.push(JSON.parse(row.document_json)); } catch { /* skip malformed record */ }
    }
    return Response.json({ ok: true, data: { records, scope, collection } });
  }

  if (body.operation === "bulk-upsert") {
    const records = Array.isArray(body.records) ? body.records : [];
    if (records.length > MAX_RECORDS) return fail("TOO_MANY_RECORDS", `Sync up to ${MAX_RECORDS} records at a time.`, 413);
    let saved = 0;
    for (const value of records) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const id = recordId(collection, record);
      if (!id) continue;
      const json = JSON.stringify(record);
      if (new TextEncoder().encode(json).byteLength > MAX_RECORD_BYTES) continue;
      const updatedAt = recordTimestamp(record);
      await db.prepare(
        `INSERT INTO jinam_shared_records (scope,collection,id,document_json,updated_at,updated_by_user_id,updated_by_email)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(scope,collection,id) DO UPDATE SET
           document_json = excluded.document_json,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_by_email = excluded.updated_by_email
         WHERE excluded.updated_at >= jinam_shared_records.updated_at`,
      ).bind(scope, collection, id, json, updatedAt, actor.userId, actor.email).run();
      saved += 1;
    }
    return Response.json({ ok: true, data: { saved, scope, collection } });
  }

  return fail("INVALID_OPERATION", "Choose list or bulk-upsert.", 400);
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
    return Boolean(await authorizePermission(actor, businessId, mode === "read" ? "settings.manage" : "settings.manage"));
  }
  if (businessId !== "meth") return false;
  if (collection === "settlements") return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "financials.view" : "billing.invoices.manage"));
  if (collection === "shipments") return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "delivery.view" : "delivery.manage"));
  return Boolean(await authorizePermission(actor, "meth", mode === "read" ? "orders.view" : "orders.edit"));
}

function recordId(collection: Collection, record: Record<string, unknown>) {
  const direct = typeof record.id === "string" ? record.id.trim() : "";
  if (direct) return direct.slice(0, 160);
  if (collection === "legal-profiles" && typeof record.businessId === "string") return String(record.businessId).slice(0, 160);
  return "";
}

function recordTimestamp(record: Record<string, unknown>) {
  for (const key of ["updatedAt", "createdAt", "placedAt", "paidAt", "settlementDate"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return new Date().toISOString();
}

async function ensureSchema(db: NonNullable<typeof env.DB>) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_shared_records (
    scope TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    document_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL,
    PRIMARY KEY (scope, collection, id)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS jinam_shared_records_updated_idx ON jinam_shared_records(scope,collection,updated_at)`).run();
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
