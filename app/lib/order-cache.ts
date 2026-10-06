import { orderStoreKey, type SeikoOrder } from "./order-domain";

// A server-confirmed order remains usable this session even when the device cache is full.
// Never evict drafts, conflicts or other business data to make room.
const volatile = new Map<string, { orders: SeikoOrder[]; stored: string | null }>();

export function readOrderCache(businessId: string): SeikoOrder[] {
  if (typeof window === "undefined") return [];
  const fallback = volatile.get(businessId);
  try {
    const stored = localStorage.getItem(orderStoreKey(businessId));
    if (fallback && stored === fallback.stored) return fallback.orders;
    const parsed = JSON.parse(stored || "[]");
    if (!Array.isArray(parsed)) return fallback?.orders || [];
    volatile.delete(businessId);
    return parsed as SeikoOrder[];
  } catch { return fallback?.orders || []; }
}

export function orderCacheIsVolatile(businessId: string) { return volatile.has(businessId); }

export function writeOrderCache(businessId: string, orders: SeikoOrder[]) {
  let stored: string | null = null;
  try { stored = localStorage.getItem(orderStoreKey(businessId)); } catch { /* storage may be disabled */ }
  try {
    localStorage.setItem(orderStoreKey(businessId), JSON.stringify(orders));
    volatile.delete(businessId);
  } catch { volatile.set(businessId, { orders, stored }); }
  window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated", { detail: { businessId } }));
}
