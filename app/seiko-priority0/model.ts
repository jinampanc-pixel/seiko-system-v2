import { orderStoreKey, type SeikoOrder } from "../lib/order-domain";

export const SEIKO_BUSINESS_ID = "seiko";

export type SeikoPriorityModule = "home" | "orders" | "labels" | "reports" | "billing";

export type ReportFilter = {
  id: string;
  fieldId: string;
  value: string;
};

export function readActiveOrders(): SeikoOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(orderStoreKey(SEIKO_BUSINESS_ID)) || "[]") as SeikoOrder[];
    return stored.filter(order => !order.archived);
  } catch {
    return [];
  }
}

export function activeProducts(order: SeikoOrder) {
  return order.products.filter(product => product.name.trim());
}

export function displayOrder(order: SeikoOrder) {
  return `${order.details.orderNo} — ${order.details.clientName || "Unnamed client"}`;
}
