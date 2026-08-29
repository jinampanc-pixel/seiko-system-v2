import { env } from "cloudflare:workers";
import { authorizePermission, authenticateActor, type Actor } from "./server-erp-auth";
import {
  normalizeChannelOrder,
  type CustomerPaymentStatus,
  type MethChannelOrder,
  type MethFinishedStockBalance,
  type MethFulfilmentPolicy,
  type MethFulfilmentPolicySettings,
  type MethOrderLine,
  type MethRoutingDecision,
  type SkuMapping,
} from "./meth-commerce";

const SETTINGS_ID = "fulfilment-policy";
const ORDER_SCOPE = "meth";
const ORDER_COLLECTION = "orders";
const DEFAULT_POLICY: MethFulfilmentPolicy = "stock_first";

type Db = NonNullable<typeof env.DB>;
type StoredOrderRow = { document_json: string; version: number; created_at: string | null; updated_at: string };
type StockRow = { meth_sku: string; on_hand: number; reserved: number; updated_at: string };
type ShopifyLine = {
  id?: string | number;
  sku?: string;
  variant_id?: string | number | null;
  title?: string;
  name?: string;
  variant_title?: string | null;
  quantity?: number;
  price?: string | number;
  total_discount?: string | number;
  tax_lines?: Array<{ price?: string | number }>;
};
type ShopifyOrder = {
  id?: string | number;
  name?: string;
  order_number?: string | number;
  created_at?: string;
  processed_at?: string;
  updated_at?: string;
  currency?: string;
  email?: string;
  phone?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  total_discounts?: string | number;
  customer?: { id?: string | number; first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  shipping_address?: Record<string, unknown> | null;
  billing_address?: Record<string, unknown> | null;
  shipping_lines?: Array<{ price?: string | number }>;
  line_items?: ShopifyLine[];
};

export class MethFulfilmentError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export async function getMethFulfilmentSettings(request: Request) {
  const actor = await requireActor(request, "settings.manage");
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  return { settings: await readPolicy(db), actor };
}

export async function saveMethFulfilmentSettings(request: Request) {
  const actor = await requireActor(request, "settings.manage");
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  const body = await readJson<{ defaultPolicy?: MethFulfilmentPolicy }>(request);
  const policy = body.defaultPolicy;
  if (policy !== "stock_first" && policy !== "decide") {
    throw new MethFulfilmentError("INVALID_FULFILMENT_POLICY", "Choose Stock first or Decide per order.", 400);
  }
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO jinam_meth_fulfilment_settings (id,default_policy,updated_at,updated_by_user_id,updated_by_email)
     VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET default_policy=excluded.default_policy,updated_at=excluded.updated_at,
       updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email`,
  ).bind(SETTINGS_ID, policy, now, actor.userId, actor.email).run();
  return { settings: await readPolicy(db) };
}

export async function listMethFinishedStock(request: Request) {
  await requireActor(request, "orders.view");
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  const rows = await db.prepare(
    `SELECT meth_sku,on_hand,reserved,updated_at FROM jinam_meth_finished_stock ORDER BY meth_sku`,
  ).all<StockRow>();
  return { balances: (rows.results || []).map(stockBalance) };
}

export async function saveMethFinishedStock(request: Request) {
  const actor = await requireActor(request, "settings.manage");
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  const body = await readJson<{ methSku?: string; onHand?: number }>(request);
  const methSku = cleanSku(body.methSku || "");
  const onHand = whole(body.onHand);
  if (!methSku) throw new MethFulfilmentError("METH_SKU_REQUIRED", "Enter a MeTh SKU.", 400);
  if (onHand < 0) throw new MethFulfilmentError("INVALID_STOCK", "Finished stock cannot be negative.", 400);
  const current = await db.prepare(`SELECT meth_sku,on_hand,reserved,updated_at FROM jinam_meth_finished_stock WHERE meth_sku=?`).bind(methSku).first<StockRow>();
  if (current && onHand < current.reserved) {
    throw new MethFulfilmentError("STOCK_BELOW_RESERVED", `On-hand stock cannot be below ${current.reserved} already reserved units.`, 409);
  }
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO jinam_meth_finished_stock (meth_sku,on_hand,reserved,updated_at,updated_by_user_id,updated_by_email)
     VALUES (?,?,0,?,?,?)
     ON CONFLICT(meth_sku) DO UPDATE SET on_hand=excluded.on_hand,updated_at=excluded.updated_at,
       updated_by_user_id=excluded.updated_by_user_id,updated_by_email=excluded.updated_by_email`,
  ).bind(methSku, onHand, now, actor.userId, actor.email).run();
  const row = await db.prepare(`SELECT meth_sku,on_hand,reserved,updated_at FROM jinam_meth_finished_stock WHERE meth_sku=?`).bind(methSku).first<StockRow>();
  return { balance: row ? stockBalance(row) : null };
}

