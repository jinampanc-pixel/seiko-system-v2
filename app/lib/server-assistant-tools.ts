import { env } from "cloudflare:workers";
import { POST as orders } from "../api/erp/orders/route";
import { POST as search } from "../api/erp/search/route";
import { POST as person } from "../api/erp/people/route";
import { POST as production } from "../api/erp/production/route";
import { POST as billing } from "../api/erp/billing/route";
import { POST as billingReview } from "../api/erp/order-billing/route";
import { POST as trace } from "../api/seiko/route";
import { authenticateActor, authorizePermission } from "./server-erp-auth";
import { assistantOrderExample } from "./assistant-prompt";
import { assistantOrderReview, assertAssistantOrder, patchAssistantOrder, type AssistantPatch } from "./assistant-domain";
import { ORDER_STATUSES, saveRevision, type SeikoOrder } from "./order-domain";
import { documentTotals, invoiceOutstanding, roundMoney, type SeikoCommercialDocument, type SeikoPaymentRecord } from "./seiko-billing";

type Args = Record<string, unknown>;
type ToolContext = { request: Request; business: string; userId: string };
export type PreparedAction = { tool: string; payload: Args; review: unknown };
async function call(ctx: ToolContext, handler: (r: Request) => Promise<Response>, payload: Args) {
  const headers = new Headers(ctx.request.headers);
  headers.delete("content-length"); headers.set("content-type", "application/json");
  const response = await handler(new Request(ctx.request.url, { method: "POST", headers, body: JSON.stringify({ ...payload, businessId: ctx.business }) }));
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || "Business action could not complete.");
  return data;
}
async function currentOrder(ctx: ToolContext, orderId: unknown) {
  if (typeof orderId !== "string" || !orderId || orderId.length > 150) throw new Error("Choose an order first.");
  const result = await call(ctx, orders, { operation: "list", orderIds: [orderId] });
  const row = result.data.orders.find((e: { order: SeikoOrder }) => e.order.orderId === orderId);
  if (!row) throw new Error("Order not found.");
  return row as { order: SeikoOrder; version: number };
}
export async function readAssistantTool(ctx: ToolContext, tool: string, args: Args): Promise<unknown> {
  if (tool === "search") return call(ctx, search, { query: args.query, page: args.page || 1 });
  if (tool === "orders") {
    if (args.orderIds) return call(ctx, orders, { operation: "list", orderIds: args.orderIds });
    const result = await call(ctx, orders, { operation: "list", limit: Math.min(25, Number(args.limit) || 10), afterId: args.afterId || "" });
    return { ...result, data: { ...result.data, orders: result.data.orders.map((e: { order: SeikoOrder; version: number }) => ({ orderId: e.order.orderId, details: e.order.details, status: e.order.status, version: e.version, updatedAt: e.order.updatedAt, products: e.order.products.map(p => ({ id: p.id, name: p.name })), personCount: e.order.records.length })) } };
  }
  if (tool === "person") return call(ctx, person, { operation: "detail", orderId: args.orderId, recordId: args.recordId });
  if (tool === "production") return call(ctx, production, { ...args, operation: "list" });
  if (tool === "billing_review") return call(ctx, billingReview, { orderId: args.orderId, basis: args.basis || "eligible", operation: "review" });
  if (tool === "trace") {
    if (!["traceSearch", "traceRecord"].includes(String(args.action))) throw new Error("Choose a trace lookup.");
    return call(ctx, trace, { action: args.action, payload: args.payload });
  }
  if (tool === "balance") {
    if (ctx.business !== "seiko") throw new Error("This financial service is available for Seiko.");
    const result = await call(ctx, billing, { operation: "list" });
    const query = String(args.clientName || "").trim().toLocaleLowerCase();
    if (query.length < 2) throw new Error("Specify a client name.");
    const documents = result.documents as SeikoCommercialDocument[], payments = result.payments as SeikoPaymentRecord[];
    const names = [...new Set(documents.map(d => d.clientName).filter(n => n.toLocaleLowerCase().includes(query)))];
    const exact = names.filter(n => n.toLocaleLowerCase() === query);
    if (exact.length !== 1) return { requiresClientSelection: true, candidates: names, note: "No unique exact client match. Ask the user to choose; do not infer a zero balance." };
    const invoices = documents.filter(d => d.clientName === exact[0] && d.kind === "invoice" && d.status !== "cancelled" && !d.deletedAt);
    const rows = invoices.map(d => ({ invoice: d.number, orderNo: d.orderNo, total: documentTotals(d).total, outstanding: invoiceOutstanding(d, payments) }));
    return { client: exact[0], currency: "INR", invoices: rows, invoiceBalance: roundMoney(rows.reduce((n, r) => n + r.outstanding, 0)), note: "Recorded invoice balance after app payment allocations; excludes unbilled orders. Unallocated advances/credits need separate reconciliation.", asOf: new Date().toISOString() };
  }
  if (tool === "catalog") {
    const actor = await authenticateActor(ctx.request);
    if (!actor || !await authorizePermission(actor, ctx.business, "orders.view")) throw new Error("Order-view permission required.");
    const options = await env.DB!.prepare("SELECT key,value_json FROM erp_preferences WHERE business_id=? AND key IN ('order-suggestions-v1','business-library-v1')").bind(ctx.business).all();
    return { example: assistantOrderExample, options: options.results };
  }
  if (tool === "memories") return (await env.DB!.prepare("SELECT id,content FROM erp_assistant_memories WHERE business_id=? AND user_id=? ORDER BY created_at LIMIT 50").bind(ctx.business, ctx.userId).all()).results;
  throw new Error("That business lookup is not connected yet.");
}

