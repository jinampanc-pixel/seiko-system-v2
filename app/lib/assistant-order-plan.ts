import type { OrderField, ProductPolicy, RulePredicate, SeikoOrder, SpecificationPolicy, MeasurementPolicy } from "./order-domain";
import type { PriceRule } from "./order-commerce";
type Data = Record<string, unknown>;
function obj(value: unknown): Data { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The order plan contains an incomplete section."); return value as Data; }
function list(value: unknown, max = 100): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error("The order plan contains an invalid list."); return value; }
function text(value: unknown, optional = false): string { if (optional && (value === undefined || value === null)) return ""; if (typeof value !== "string" || value.length > 2000 || (!optional && !value.trim())) throw new Error("An order detail is missing or too long."); return value.trim(); }
function quantity(value: unknown): number { if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100000) throw new Error("Garment quantities must be explicit non-negative whole numbers."); return value; }
const key = (value: string) => value.trim().toLocaleLowerCase();

/** Pure compiler: no storage calls, live orders, or model-generated IDs. */
export function compileAssistantOrderPlan(value: unknown): SeikoOrder {
  const plan = obj(value), details = obj(plan.details), fieldMap = new Map<string, string>(), productMap = new Map<string, string>();
  const addAlias = (map: Map<string, string>, name: string, id: string) => { const k = key(name); if (map.has(k) && map.get(k) !== id) throw new Error("Order detail and garment names must be unambiguous."); map.set(k, id); };
  const fields: OrderField[] = list(plan.fields, 40).map(input => {
    const field: Data = typeof input === "string" ? { name: input } : obj(input), id = crypto.randomUUID(), name = text(field.name);
    const type = String(field.type || "text") as OrderField["type"];
    if (!["text", "number", "date", "dropdown"].includes(type)) throw new Error("Choose a valid person field type.");
    addAlias(fieldMap, name, id); if (field.key) addAlias(fieldMap, text(field.key), id);
    return { id, name, type, options: field.options ? list(field.options, 100).map(v => text(v)) : [], required: field.required === true };
  });
  const predicate = (input: unknown, combination?: unknown): RulePredicate => {
    if (!input) return {};
    const pairs = Object.entries(obj(input)); if (!pairs.length) return {};
    return { conditionMode: combination === "any" ? "any" : "all", conditions: pairs.map(([field, match]) => { const fieldId = fieldMap.get(key(field)); if (!fieldId) throw new Error("A group refers to an unknown person field: " + field); return { fieldId, match: text(match) }; }) };
  };
  const productInputs = list(plan.products, 50).map(obj);
  for (const input of productInputs) { const id = crypto.randomUUID(); addAlias(productMap, text(input.key || input.name), id); addAlias(productMap, text(input.name), id); }
  const measurements: MeasurementPolicy[] = [];
  const measurement = (input: unknown, productIds: string[], shared = false): MeasurementPolicy => {
    const row: Data = typeof input === "string" ? { name: input } : obj(input);
    const type = String(row.type || "text") as MeasurementPolicy["type"], requiredMode = String(row.required || "Optional") as MeasurementPolicy["requiredMode"];
    if (!["text", "number"].includes(type) || !["Optional", "When present", "Always"].includes(requiredMode)) throw new Error("Choose a valid measurement entry type and requirement.");
    return { id: crypto.randomUUID(), name: text(row.name), type, requiredMode, appliesTo: productIds, ...(shared ? { shared: true } : {}) };
  };
  const products: ProductPolicy[] = productInputs.map(input => {
    const id = productMap.get(key(text(input.key || input.name)))!;
    const q: Data = typeof input.quantity === "number" ? { default: input.quantity } : obj(input.quantity);
    const groups = q.groups ? list(q.groups, 100).map(obj) : [];
    const mode = String(q.mode || (groups.length ? "by_group" : "same_for_all")) as ProductPolicy["quantityMode"];
    if (!["same_for_all", "by_group", "per_person", "default_with_exceptions", "order_total"].includes(mode)) throw new Error("Choose a valid garment quantity method.");
    if (mode === "by_group" && !groups.length) throw new Error("Group quantities need explicit recipient rules.");
    const specificationInputs = input.specifications ? obj(input.specifications) : {};
    const specifications: SpecificationPolicy[] = Object.entries(specificationInputs).map(([name, raw]) => {
      const row: Data = typeof raw === "string" ? { value: raw } : obj(raw);
      const role = String(row.role || (/colou?r/i.test(name) ? "colour" : /style|pattern|design/i.test(name) ? "pattern" : "attribute")) as SpecificationPolicy["role"];
      const specMode = String(row.mode || "same_for_all") as SpecificationPolicy["mode"];
      const rules = row.groups ? list(row.groups, 100).map(obj).map(r => ({ ...predicate(r.when, r.match), match: "", value: text(r.value, true) })) : [];
      return { id: crypto.randomUUID(), name: text(name), role, mode: specMode, defaultValue: text(row.value, true), groupRules: rules, required: row.required !== false, attachments: [] };
    });
    for (const m of input.measurements ? list(input.measurements, 30) : []) measurements.push(measurement(m, [id]));
    return { id, name: text(input.name), sizeHeader: text(input.sizeHeader || "Size"), quantityMode: mode, defaultQuantity: quantity(q.default), orderTotal: mode === "order_total" ? quantity(q.total) : 0, quantityGroupRules: groups.map(g => { const p = predicate(g.when, g.match); if (!p.conditions?.length) throw new Error("A quantity exception needs explicit conditions."); return { ...p, match: "", quantity: quantity(g.quantity) }; }), specifications };
  });
  for (const input of plan.sharedMeasurements ? list(plan.sharedMeasurements, 30) : []) {
    const row = obj(input), ids = list(row.products, 50).map(p => { const id = productMap.get(key(text(p))); if (!id) throw new Error("A shared measurement refers to an unknown garment."); return id; });
    if (!ids.length) throw new Error("A shared measurement needs at least one garment.");
    measurements.push(measurement(row, [...new Set(ids)], true));
  }
  const rules: PriceRule[] = (plan.prices ? list(plan.prices, 100) : []).map(obj).map(price => {
    const mode = String(price.mode || "package") as PriceRule["mode"], rate = price.rate, taxRate = price.taxRate === undefined ? 0 : price.taxRate;
    if (!["package", "product", "fixed"].includes(mode) || typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || typeof taxRate !== "number" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("Package prices and taxes must be explicit valid numbers.");
    const contents = Object.entries(price.contents ? obj(price.contents) : {}).map(([product, count]) => { const productId = productMap.get(key(product)); if (!productId) throw new Error("A package refers to an unknown garment: " + product); return { productId, quantity: quantity(count) }; });
    if (mode !== "fixed" && !contents.length) throw new Error("A package price must specify its garment contents.");
    return { id: crypto.randomUUID(), name: text(price.name), mode, rate, taxRate, hsnSac: text(price.hsnSac, true), fieldId: "", match: "", ...predicate(price.when, price.match), contents };
  });
  return { orderId: "", status: "Draft", archived: false, updatedAt: "", revisions: [], records: [], details: { orderNo: "", orderDate: "", clientName: text(details.clientName), clientType: text(details.clientType || "Custom"), contactPerson: text(details.contactPerson, true), contactNumber: text(details.contactNumber), attnRequired: details.attnRequired === true, shipTo: text(details.shipTo, true), billTo: text(details.billTo, true), deliveryDate: text(details.deliveryDate, true), remarks: text(details.remarks, true) }, fields, products, measurements, commerce: { rules, people: {}, deliveries: [], issues: [] } };
}
