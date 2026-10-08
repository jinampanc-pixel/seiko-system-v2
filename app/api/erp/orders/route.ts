import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission } from "../../../lib/server-erp-auth";
import { ORDER_STATUSES } from "../../../lib/order-statuses";

type OrderLike = {
  orderId?: unknown;
  status?: unknown;
  archived?: unknown;
  deletedAt?: string;
  updatedAt?: unknown;
  details?: { orderNo?: unknown };
};

type RequestBody = {
  operation?: "list" | "versions" | "upsert" | "import-local" | "audit" | "status" | "archive" | "delete";
  businessId?: string;
  order?: OrderLike;
  orders?: OrderLike[];
  expectedVersion?: number | null;
  orderId?: string;
  status?: string;
  archived?: boolean;
  confirmOrderNo?: string;
  orderIds?: string[];
  limit?: number;
  afterId?: string;
};

type OrderEnvelope = {
  order: OrderLike;
  version: number;
  updatedAt: string;
  updatedBy: string;
};

type OrderDb = Pick<NonNullable<typeof env.DB>, "prepare">;

type OrderWriteAccess = { canCreate: boolean; canEdit: boolean };

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

  try {
    const actor = await authenticateActor(request);
    if (!actor) return error("AUTH_REQUIRED", "Sign in is required.", 401);

    const operation = body.operation;
    if (!operation) return error("INVALID_OPERATION", "Choose a valid operation.", 400);

    const db = env.DB?.withSession("first-primary");
    if (!db) {
      return error(
        "ERP_DB_NOT_CONFIGURED",
        "Shared ERP storage is not connected yet. The app is still using its local safety copy.",
        503,
      );
    }

    if (operation === "list") {
      if (!await authorizePermission(actor, businessId, "orders.view")) return forbidden();
      if (body.orderIds !== undefined && (!Array.isArray(body.orderIds) || body.orderIds.length > 25 || body.orderIds.some(id => typeof id !== "string" || !id || id.length > 200))) return error("INVALID_ORDER_IDS", "Select up to 25 orders.", 400);
      if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 25)) return error("INVALID_PAGE", "Choose a page size from 1 to 25.", 400);
      if (body.afterId !== undefined && (typeof body.afterId !== "string" || body.afterId.length > 200 || body.limit === undefined)) return error("INVALID_PAGE", "Choose a valid order page.", 400);
      return await listOrders(db, businessId, body);
    }
    if (operation === "versions") {
      if (!await authorizePermission(actor, businessId, "orders.view")) return forbidden();
      const result = await db.prepare("SELECT id, version FROM erp_orders WHERE business_id = ? AND json_extract(document_json, '$.deletedAt') IS NULL").bind(businessId).all<{ id: string; version: number }>();
      return Response.json({ ok: true, data: { versions: (result.results || []).map(row => [row.id, row.version]) } });
    }
    if (operation === "import-local") {
      if (!await authorizePermission(actor, businessId, "orders.create")) return forbidden();
      return await importLocalOrders(db, businessId, actor, body.orders);
    }
    if (operation === "audit") {
      if (!await authorizePermission(actor, businessId, "audit.view")) return forbidden();
      return await auditTrail(db, businessId, body.orderId);
    }
    if (operation === "upsert") {
      const access: OrderWriteAccess = {
        canCreate: Boolean(await authorizePermission(actor, businessId, "orders.create")),
        canEdit: Boolean(await authorizePermission(actor, businessId, "orders.edit")),
      };
      if (!access.canCreate && !access.canEdit) return forbidden();
      return await upsertOrder(db, businessId, actor, body.order, body.expectedVersion, access);
    }
    if (operation === "status" || operation === "archive" || operation === "delete") {
      const membership = await authorizePermission(actor, businessId, "orders.edit");
      if (!membership || (operation === "delete" && membership.role !== "owner")) return forbidden();
      return await mutateOrder(db, businessId, actor, body);
    }
    return error("INVALID_OPERATION", "Choose a valid operation.", 400);
  } catch (cause) {
    console.error("ERP orders API failure", cause);
    return error("ERP_STORAGE_ERROR", "Shared ERP storage is temporarily unavailable.", 503);
  }
}

