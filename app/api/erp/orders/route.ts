import { env } from "cloudflare:workers";
import { authenticateActor, authorizeBusiness } from "../../../lib/server-erp-auth";

type OrderLike = {
  orderId?: unknown;
  status?: unknown;
  archived?: unknown;
  updatedAt?: unknown;
  details?: { orderNo?: unknown };
};

type RequestBody = {
  operation?: "list" | "upsert" | "import-local" | "audit";
  businessId?: string;
  order?: OrderLike;
  orders?: OrderLike[];
  expectedVersion?: number | null;
  orderId?: string;
};

type OrderEnvelope = {
  order: OrderLike;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

const BUSINESS_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMPORT_ORDERS = 250;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return error("REQUEST_TOO_LARGE", "The request is too large.", 413);

  let body: RequestBody;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return error("REQUEST_TOO_LARGE", "The request is too large.", 413);
    body = JSON.parse(raw) as RequestBody;
  } catch {
    return error("INVALID_JSON", "Invalid request.", 400);
  }

  const businessId = body.businessId?.trim() || "";
  if (!BUSINESS_ID.test(businessId)) return error("BUSINESS_REQUIRED", "Select a valid business.", 400);

  const actor = await authenticateActor(request);
  if (!actor) return error("AUTH_REQUIRED", "Sign in is required.", 401);

  const operation = body.operation;
  if (!operation) return error("INVALID_OPERATION", "Choose a valid operation.", 400);

  const required = operation === "audit" ? "admin" : operation === "list" ? "read" : "write";
  const membership = await authorizeBusiness(actor, businessId, required);
  if (!membership) return error("FORBIDDEN", "You do not have permission for this business.", 403);

  const db = env.DB;
  if (!db) {
    return error(
      "ERP_DB_NOT_CONFIGURED",
      "Shared ERP storage is not connected yet. The app is still using its local safety copy.",
      503,
    );
  }

  try {
    if (operation === "list") return listOrders(db, businessId);
    if (operation === "upsert") return upsertOrder(db, businessId, actor, body.order, body.expectedVersion);
    if (operation === "import-local") return importLocalOrders(db, businessId, actor, body.orders);
    if (operation === "audit") return auditTrail(db, businessId, body.orderId);
    return error("INVALID_OPERATION", "Choose a valid operation.", 400);
  } catch (cause) {
    console.error("ERP orders API failure", cause);
    return error("ERP_STORAGE_ERROR", "Shared ERP storage is temporarily unavailable.", 503);
  }
}

async function listOrders(db: NonNullable<typeof env.DB>, businessId: string) {
  const result = await db.prepare(
    `SELECT document_json, version, updated_at, updated_by_email
       FROM erp_orders
      WHERE business_id = ?
      ORDER BY updated_at DESC`,
  ).bind(businessId).all<{ document_json: string; version: number; updated_at: string; updated_by_email: string }>();

  const orders: OrderEnvelope[] = [];
  for (const row of result.results || []) {
    try {
      orders.push({
        order: JSON.parse(row.document_json) as OrderLike,
        version: Number(row.version) || 1,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by_email,
      });
    } catch {
      // A malformed row is skipped instead of making the entire ERP unusable.
    }
  }
  return Response.json({ ok: true, data: { orders } });
}

async function upsertOrder(
  db: NonNullable<typeof env.DB>,
  businessId: string,
  actor: { userId: string; email: string },
  candidate: OrderLike | undefined,
  expectedVersion: number | null | undefined,
) {
  const parsed = validateOrder(candidate);
  if (!parsed.ok) return error("INVALID_ORDER", parsed.message, 400);

  const { orderId, orderNo } = parsed;
  const current = await db.prepare(
    `SELECT version, document_json, updated_at, updated_by_email
       FROM erp_orders WHERE business_id = ? AND id = ?`,
  ).bind(businessId, orderId).first<{ version: number; document_json: string; updated_at: string; updated_by_email: string }>();

  const now = new Date().toISOString();
  const document = { ...candidate, updatedAt: now } as OrderLike;
  const documentJson = JSON.stringify(document);
  const status = String(candidate?.status || "Draft");
  const archived = candidate?.archived ? 1 : 0;

  if (!current) {
    try {
      await db.prepare(
        `INSERT INTO erp_orders (
           id,business_id,order_no,status,archived,document_json,version,
           created_at,created_by_user_id,created_by_email,
           updated_at,updated_by_user_id,updated_by_email
         ) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?)`,
      ).bind(
        orderId, businessId, orderNo, status, archived, documentJson,
        now, actor.userId, actor.email,
        now, actor.userId, actor.email,
      ).run();
      return Response.json({ ok: true, data: { order: document, version: 1, updatedAt: now, updatedBy: actor.email } });
    } catch (cause) {
      const existingByNumber = await db.prepare(
        `SELECT id FROM erp_orders WHERE business_id = ? AND order_no = ?`,
      ).bind(businessId, orderNo).first<{ id: string }>();
      if (existingByNumber && existingByNumber.id !== orderId) {
        return error("ORDER_NUMBER_CONFLICT", `Order number ${orderNo} already exists.`, 409);
      }
      throw cause;
    }
  }

  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) !== Number(current.version)) {
    return conflict(current);
  }

  const nextVersion = Number(current.version) + 1;
  const updated = await db.prepare(
    `UPDATE erp_orders
        SET order_no = ?, status = ?, archived = ?, document_json = ?, version = ?,
            updated_at = ?, updated_by_user_id = ?, updated_by_email = ?
      WHERE business_id = ? AND id = ? AND version = ?
      RETURNING version`,
  ).bind(
    orderNo, status, archived, documentJson, nextVersion,
    now, actor.userId, actor.email,
    businessId, orderId, Number(current.version),
  ).first<{ version: number }>();

  if (!updated) {
    const latest = await db.prepare(
      `SELECT version, document_json, updated_at, updated_by_email
         FROM erp_orders WHERE business_id = ? AND id = ?`,
    ).bind(businessId, orderId).first<{ version: number; document_json: string; updated_at: string; updated_by_email: string }>();
    return latest ? conflict(latest) : error("ORDER_CHANGED", "The order changed while you were saving. Reload and retry.", 409);
  }

  return Response.json({ ok: true, data: { order: document, version: nextVersion, updatedAt: now, updatedBy: actor.email } });
}