export async function routeMethOrder(request: Request) {
  const actor = await requireActor(request, "orders.edit");
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  const body = await readJson<{ orderId?: string; decision?: MethRoutingDecision }>(request);
  const orderId = String(body.orderId || "").trim();
  if (!orderId) throw new MethFulfilmentError("ORDER_ID_REQUIRED", "Choose a MeTh order.", 400);
  if (body.decision !== "stock_first" && body.decision !== "produce") {
    throw new MethFulfilmentError("ROUTING_DECISION_REQUIRED", "Choose Use stock first or Produce full order.", 400);
  }
  const result = await routeStoredOrder(db, orderId, body.decision, actor, `manual:${orderId}`);
  return { order: result };
}

export async function ingestShopifyOrderWebhook(input: {
  webhookId: string;
  eventId?: string;
  topic: string;
  rawBody: string;
}) {
  if (input.topic !== "orders/create" && input.topic !== "orders/updated") return { processed: false, reason: "topic_not_order" };
  const db = requireDb();
  await ensureMethFulfilmentSchema(db);
  let payload: ShopifyOrder;
  try { payload = JSON.parse(input.rawBody) as ShopifyOrder; }
  catch { throw new MethFulfilmentError("SHOPIFY_ORDER_INVALID", "Verified Shopify order payload is not valid JSON.", 400); }
  const externalOrderId = String(payload.id || "").trim();
  if (!externalOrderId) throw new MethFulfilmentError("SHOPIFY_ORDER_ID_REQUIRED", "Shopify order payload has no order ID.", 400);

  const policy = await readPolicy(db);
  const mappings = await readSkuMappings(db);
  const existing = await loadOrderByExternalId(db, "shopify", externalOrderId);
  const routingDecision: MethRoutingDecision = existing?.order.routingDecision
    || (policy.defaultPolicy === "decide" ? "pending" : "pending");
  const lines = mapShopifyLines(payload.line_items || [], mappings, existing?.order);
  const placedAt = payload.created_at || payload.processed_at || new Date().toISOString();
  const advanced = existing?.order && !["unfulfilled", "awaiting_production", "ready_to_pack"].includes(existing.order.fulfilmentStatus)
    ? existing.order.fulfilmentStatus
    : undefined;
  const normalized = normalizeChannelOrder({
    id: existing?.order.id,
    orderNumber: existing?.order.orderNumber,
    channel: {
      channel: "shopify",
      externalOrderId,
      externalOrderNumber: String(payload.name || payload.order_number || ""),
      externalCustomerId: payload.customer?.id ? String(payload.customer.id) : undefined,
      importedAt: new Date().toISOString(),
    },
    customerName: customerName(payload),
    customerEmail: payload.email || payload.customer?.email || undefined,
    customerPhone: payload.phone || payload.customer?.phone || undefined,
    shippingAddress: addressText(payload.shipping_address),
    billingAddress: addressText(payload.billing_address),
    currency: payload.currency || "INR",
    lines,
    shippingCharged: sumMoney((payload.shipping_lines || []).map(line => line.price)),
    orderDiscount: money(payload.total_discounts),
    customerPaymentStatus: shopifyPaymentStatus(payload.financial_status),
    settlementStatus: "pending",
    fulfilmentPolicy: existing?.order.fulfilmentPolicy || policy.defaultPolicy,
    routingDecision,
    fulfilmentStatus: advanced || "unfulfilled",
    placedAt,
  });
  if (advanced) normalized.fulfilmentStatus = advanced;
  const saved = await saveShopifyOrder(db, normalized, existing?.version);

  let routed = saved;
  if ((saved.fulfilmentPolicy || DEFAULT_POLICY) === "stock_first" && (saved.routingDecision || "pending") === "pending") {
    routed = await routeStoredOrder(db, saved.id, "stock_first", shopifyActor(), `shopify:${input.webhookId}`);
  }
  await db.prepare(
    `UPDATE jinam_channel_event_inbox SET processing_status='processed',processed_at=?,processing_error=NULL
      WHERE provider='shopify' AND external_event_id=?`,
  ).bind(new Date().toISOString(), input.webhookId).run();
  return { processed: true, orderId: routed.id, orderNumber: routed.orderNumber, policy: routed.fulfilmentPolicy, routingDecision: routed.routingDecision };
}