export async function prepareAssistantAction(ctx: ToolContext, tool: string, args: Args): Promise<PreparedAction> {
  const actor = await authenticateActor(ctx.request);
  if (!actor) throw new Error("Sign in required.");
  if (tool === "create_order") {
    if (!await authorizePermission(actor, ctx.business, "orders.create")) throw new Error("Order creation permission required.");
    const input = args.order as SeikoOrder;
    if (!input || input.records?.length || input.googleSheet || input.products?.some(p => p.specifications?.some(s => s.attachments?.length)) || input.commerce?.deliveries?.length || input.commerce?.issues?.length || Object.keys(input.commerce?.people || {}).length) throw new Error("New orders must start with an empty person workspace and no fulfilment records or attachments.");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const seq = await env.DB!.prepare("SELECT MAX(CAST(substr(order_no,9) AS INTEGER)) AS n FROM erp_orders WHERE business_id=?").bind(ctx.business).first<{ n: number }>();
    const order = { ...input, orderId: crypto.randomUUID(), status: "Draft" as const, archived: false, details: { ...input.details, orderNo: `${date.slice(0, 7)}-${String((seq?.n || 0) + 1).padStart(3, "0")}`, orderDate: date, attnRequired: Boolean(input.details?.attnRequired) }, records: [], revisions: [], updatedAt: new Date().toISOString() };
    assertAssistantOrder(order);
    return { tool, payload: { order: saveRevision(order, "Created through reviewed assistant proposal"), expectedVersion: null }, review: assistantOrderReview(order) };
  }
  if (tool === "edit_order" || tool === "order_status") {
    if (!await authorizePermission(actor, ctx.business, "orders.edit")) throw new Error("Order editing permission required.");
    const row = await currentOrder(ctx, args.orderId);
    if (tool === "order_status") {
      if (!(ORDER_STATUSES as readonly unknown[]).includes(args.status)) throw new Error("Choose a valid order status.");
      return { tool, payload: { orderId: args.orderId, status: args.status, expectedVersion: row.version }, review: { orderNo: row.order.details.orderNo, client: row.order.details.clientName, previousStatus: row.order.status, newStatus: args.status } };
    }
    const order = patchAssistantOrder(row.order, args.patches as AssistantPatch[]);
    if (JSON.stringify(order.commerce?.rules) !== JSON.stringify(row.order.commerce?.rules) && !await authorizePermission(actor, ctx.business, "billing.invoices.manage")) throw new Error("Pricing-management permission required.");
    return { tool, payload: { order: saveRevision(order, "Updated through reviewed assistant proposal"), expectedVersion: row.version }, review: { orderNo: order.details.orderNo, client: order.details.clientName, changes: (args.patches as AssistantPatch[]).map(p => ({ ...p })), resultingOrder: assistantOrderReview(order) } };
  }
  if (tool === "production_action") {
    if (!await authorizePermission(actor, ctx.business, "production.manage")) throw new Error("Production management permission required.");
    if (!["save", "event", "release", "close", "cancel"].includes(String(args.operation))) throw new Error("Choose a supported production operation.");
    const current = await call(ctx, production, { operation: "list", id: args.id, orderIds: args.orderIds || [] });
    return { tool, payload: { ...args, expectedVersion: current.version }, review: { action: "Production update", ...args, expectedVersion: current.version } };
  }
  if (tool === "remember") {
    const content = String(args.content || "").trim();
    if (!content || content.length > 1500) throw new Error("Keep each memory between 1 and 1500 characters.");
    const count = await env.DB!.prepare("SELECT COUNT(*) AS n FROM erp_assistant_memories WHERE business_id=? AND user_id=?").bind(ctx.business, ctx.userId).first<{ n: number }>();
    if ((count?.n || 0) >= 50) throw new Error("Review existing memories before adding more.");
    return { tool, payload: { id: crypto.randomUUID(), content }, review: { action: "Remember for your account in this business", content } };
  }
  if (tool === "forget") {
    const row = await env.DB!.prepare("SELECT id,content FROM erp_assistant_memories WHERE id=? AND business_id=? AND user_id=?").bind(args.id, ctx.business, ctx.userId).first();
    if (!row) throw new Error("Memory not found.");
    return { tool, payload: { id: args.id }, review: { action: "Forget memory", ...row } };
  }
  throw new Error("That business action is not connected yet. Nothing was changed.");
}

export async function executeAssistantAction(ctx: ToolContext, action: PreparedAction) {
  if (["create_order", "edit_order"].includes(action.tool)) return call(ctx, orders, { operation: "upsert", ...action.payload });
  if (action.tool === "order_status") return call(ctx, orders, { operation: "status", ...action.payload });
  if (action.tool === "production_action") return call(ctx, production, action.payload);
  if (action.tool === "remember") {
    await env.DB!.prepare("INSERT INTO erp_assistant_memories(id,business_id,user_id,content,created_at) VALUES(?,?,?,?,?)").bind(action.payload.id, ctx.business, ctx.userId, action.payload.content, new Date().toISOString()).run();
    return { ok: true, message: "Memory saved." };
  }
  if (action.tool === "forget") {
    await env.DB!.prepare("DELETE FROM erp_assistant_memories WHERE id=? AND business_id=? AND user_id=?").bind(action.payload.id, ctx.business, ctx.userId).run();
    return { ok: true, message: "Memory removed." };
  }
  throw new Error("Unknown action.");
}