async function listOrders(db: OrderDb, businessId: string, query: RequestBody) {
  if (query.orderIds?.length === 0) return Response.json({ ok: true, data: { orders: [] } });
  const targeted = query.orderIds !== undefined;
  const paged = !targeted && query.limit !== undefined;
  const clause = targeted ? ` AND id IN (${query.orderIds!.map(() => "?").join(",")})` : paged ? " AND id > ?" : "";
  const parameters = targeted ? [businessId, ...query.orderIds!] : paged ? [businessId, query.afterId || "", query.limit! + 1] : [businessId];
  const result = await db.prepare(
    `SELECT id, document_json, version, updated_at, updated_by_email
       FROM erp_orders
      WHERE business_id = ? AND json_extract(document_json, '$.deletedAt') IS NULL${clause}
      ORDER BY ${paged ? "id ASC LIMIT ?" : "updated_at DESC"}`,
  ).bind(...parameters).all<{ id: string; document_json: string; version: number; updated_at: string; updated_by_email: string }>();

  const orders: OrderEnvelope[] = [];
  const rows = result.results || [];
  const page = paged ? rows.slice(0, query.limit) : rows;
  for (const row of page) {
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
  return Response.json({ ok: true, data: { orders, ...(paged ? { nextCursor: rows.length > query.limit! ? page.at(-1)!.id : null } : {}) } });
}

async function upsertOrder(
  db: OrderDb,
  businessId: string,
  actor: { userId: string; email: string },
  candidate: OrderLike | undefined,
  expectedVersion: number | null | undefined,
  access: OrderWriteAccess,
) {
  const parsed = validateOrder(candidate);
  if (!parsed.ok) return error("INVALID_ORDER", parsed.message, 400);

  const { orderId, orderNo } = parsed;
  const current = await db.prepare(
    `SELECT version, document_json, updated_at, updated_by_email
       FROM erp_orders WHERE business_id = ? AND id = ?`,
  ).bind(businessId, orderId).first<{ version: number; document_json: string; updated_at: string; updated_by_email: string }>();
  if (candidate?.deletedAt || (current && JSON.parse(current.document_json).deletedAt)) return error("ORDER_DELETED", "This order was deleted and cannot be saved again.", 409);

  if (!current && !access.canCreate) return error("FORBIDDEN", "You do not have permission to create orders.", 403);
  if (current && !access.canEdit) return error("FORBIDDEN", "You do not have permission to edit orders.", 403);

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
  db: OrderDb,
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

async function auditTrail(db: OrderDb, businessId: string, orderId?: string) {
  if (!orderId || orderId.length > 128) return error("ORDER_REQUIRED", "Choose an order.", 400);
  const result = await db.prepare(
    `SELECT action, version, actor_user_id, actor_email, at
       FROM erp_audit_events
      WHERE business_id = ? AND entity_type = 'order' AND entity_id = ?
      ORDER BY at DESC LIMIT 250`,
  ).bind(businessId, orderId).all<{ action: string; version: number; actor_user_id: string; actor_email: string; at: string }>();
  return Response.json({ ok: true, data: { events: result.results || [] } });
}

async function mutateOrder(db: OrderDb, businessId: string, actor: { userId: string; email: string }, body: RequestBody) {
  if (!body.orderId || body.orderId.length > 128) return error("ORDER_REQUIRED", "Choose an order.", 400);
  const row = await db.prepare("SELECT version,document_json,updated_at,updated_by_email FROM erp_orders WHERE business_id = ? AND id = ?")
    .bind(businessId, body.orderId).first<{ version: number; document_json: string; updated_at: string; updated_by_email: string }>();
  if (!row) return error("ORDER_NOT_FOUND", "This order no longer exists.", 404);
  const order = JSON.parse(row.document_json) as OrderLike;
  if (order.deletedAt) return error("ORDER_DELETED", "This order was deleted.", 409);
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== row.version) return conflict(row);
  if (body.operation === "status" && !(ORDER_STATUSES as readonly unknown[]).includes(body.status)) return error("INVALID_STATUS", "Choose a valid status.", 400);
  if (body.operation === "archive" && typeof body.archived !== "boolean") return error("INVALID_ARCHIVE", "Choose archive or restore.", 400);
  if (body.operation === "delete" && body.confirmOrderNo !== order.details?.orderNo) return error("CONFIRM_ORDER_NUMBER", "Enter the exact order number to delete it.", 400);
  const now = new Date().toISOString();
  const document = { ...order, updatedAt: now,
    ...(body.operation === "status" ? { status: body.status } : {}),
    ...(body.operation === "archive" ? { archived: body.archived } : {}),
    ...(body.operation === "delete" ? { archived: true, deletedAt: now, deletedBy: actor.email } : {}),
  };
  // Keep the row as a tombstone: stale local imports/upserts cannot resurrect it.
  // The existing UPDATE audit trigger atomically records its immutable snapshot.
  let financialGuard = "";
  if (body.operation === "delete" && businessId === "seiko") {
    for (const table of ["seiko_billing_documents", "seiko_billing_payments"] as const) {
      const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first();
      if (exists) financialGuard += ` AND NOT EXISTS (SELECT 1 FROM ${table} WHERE json_extract(data, '$.orderId') = erp_orders.id)`;
    }
  }
  const changed = await db.prepare(`UPDATE erp_orders SET status = ?, archived = ?, document_json = ?, version = version + 1,
    updated_at = ?, updated_by_user_id = ?, updated_by_email = ?
    WHERE business_id = ? AND id = ? AND version = ?${financialGuard} RETURNING version`)
    .bind(document.status, document.archived ? 1 : 0, JSON.stringify(document), now, actor.userId, actor.email, businessId, body.orderId, row.version).first<{ version: number }>();
  if (!changed) {
    const latest = await db.prepare("SELECT version,document_json,updated_at,updated_by_email FROM erp_orders WHERE business_id = ? AND id = ?")
      .bind(businessId, body.orderId).first<typeof row>();
    if (latest && latest.version !== row.version) return conflict(latest);
    return error("ORDER_HAS_FINANCIAL_RECORDS", "This order has financial documents or payments. Archive it instead.", 409);
  }
  return Response.json({ ok: true, data: { order: document, version: changed.version, updatedAt: now, updatedBy: actor.email } });
}

function validateOrder(candidate: OrderLike | undefined): { ok: true; orderId: string; orderNo: string } | { ok: false; message: string } {
  const orderId = typeof candidate?.orderId === "string" ? candidate.orderId.trim() : "";
  const orderNo = typeof candidate?.details?.orderNo === "string" ? candidate.details.orderNo.trim() : "";
  if (!orderId || orderId.length > 128) return { ok: false, message: "Order ID is missing or invalid." };
  if (!orderNo || orderNo.length > 80) return { ok: false, message: "Order number is missing or invalid." };
  if (candidate?.deletedAt) return { ok: false, message: "Deleted orders cannot be imported or saved." };
  if (!(ORDER_STATUSES as readonly unknown[]).includes(candidate?.status)) return { ok: false, message: "Choose a valid order status." };
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

function forbidden() {
  return error("FORBIDDEN", "You do not have permission for this operation.", 403);
}

function error(code: string, message: string, status: number) {
  return Response.json({ ok: false, code, message }, { status });
}