export async function markShopifyOrderWebhookFailed(webhookId: string, cause: unknown) {
  const db = env.DB;
  if (!db) return;
  try {
    await ensureMethFulfilmentSchema(db);
    const message = cause instanceof Error ? cause.message : "Unknown order processing error";
    await db.prepare(
      `UPDATE jinam_channel_event_inbox SET processing_status='failed',processed_at=?,processing_error=?
        WHERE provider='shopify' AND external_event_id=?`,
    ).bind(new Date().toISOString(), message.slice(0, 1000), webhookId).run();
  } catch (secondary) {
    console.error("Could not mark Shopify order event failed", secondary);
  }
}

async function routeStoredOrder(db: Db, orderId: string, decision: Exclude<MethRoutingDecision, "pending">, actor: Actor, claimId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await loadOrder(db, orderId);
    if (!row) throw new MethFulfilmentError("ORDER_NOT_FOUND", "The MeTh order no longer exists.", 404);
    const order = parseOrder(row.document_json);
    if (!order) throw new MethFulfilmentError("ORDER_INVALID", "The MeTh order record is invalid.", 500);
    if (order.routingDecision && order.routingDecision !== "pending") return order;

    const claimed = await claimRouting(db, claimId, orderId, decision);
    if (!claimed) {
      const existing = await db.prepare(`SELECT status FROM jinam_meth_order_routing_claims WHERE claim_id=?`).bind(claimId).first<{ status: string }>();
      if (existing?.status === "completed") {
        const completed = await loadOrder(db, orderId);
        const parsed = completed ? parseOrder(completed.document_json) : null;
        if (parsed) return parsed;
      }
      throw new MethFulfilmentError("ORDER_ROUTING_IN_PROGRESS", "This order is already being routed. Refresh and try again if it does not complete.", 409);
    }

    const reserved: Array<{ sku: string; quantity: number }> = [];
    try {
      const lines: MethOrderLine[] = [];
      for (const line of order.lines) {
        const quantity = whole(line.quantity);
        if (decision === "produce") {
          lines.push({ ...line, quantity, finishedStockAllocated: 0, productionRequired: quantity });
          continue;
        }
        const allocation = await reserveStock(db, line.methSku, quantity, actor);
        if (allocation > 0) reserved.push({ sku: line.methSku, quantity: allocation });
        lines.push({ ...line, quantity, finishedStockAllocated: allocation, productionRequired: Math.max(0, quantity - allocation) });
      }
      const needsProduction = lines.some(line => line.productionRequired > 0);
      const next: MethChannelOrder = {
        ...order,
        routingDecision: decision,
        lines,
        fulfilmentStatus: needsProduction ? "awaiting_production" : "ready_to_pack",
        updatedAt: new Date().toISOString(),
      };
      const updated = await updateOrderCas(db, orderId, row.version, next, actor);
      if (updated) {
        await finishClaim(db, claimId, "completed");
        return next;
      }
      for (const item of reserved) await releaseStock(db, item.sku, item.quantity, actor);
      await finishClaim(db, claimId, "failed");
    } catch (cause) {
      for (const item of reserved) await releaseStock(db, item.sku, item.quantity, actor);
      await finishClaim(db, claimId, "failed");
      throw cause;
    }
  }
  throw new MethFulfilmentError("ORDER_VERSION_CONFLICT", "The order changed while routing. Refresh and try again.", 409);
}

