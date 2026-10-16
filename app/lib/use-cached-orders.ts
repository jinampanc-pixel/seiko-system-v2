"use client";

import { useEffect, useState } from "react";
import type { SeikoOrder } from "./order-domain";
import { readOrderCache } from "./order-cache";

/** Observe the shared-order sync's cache, including its storage-full memory copy. */
export function useCachedOrders(businessId: string) {
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  useEffect(() => {
    const reload = () => setOrders(readOrderCache(businessId));
    const changed = (event: Event) => {
      const business = (event as CustomEvent<{ businessId?: string }>).detail?.businessId;
      if (!business || business === businessId) reload();
    };
    reload();
    window.addEventListener("seiko:orders-cache-updated", changed);
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("seiko:orders-cache-updated", changed);
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
    };
  }, [businessId]);
  return orders;
}
