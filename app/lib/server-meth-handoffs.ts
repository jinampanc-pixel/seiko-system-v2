import { env } from "cloudflare:workers";
import { authenticateActor, authorizePermission, type Actor } from "./server-erp-auth";
import {
  activeRateForSku,
  createProductionHandoff,
  type ManufacturingRate,
  type MethChannelOrder,
  type ProductionHandoff,
  type SkuMapping,
} from "./meth-commerce";

const ORDER_SCOPE = "meth";
const ORDER_COLLECTION = "orders";
const HANDOFF_SCOPE = "seiko-meth";
const HANDOFF_COLLECTION = "handoffs";

type Db = NonNullable<typeof env.DB>;
type StoredRow = { document_json: string; version: number; created_at: string | null; updated_at: string };

export class MethHandoffError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export async function ensureMethOrderHandoffsForRequest(request: Request, orderId: string) {
  const actor = await authenticateActor(request);
  if (!actor) throw new MethHandoffError("AUTH_REQUIRED", "Sign in is required.", 401);
  if (!await authorizePermission(actor, "meth", "orders.edit")) throw new MethHandoffError("FORBIDDEN", "You do not have permission to create MeTh production handoffs.", 403);
  return ensureMethOrderHandoffs(orderId, actor);
}

export async function ensureMethOrderHandoffsFromShopify(orderId: string) {
  return ensureMethOrderHandoffs(orderId, { userId: "shopify", email: "shopify-webhook", displayName: "Shopify webhook", source: "chatgpt" });
}

async function ensureMethOrderHandoffs(orderId: string, actor: Actor) {
  const db = requireDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await loadOrder(db, orderId);
    if (!row) throw new MethHandoffError("ORDER_NOT_FOUND", "The MeTh order no longer exists.", 404);
    const order = parse<MethChannelOrder>(row.document_json);
    if (!order) throw new MethHandoffError("ORDER_INVALID", "The MeTh order record is invalid.", 500);
    if (!order.routingDecision || order.routingDecision === "pending") return { order, created: [], blocked: [] as string[] };

    const [mappings, rates, existing] = await Promise.all([
      readCollection<SkuMapping>(db, ORDER_SCOPE, "sku-mappings"),
      readCollection<ManufacturingRate>(db, ORDER_SCOPE, "rates"),
      readCollection<ProductionHandoff>(db, HANDOFF_SCOPE, HANDOFF_COLLECTION),
    ]);
    const activeExisting = new Map(existing
      .filter(item => item.methOrderId === order.id && item.seikoStatus !== "cancelled")
      .map(item => [item.methOrderLineId, item]));
    const created: string[] = [];
    const blocked: string[] = [];
    const nextLines = [] as MethChannelOrder["lines"];

    for (const line of order.lines) {
      if (line.productionRequired <= 0) { nextLines.push(line); continue; }
      const prior = activeExisting.get(line.id);
      if (prior) {
        nextLines.push({ ...line, seikoHandoffIds: unique([...line.seikoHandoffIds, prior.id]) });
        continue;
      }
      const mapping = mappings.find(item => item.active && item.methSku === line.methSku);
      const rate = activeRateForSku(rates, line.methSku);
      if (!mapping || !rate) {
        blocked.push(`${line.methSku}: ${!mapping ? "SKU mapping" : "manufacturing rate"} required`);
        nextLines.push(line);
        continue;
      }

      const handoff = createProductionHandoff(order, line, mapping, rate);
      const traceId = stableTextId(`auto-handoff:${order.id}:${line.id}:${line.productionRequired}:${rate.id}`);
      handoff.traceId = traceId;
      handoff.id = `PH-${traceId.toUpperCase()}`;
      const now = new Date().toISOString();
      handoff.createdAt = now;
      handoff.updatedAt = now;
      await db.prepare(
        `INSERT OR IGNORE INTO jinam_shared_records
         (scope,collection,id,document_json,version,created_at,updated_at,updated_by_user_id,updated_by_email)
         VALUES (?,?,?,?,1,?,?,?,?)`,
      ).bind(HANDOFF_SCOPE, HANDOFF_COLLECTION, handoff.id, JSON.stringify(handoff), now, now, actor.userId, actor.email).run();
      created.push(handoff.id);
      nextLines.push({ ...line, seikoHandoffIds: unique([...line.seikoHandoffIds, handoff.id]) });
    }

    const changed = nextLines.some((line, index) => line.seikoHandoffIds.join("|") !== order.lines[index]?.seikoHandoffIds.join("|"));
    if (!changed) return { order, created, blocked };
    const now = new Date().toISOString();
    const next: MethChannelOrder = { ...order, lines: nextLines, fulfilmentStatus: "awaiting_production", updatedAt: now };
    const updated = await db.prepare(
      `UPDATE jinam_shared_records SET document_json=?,version=?,updated_at=?,updated_by_user_id=?,updated_by_email=?
        WHERE scope=? AND collection=? AND id=? AND version=? RETURNING version`,
    ).bind(JSON.stringify(next), row.version + 1, now, actor.userId, actor.email, ORDER_SCOPE, ORDER_COLLECTION, orderId, row.version).first<{ version: number }>();
    if (updated) return { order: next, created, blocked };
  }
  throw new MethHandoffError("ORDER_VERSION_CONFLICT", "The order changed while production demand was being created.", 409);
}

async function loadOrder(db: Db, orderId: string) {
  return db.prepare(
    `SELECT document_json,version,created_at,updated_at FROM jinam_shared_records WHERE scope=? AND collection=? AND id=?`,
  ).bind(ORDER_SCOPE, ORDER_COLLECTION, orderId).first<StoredRow>();
}

async function readCollection<T>(db: Db, scope: string, collection: string) {
  const result = await db.prepare(`SELECT document_json FROM jinam_shared_records WHERE scope=? AND collection=?`).bind(scope, collection).all<{ document_json: string }>();
  const records: T[] = [];
  for (const row of result.results || []) {
    const value = parse<T>(row.document_json);
    if (value) records.push(value);
  }
  return records;
}

function requireDb() {
  if (!env.DB) throw new MethHandoffError("ERP_DB_NOT_CONFIGURED", "Shared Jinam storage is not connected.", 503);
  return env.DB;
}

function parse<T>(value: string) {
  try { return JSON.parse(value) as T; }
  catch { return null; }
}
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }
function stableTextId(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash >>> 0).toString(36).padStart(7, "0");
}