async function saveShopifyOrder(db: Db, order: MethChannelOrder, expectedVersion?: number) {
  const actor = shopifyActor();
  const now = new Date().toISOString();
  const serverOrder = { ...order, updatedAt: now };
  if (!expectedVersion) {
    try {
      await db.prepare(
        `INSERT INTO jinam_shared_records (scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email)
         VALUES (?,?,?,?,1,?,?,?,?)`,
      ).bind(ORDER_SCOPE, ORDER_COLLECTION, order.id, JSON.stringify(serverOrder), now, now, actor.userId, actor.email).run();
      return serverOrder;
    } catch {
      const raced = await loadOrder(db, order.id);
      if (!raced) throw new MethFulfilmentError("ORDER_SAVE_FAILED", "Shopify order could not be stored.", 503);
      expectedVersion = raced.version;
    }
  }
  const updated = await updateOrderCas(db, order.id, expectedVersion, serverOrder, actor);
  if (!updated) {
    const current = await loadOrder(db, order.id);
    if (!current) throw new MethFulfilmentError("ORDER_SAVE_FAILED", "Shopify order could not be stored.", 503);
    const currentOrder = parseOrder(current.document_json);
    if (!currentOrder) throw new MethFulfilmentError("ORDER_INVALID", "Stored MeTh order is invalid.", 500);
    return currentOrder;
  }
  return serverOrder;
}

async function updateOrderCas(db: Db, orderId: string, version: number, order: MethChannelOrder, actor: Actor) {
  const now = new Date().toISOString();
  const record = { ...order, updatedAt: now };
  const result = await db.prepare(
    `UPDATE jinam_shared_records
        SET document_json=?,version=?,updated_at=?,updated_by_user_id=?,updated_by_email=?
      WHERE scope=? AND collection=? AND id=? AND version=? RETURNING version`,
  ).bind(JSON.stringify(record), version + 1, now, actor.userId, actor.email, ORDER_SCOPE, ORDER_COLLECTION, orderId, version).first<{ version: number }>();
  return Boolean(result);
}

async function loadOrder(db: Db, orderId: string) {
  return db.prepare(
    `SELECT document_json,version,created_at,updated_at FROM jinam_shared_records
      WHERE scope=? AND collection=? AND id=?`,
  ).bind(ORDER_SCOPE, ORDER_COLLECTION, orderId).first<StoredOrderRow>();
}

async function loadOrderByExternalId(db: Db, channel: string, externalOrderId: string) {
  const rows = await db.prepare(
    `SELECT document_json,version,created_at,updated_at FROM jinam_shared_records WHERE scope=? AND collection=?`,
  ).bind(ORDER_SCOPE, ORDER_COLLECTION).all<StoredOrderRow>();
  for (const row of rows.results || []) {
    const order = parseOrder(row.document_json);
    if (order?.channel.channel === channel && order.channel.externalOrderId === externalOrderId) return { order, version: row.version };
  }
  return null;
}

async function readSkuMappings(db: Db) {
  const result = await db.prepare(
    `SELECT document_json FROM jinam_shared_records WHERE scope='meth' AND collection='sku-mappings'`,
  ).all<{ document_json: string }>();
  const mappings: SkuMapping[] = [];
  for (const row of result.results || []) {
    try {
      const value = JSON.parse(row.document_json) as SkuMapping;
      if (value?.active && value.methSku) mappings.push(value);
    } catch { /* ignore malformed mapping */ }
  }
  return mappings;
}

