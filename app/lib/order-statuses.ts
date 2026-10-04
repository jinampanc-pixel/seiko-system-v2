// Keep this module free of initialization side effects: API routes import it in Workers.
export const ORDER_STATUSES = ["Draft", "Active", "Production", "QC 1", "Packing", "QC 2", "On Hold", "Completed", "Cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];
