import { groupRuleMatches, quantityForRecord, resolveRuleValue, type SeikoOrder } from "./order-domain";

/** Search normalization is only for finding candidates, never for changing stored names. */
export function searchKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/w/g, "v").replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
    }
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length];
}
export type OrderCandidate = { orderId: string; orderNo: string; client: string; status: string; personCount: number };
export function findOrderCandidates(rows: OrderCandidate[], query: string) {
  const q = searchKey(query);
  if (q.length < 3 || q.length > 120) throw new Error("Supply a client name or order number of 3–120 characters.");
  const ranked = rows.map(row => {
    const name = searchKey(row.client), number = searchKey(row.orderNo);
    let score = name === q || number === q ? 1 : name.includes(q) || number.includes(q) ? 0.92 : 0;
    if (!score && q.length >= 5) {
      const choices = [name, ...row.client.split(/\s+/).map(searchKey).filter(s => s.length >= 4)];
      score = Math.max(...choices.map(s => Math.abs(s.length - q.length) > Math.max(s.length, q.length) * 0.22 ? 0 : 1 - distance(s, q) / Math.max(s.length, q.length)));
      if (score < 0.78) score = 0;
    }
    return { ...row, score: Math.round(score * 1000) / 1000 };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.orderNo.localeCompare(b.orderNo));
  const uniqueBest = ranked.length === 1 || ranked.length > 1 && ranked[0].score === 1 && ranked[1].score < 1;
  return { candidates: ranked.slice(0, 8), matchedOrderId: uniqueBest ? ranked[0]?.orderId : undefined, requiresSelection: ranked.length > 0 && !uniqueBest, totalCandidates: ranked.length };
}
const productKey = (name: string) => {
  const key = searchKey(name);
  return ["ts", "tshirt", "tshirts", "tee", "tees"].includes(key) ? "tshirt" : ["tp", "trackpant", "trackpants", "tracksuitpant", "tracksuitpants"].includes(key) ? "trackpant" : key;
};
const fieldKey = (name: string) => /^(class|classsection|std|standard|grade)$/i.test(searchKey(name)) ? "class" : searchKey(name);
const classValue = (value: string) => value.trim().match(/^(\d{1,2})(?:\s*[-/ ]?\s*[a-z]+)?$/i)?.[1] || value;
export type CountFilter = { field: string; match: string };
export function countOrderPeople(order: SeikoOrder, requested: string[], filters: CountFilter[] = []) {
  if (!Array.isArray(requested) || !requested.length || requested.length > 12 || requested.some(p => typeof p !== "string" || p.length > 150)) throw new Error("Specify up to 12 garment names, such as TS and TP.");
  if (!Array.isArray(filters) || filters.length > 10) throw new Error("Supply up to 10 person-detail filters.");
  const products = requested.map(name => {
    const matches = order.products.filter(p => p.id === name || productKey(p.name) === productKey(name));
    if (matches.length !== 1) throw new Error("Choose one garment for '" + name + "'. Available: " + order.products.map(p => p.name).join(", "));
    if (matches[0].quantityMode === "order_total") throw new Error(matches[0].name + " has an order total; it cannot establish individual recipients.");
    return matches[0];
  }).filter((p, i, all) => all.findIndex(x => x.id === p.id) === i);
  const resolved = filters.map(filter => {
    if (!filter || typeof filter.field !== "string" || typeof filter.match !== "string" || !filter.match.trim() || filter.match.length > 150) throw new Error("Each filter needs a person-detail field and value.");
    const matches = order.fields.filter(f => f.id === filter.field.replace(/^field:/, "") || fieldKey(f.name) === fieldKey(filter.field));
    if (matches.length !== 1) throw new Error("Choose one detail field for '" + filter.field + "'. Available: " + order.fields.map(f => f.name).join(", "));
    return { field: matches[0], match: filter.match };
  });
  const nameField = order.fields.find(f => /name/i.test(f.name));
  const rows = order.records.filter(r => (!nameField || String(r.values["field:" + nameField.id] ?? "").trim()) && resolved.every(f => {
    const value = String(r.values["field:" + f.field.id] ?? "");
    return groupRuleMatches(f.match, fieldKey(f.field.name) === "class" ? classValue(value) : value);
  }));
  const cancelled = rows.filter(r => order.status === "Cancelled" || order.commerce?.people[r.recordId]?.state === "cancelled" || order.fields.some(f => /status|cancel/i.test(f.name) && /^(cancelled|canceled|removed)$/i.test(String(r.values["field:" + f.id] || "").trim())));
  const included = rows.filter(r => !cancelled.includes(r));
  const totals = products.map(p => ({ productId: p.id, name: p.name, people: 0, pieces: 0 }));
  let allSelectedProductsPeople = 0, anySelectedProductsPeople = 0, unresolvedPeople = 0;
  for (const record of included) {
    let unresolved = false;
    const quantities = products.map(p => {
      const override = ["assigned_qty", "qty_override", "qty"].some(key => String(record.values[`product:${p.id}:${key}`] ?? "").trim() !== "");
      if (!override && p.quantityMode === "by_group" && resolveRuleValue(p.quantityGroupRules, record, p.quantityGroupFieldId, r => r.quantity, p.defaultQuantity).state !== "ready") unresolved = true;
      return quantityForRecord(p, record);
    });
    if (unresolved) { unresolvedPeople++; continue; }
    quantities.forEach((q, i) => { if (q > 0) totals[i].people++; totals[i].pieces += q; });
    if (quantities.every(q => q > 0)) allSelectedProductsPeople++;
    if (quantities.some(q => q > 0)) anySelectedProductsPeople++;
  }
  return { orderId: order.orderId, orderNo: order.details.orderNo, client: order.details.clientName, filters: resolved.map(f => ({ field: f.field.name, match: f.match })), matchedPeople: included.length, excludedCancelledPeople: cancelled.length, unresolvedPeople, products: totals, allSelectedProductsPeople, anySelectedProductsPeople, coverage: "Complete order snapshot, not a search page or sample", basis: "Ordered quantities, including holds/awaiting entries; cancelled people excluded. This is not a delivery or production-readiness count." };
}
export function countAnswer(result: ReturnType<typeof countOrderPeople>, asOf: string) {
  const scope = result.filters.map(f => f.field + " " + f.match).join(", ");
  const checked = Number.isNaN(Date.parse(asOf)) ? asOf : new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"}).format(new Date(asOf)) + " IST";
  return `${result.client} (${result.orderNo})${scope ? " — " + scope : ""}:\n` + result.products.map(p => `${p.name}: ${p.people} people, ${p.pieces} pieces.`).join("\n") + (result.products.length > 1 ? `\n${result.products.length === 2 ? "Both garments" : "All selected garments"}: ${result.allSelectedProductsPeople} people; at least one: ${result.anySelectedProductsPeople}.` : "") + (result.unresolvedPeople ? `\n${result.unresolvedPeople} people have unresolved quantity rules and are excluded from garment counts; those counts are lower bounds.` : "") + (result.excludedCancelledPeople ? `\nExcluded ${result.excludedCancelledPeople} cancelled people.` : "") + `\nChecked the complete order at ${checked}. Counts are ordered quantities, not deliveries.`;
}