function mapShopifyLines(lines: ShopifyLine[], mappings: SkuMapping[], existing?: MethChannelOrder) {
  const prior = new Map((existing?.lines || []).map(line => [line.externalLineId || line.id, line]));
  return lines.map((line, index): MethOrderLine => {
    const externalLineId = String(line.id || `line-${index + 1}`);
    const variantId = line.variant_id == null ? "" : String(line.variant_id);
    const rawSku = cleanSku(line.sku || "");
    const mapping = mappings.find(item => (variantId && item.shopifyVariantId === variantId) || (rawSku && item.methSku === rawSku));
    const methSku = mapping?.methSku || rawSku || `SHOPIFY-${variantId || externalLineId}`;
    const old = prior.get(externalLineId);
    const quantity = whole(line.quantity || 0);
    const decision = existing?.routingDecision || "pending";
    const previousAllocated = Math.min(quantity, whole(old?.finishedStockAllocated || 0));
    const finishedStockAllocated = decision === "stock_first" ? previousAllocated : 0;
    const productionRequired = decision === "produce" ? quantity : decision === "stock_first" ? Math.max(0, quantity - finishedStockAllocated) : 0;
    return {
      id: old?.id || `shp-line-${stableTextId(externalLineId)}`,
      externalLineId,
      methSku,
      productName: mapping?.productName || String(line.title || line.name || methSku),
      size: mapping?.size || undefined,
      colour: mapping?.colour || undefined,
      quantity,
      unitSellingPrice: money(line.price),
      discount: money(line.total_discount),
      taxAmount: sumMoney((line.tax_lines || []).map(item => item.price)),
      finishedStockAllocated,
      productionRequired,
      seikoHandoffIds: old?.seikoHandoffIds || [],
    };
  });
}

async function readPolicy(db: Db): Promise<MethFulfilmentPolicySettings> {
  const row = await db.prepare(
    `SELECT default_policy,updated_at,updated_by_email FROM jinam_meth_fulfilment_settings WHERE id=?`,
  ).bind(SETTINGS_ID).first<{ default_policy: string; updated_at: string; updated_by_email: string }>();
  return {
    id: SETTINGS_ID,
    defaultPolicy: row?.default_policy === "decide" ? "decide" : DEFAULT_POLICY,
    updatedAt: row?.updated_at || new Date(0).toISOString(),
    updatedBy: row?.updated_by_email || undefined,
  };
}

async function reserveStock(db: Db, skuInput: string, requestedInput: number, actor: Actor) {
  const sku = cleanSku(skuInput);
  const requested = whole(requestedInput);
  if (!sku || requested <= 0) return 0;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO jinam_meth_finished_stock (meth_sku,on_hand,reserved,updated_at,updated_by_user_id,updated_by_email)
     VALUES (?,0,0,?,?,?)`,
  ).bind(sku, now, actor.userId, actor.email).run();
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await db.prepare(`SELECT meth_sku,on_hand,reserved,updated_at FROM jinam_meth_finished_stock WHERE meth_sku=?`).bind(sku).first<StockRow>();
    if (!current) return 0;
    const available = Math.max(0, whole(current.on_hand) - whole(current.reserved));
    const allocation = Math.min(requested, available);
    if (allocation <= 0) return 0;
    const updated = await db.prepare(
      `UPDATE jinam_meth_finished_stock SET reserved=reserved+?,updated_at=?,updated_by_user_id=?,updated_by_email=?
        WHERE meth_sku=? AND on_hand=? AND reserved=? RETURNING reserved`,
    ).bind(allocation, now, actor.userId, actor.email, sku, current.on_hand, current.reserved).first<{ reserved: number }>();
    if (updated) return allocation;
  }
  throw new MethFulfilmentError("STOCK_RESERVATION_CONFLICT", `Finished stock for ${sku} changed while reserving it.`, 409);
}

async function releaseStock(db: Db, skuInput: string, quantityInput: number, actor: Actor) {
  const sku = cleanSku(skuInput);
  const quantity = whole(quantityInput);
  if (!sku || quantity <= 0) return;
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE jinam_meth_finished_stock SET reserved=MAX(0,reserved-?),updated_at=?,updated_by_user_id=?,updated_by_email=? WHERE meth_sku=?`,
  ).bind(quantity, now, actor.userId, actor.email, sku).run();
}

