import { normalizeProductMeasurements, orderStoreKey, type OrderStatus, type SeikoOrder } from "./order-domain";

export type OrderEnvelope = { order: SeikoOrder; version: number; updatedAt: string; updatedBy: string };
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string; data?: unknown };
const versions = new Map<string, Map<string, number>>();
const queues = new Map<string, Promise<unknown>>();
export function orderVersions(businessId: string) {
  if (!versions.has(businessId)) versions.set(businessId, new Map());
  return versions.get(businessId)!;
}

export function requestOrders<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const businessId = String(body.businessId);
  const run = async (): Promise<Result<T>> => {
    try {
      const response = await fetch("/api/erp/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      return await response.json() as Result<T>;
    } catch { return { ok: false, code: "NETWORK_ERROR", message: "Shared ERP storage is temporarily unreachable. Your changes remain open." }; }
  };
  const next = (queues.get(businessId) || Promise.resolve()).then(run, run);
  queues.set(businessId, next);
  return next;
}

async function versionFor(businessId: string, orderId: string) {
  const known = orderVersions(businessId);
  if (!known.has(orderId)) {
    const result = await requestOrders<{ orders: OrderEnvelope[] }>({ operation: "list", businessId });
    if (!result.ok) throw new Error(result.message);
    for (const item of result.data.orders) known.set(item.order.orderId, item.version);
  }
  return known.get(orderId) ?? null;
}

function accept(businessId: string, envelope: OrderEnvelope, removed = false) {
  const order = normalizeProductMeasurements(envelope.order);
  orderVersions(businessId).set(order.orderId, envelope.version);
  const local = JSON.parse(localStorage.getItem(orderStoreKey(businessId)) || "[]") as SeikoOrder[];
  const next = local.filter(item => item.orderId !== order.orderId);
  if (!removed) next.unshift(order);
  localStorage.setItem(orderStoreKey(businessId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("seiko:order-command-saved", { detail: { businessId, envelope: { ...envelope, order }, removed } }));
  window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated", { detail: { businessId } }));
  return order;
}

export async function saveSharedOrder(businessId: string, order: SeikoOrder) {
  const expectedVersion = await versionFor(businessId, order.orderId);
  const result = await requestOrders<OrderEnvelope>({ operation: "upsert", businessId, order: normalizeProductMeasurements(order), expectedVersion });
  if (!result.ok) throw new Error(result.message);
  return accept(businessId, result.data);
}

export async function changeSharedOrder(businessId: string, orderId: string, command:
  { operation: "status"; status: OrderStatus } | { operation: "archive"; archived: boolean } | { operation: "delete"; confirmOrderNo: string }) {
  const expectedVersion = await versionFor(businessId, orderId);
  const result = await requestOrders<OrderEnvelope>({ ...command, businessId, orderId, expectedVersion });
  if (!result.ok) throw new Error(result.message);
  return accept(businessId, result.data, command.operation === "delete");
}

export type OrderFinancialAction = "payment" | "payments" | "invoice" | "challan" | "quotation";
export function openOrderFinancialAction(orderId: string, action: OrderFinancialAction) {
  window.dispatchEvent(new CustomEvent("seiko:open-billing", { detail: { orderId, action } }));
}
