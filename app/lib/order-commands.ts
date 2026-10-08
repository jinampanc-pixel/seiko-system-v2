import { normalizeProductMeasurements, type OrderStatus, type SeikoOrder } from "./order-domain";
import { readOrderCache, writeOrderCache } from "./order-cache";

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
      const response = await fetch("/api/erp/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "manual" });
      if (response.type === "opaqueredirect" || response.redirected || response.status === 401 || (response.status >= 300 && response.status < 400)) {
        return { ok: false, code: "AUTH_REQUIRED", message: "Your sign-in session has expired. Sign in in another tab, then retry the save here. Your changes remain open." };
      }
      let result: Result<T>;
      try { result = await response.json() as Result<T>; }
      catch {
        return { ok: false, code: "INVALID_RESPONSE", message: `Shared storage returned an unreadable response (HTTP ${response.status}). Your changes remain open; retry Save & Close.` };
      }
      if (!result || typeof result.ok !== "boolean" || (result.ok && (!response.ok || result.data == null)) || (!result.ok && (typeof result.code !== "string" || typeof result.message !== "string"))) {
        return { ok: false, code: "INVALID_RESPONSE", message: "Shared storage did not confirm the save. Your changes remain open; retry Save & Close." };
      }
      return result;
    } catch { return { ok: false, code: "NETWORK_ERROR", message: "Shared ERP storage is temporarily unreachable. Your changes remain open." }; }
  };
  const next = (queues.get(businessId) || Promise.resolve()).then(run, run);
  queues.set(businessId, next);
  return next;
}

async function versionFor(businessId: string, orderId: string) {
  const known = orderVersions(businessId);
  if (!known.has(orderId)) {
    const result = await requestOrders<{ orders: OrderEnvelope[] }>({ operation: "list", businessId, orderIds: [orderId] });
    if (!result.ok) throw new Error(result.message);
    for (const item of result.data.orders) known.set(item.order.orderId, item.version);
  }
  return known.get(orderId) ?? null;
}

function accept(businessId: string, envelope: OrderEnvelope, removed = false) {
  const order = normalizeProductMeasurements(envelope.order);
  orderVersions(businessId).set(order.orderId, envelope.version);
  const local = readOrderCache(businessId);
  const next = local.filter(item => item.orderId !== order.orderId);
  if (!removed) next.unshift(order);
  writeOrderCache(businessId, next);
  window.dispatchEvent(new CustomEvent("seiko:order-command-saved", { detail: { businessId, envelope: { ...envelope, order }, removed } }));
  return order;
}

export async function saveSharedOrder(businessId: string, order: SeikoOrder, baseUpdatedAt?: string) {
  let expectedVersion: number | null;
  if (baseUpdatedAt) {
    // Polling may advance the version map while a workspace still contains an older draft.
    // Match the revision the user opened, then use that version for the atomic server check.
    const listed = await requestOrders<{ orders: OrderEnvelope[] }>({ operation: "list", businessId, orderIds: [order.orderId] });
    if (!listed.ok) throw new Error(listed.message);
    const existing = listed.data.orders.find(item => item.order.orderId === order.orderId);
    if (!existing || existing.order.updatedAt !== baseUpdatedAt) {
      throw new Error("This order changed in another window or device. Your changes remain open. Reopen the latest order before saving to avoid overwriting newer records.");
    }
    expectedVersion = existing.version;
  } else expectedVersion = await versionFor(businessId, order.orderId);
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