async function claimRouting(db: Db, claimId: string, orderId: string, decision: string) {
  const result = await db.prepare(
    `INSERT OR IGNORE INTO jinam_meth_order_routing_claims (claim_id,order_id,decision,status,created_at,updated_at)
     VALUES (?,?,?,'processing',?,?) RETURNING claim_id`,
  ).bind(claimId, orderId, decision, new Date().toISOString(), new Date().toISOString()).first<{ claim_id: string }>();
  return Boolean(result);
}

async function finishClaim(db: Db, claimId: string, status: "completed" | "failed") {
  await db.prepare(`UPDATE jinam_meth_order_routing_claims SET status=?,updated_at=? WHERE claim_id=?`).bind(status, new Date().toISOString(), claimId).run();
}

async function requireActor(request: Request, permission: "settings.manage" | "orders.view" | "orders.edit") {
  const actor = await authenticateActor(request);
  if (!actor) throw new MethFulfilmentError("AUTH_REQUIRED", "Sign in is required.", 401);
  if (!await authorizePermission(actor, "meth", permission)) throw new MethFulfilmentError("FORBIDDEN", "You do not have permission for this MeTh action.", 403);
  return actor;
}

function requireDb() {
  if (!env.DB) throw new MethFulfilmentError("ERP_DB_NOT_CONFIGURED", "Shared Jinam storage is not connected.", 503);
  return env.DB;
}

async function ensureMethFulfilmentSchema(db: Db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_meth_fulfilment_settings (
    id TEXT PRIMARY KEY,
    default_policy TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_meth_finished_stock (
    meth_sku TEXT PRIMARY KEY,
    on_hand INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    updated_by_email TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS jinam_meth_order_routing_claims (
    claim_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS jinam_meth_order_routing_order_idx ON jinam_meth_order_routing_claims(order_id,updated_at)`).run();

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
}

function parseOrder(value: string) {
  try { return JSON.parse(value) as MethChannelOrder; }
  catch { return null; }
}

function stockBalance(row: StockRow): MethFinishedStockBalance {
  return { methSku: row.meth_sku, onHand: whole(row.on_hand), reserved: whole(row.reserved), available: Math.max(0, whole(row.on_hand) - whole(row.reserved)), updatedAt: row.updated_at };
}

function customerName(order: ShopifyOrder) {
  const first = String(order.customer?.first_name || "").trim();
  const last = String(order.customer?.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || order.email || "Shopify customer";
}

function addressText(address?: Record<string, unknown> | null) {
  if (!address) return undefined;
  const parts = ["name", "company", "address1", "address2", "city", "province", "zip", "country"]
    .map(key => typeof address[key] === "string" ? String(address[key]).trim() : "")
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function shopifyPaymentStatus(value?: string): CustomerPaymentStatus {
  const status = String(value || "").toLowerCase();
  if (status === "paid") return "paid";
  if (status === "authorized") return "authorized";
  if (status === "partially_refunded") return "part_refunded";
  if (status === "refunded" || status === "voided") return "refunded";
  if (status === "pending") return "unpaid";
  return "unpaid";
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; }
  catch { throw new MethFulfilmentError("INVALID_JSON", "Invalid request.", 400); }
}

function cleanSku(value: string) { return value.trim().slice(0, 160); }
function whole(value: unknown) { return Math.max(0, Math.floor(Number(value) || 0)); }
function money(value: unknown) { return Math.max(0, Number(value) || 0); }
function sumMoney(values: unknown[]) { return values.reduce<number>((sum, value) => sum + money(value), 0); }
function stableTextId(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash >>> 0).toString(36).padStart(7, "0");
}
function shopifyActor(): Actor { return { userId: "shopify", email: "shopify-webhook", displayName: "Shopify webhook", source: "chatgpt" }; }
