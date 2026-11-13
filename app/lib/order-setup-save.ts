import type { SeikoOrder } from "./order-domain";

/** Rebase setup edits only; person, delivery and service data stay authoritative. */
export function mergeOrderSetup(base: SeikoOrder, draft: SeikoOrder, latest: SeikoOrder): SeikoOrder {
  if (base.orderId !== draft.orderId || base.orderId !== latest.orderId) throw new Error("Choose the same order before saving setup.");
  const next = { ...latest };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of ["details", "fields", "products", "measurements"] as const) {
    if (same(base[key], draft[key])) continue;
    if (!same(base[key], latest[key]) && !same(draft[key], latest[key])) {
      throw new Error(`The saved order's ${key} changed while you were editing. Your changes remain open; compare the latest ${key} before saving.`);
    }
    Object.assign(next, { [key]: draft[key] });
  }
  const rules = (order: SeikoOrder) => order.commerce?.rules || [];
  if (!same(rules(base), rules(draft))) {
    if (!same(rules(base), rules(latest)) && !same(rules(draft), rules(latest))) throw new Error("The saved pricing changed while you were editing. Your changes remain open; compare the latest prices before saving.");
    next.commerce = { people: {}, deliveries: [], issues: [], ...latest.commerce, rules: rules(draft) };
  }
  return next;
}