async function importLocalOrders(
  db: NonNullable<typeof env.DB>,
  businessId: string,
  actor: { userId: string; email: string },
  candidates: OrderLike[] | undefined,
) {
  if (!Array.isArray(candidates)) return error("INVALID_IMPORT", "No local orders were supplied.", 400);
  if (candidates.length > MAX_IMPORT_ORDERS) return error("IMPORT_TOO_LARGE", `Import up to ${MAX_IMPORT_ORDERS} orders at a time.`, 413);

  const imported: string[] = [];
  const existing: string[] = [];
  const invalid: string[] = [];

  for (const candidate of candidates) {
    const parsed = validateOrder(candidate);
    if (!parsed.ok) {
      invalid.push(String(candidate?.orderId || "unknown"));
      continue;
    }

    const found = await db.prepare(
      `SELECT id FROM erp_orders WHERE business_id = ? AND (id = ? OR order_no = ?) LIMIT 1`,
    ).bind(businessId, parsed.orderId, parsed.orderNo).first<{ id: string }>();
    if (found) {
      existing.push(parsed.orderId);
      continue;
    }

    const now = new Date().toISOString();
    const document = { ...candidate, updatedAt: now } as OrderLike;
    await db.prepare(
      `INSERT INTO erp_orders (
         id,business_id,order_no,status,archived,document_json,version,
         created_at,created_by_user_id,created_by_email,
         updated_at,updated_by_user_id,updated_by_email
       ) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?)`,
    ).bind(
      parsed.orderId, businessId, parsed.orderNo, String(candidate.status || "Draft"), candidate.archived ? 1 : 0,
      JSON.stringify(document), now, actor.userId, actor.email, now, actor.userId, actor.email,
    ).run();
    imported.push(parsed.orderId);
  }

  return Response.json({ ok: true, data: { imported, existing, invalid } });
}

async function auditTrail(db: NonNullable<typeof env.DB>, businessId: string, orderId?: string) {
  if (!orderId || orderId.length > 128) return error("ORDER_REQUIRED", "Choose an order.", 400);
  const result = await db.prepare(
    `SELECT action, version, actor_user_id, actor_email, at
       FROM erp_audit_events
      WHERE business_id = ? AND entity_type = 'order' AND entity_id = ?
      ORDER BY at DESC LIMIT 250`,
  ).bind(businessId, orderId).all<{ action: string; version: number; actor_user_id: string; actor_email: string; at: string }>();
  return Response.json({ ok: true, data: { events: result.results || [] } });
}

function validateOrder(candidate: OrderLike | undefined): { ok: true; orderId: string; orderNo: string } | { ok: false; message: string } {
  const orderId = typeof candidate?.orderId === "string" ? candidate.orderId.trim() : "";
  const orderNo = typeof candidate?.details?.orderNo === "string" ? candidate.details.orderNo.trim() : "";
  if (!orderId || orderId.length > 128) return { ok: false, message: "Order ID is missing or invalid." };
  if (!orderNo || orderNo.length > 80) return { ok: false, message: "Order number is missing or invalid." };
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
    if (bytes > 5 * 1024 * 1024) return { ok: false, message: "This order is too large to save safely." };
  } catch {
    return { ok: false, message: "Order data is invalid." };
  }
  return { ok: true, orderId, orderNo };
}

function conflict(current: { version: number; document_json: string; updated_at: string; updated_by_email: string }) {
  let order: unknown = null;
  try { order = JSON.parse(current.document_json); } catch { /* return metadata even if snapshot parsing fails */ }
  return Response.json({
    ok: false,
    code: "VERSION_CONFLICT",
    message: `This order was changed by ${current.updated_by_email}. Reload before saving your version.`,
    data: { order, version: Number(current.version), updatedAt: current.updated_at, updatedBy: current.updated_by_email },
  }, { status: 409 });
}

function error(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status });
}
