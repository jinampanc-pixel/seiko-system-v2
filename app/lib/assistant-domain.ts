import { validateOrder, type SeikoOrder } from "./order-domain";

export type AssistantPatch = { path: string; value: unknown };
export type AssistantMessage = { role: "user" | "assistant"; content: string };
export const ASSISTANT_MODEL = "@cf/zai-org/glm-4.7-flash";
export const ASSISTANT_MAX_INPUT_BYTES = 80000;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 16384;
// Conservative reservation: <=80K UTF-8 input bytes + 16K output tokens, including reasoning.
// No refund on failed requests or missing usage. This is an app budget, not an account-wide billing control.
export const ASSISTANT_CALL_RESERVATION = 1500;
export const ASSISTANT_DAILY_BUDGET = 8000;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function parseAssistantStep(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length > 200000) throw new Error("The assistant returned an incomplete response. Please retry.");
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let step: unknown;
  try { step = JSON.parse(text); } catch { throw new Error("The assistant's draft was incomplete. Nothing was saved. Please retry with a smaller set of changes."); }
  if (!object(step) || !["answer", "read", "propose"].includes(String(step.kind))) throw new Error("The assistant could not form a valid action. Nothing was changed.");
  return step;
}

/** Updates start from the server's current record; the model never replaces a whole live order. */
export function patchAssistantOrder(original: SeikoOrder, patches: AssistantPatch[]): SeikoOrder {
  if (!Array.isArray(patches) || !patches.length || patches.length > 100) throw new Error("Supply between 1 and 100 explicit changes.");
  const next = structuredClone(original);
  for (const patch of patches) {
    if (!object(patch) || typeof patch.path !== "string" || patch.path.length > 400) throw new Error("Invalid change path.");
    const parts = patch.path.split("/").slice(1).map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (!patch.path.startsWith("/") || parts.some(p => !p || ["__proto__", "prototype", "constructor"].includes(p))) throw new Error("Invalid change path.");
    const allowed = /^(details\/(clientName|clientType|contactPerson|contactNumber|shipTo|billTo|remarks|deliveryDate)|products\/\d+\/(name|defaultQuantity|quantityMode|quantityGroupRules|specifications)(\/.*)?|measurements(\/.*)?|fields(\/.*)?|commerce\/rules(\/.*)?|records\/\d+\/values\/[^/]+)$/.test(parts.join("/"));
    if (!allowed) throw new Error("This change must be made through its dedicated business action.");
    let target: unknown = next;
    for (const part of parts.slice(0, -1)) {
      if (!object(target) && !Array.isArray(target)) throw new Error("The change no longer matches the order. Refresh and review.");
      if (!Object.hasOwn(target, part)) throw new Error("The change no longer matches the order. Refresh and review.");
      target = (target as Record<string, unknown>)[part];
    }
    if (!object(target) && !Array.isArray(target)) throw new Error("Invalid change target.");
    const key = parts.at(-1)!;
    if (Array.isArray(target) && (!/^\d+$/.test(key) || Number(key) >= target.length)) throw new Error("Invalid row index.");
    (target as Record<string, unknown>)[key] = structuredClone(patch.value);
  }
  for (const product of next.products) for (const spec of product.specifications) {
    const old = original.products.flatMap(p => p.specifications).find(s => s.id === spec.id);
    if (JSON.stringify(spec.attachments || []) !== JSON.stringify(old?.attachments || [])) throw new Error("Manage artwork attachments through the existing upload workflow.");
  }
  assertAssistantOrder(next);
  return next;
}

export function assertAssistantOrder(value: unknown): asserts value is SeikoOrder {
  if (!object(value)) throw new Error("Order draft is missing.");
  const order = value as unknown as SeikoOrder;
  if (!object(order.details) || !Array.isArray(order.fields) || !Array.isArray(order.products) || !order.products.length || order.products.length > 50 || !Array.isArray(order.measurements) || !Array.isArray(order.records) || !Array.isArray(order.revisions)) throw new Error("The order draft is incomplete.");
  const ids = new Set<string>();
  const id = (v: unknown) => { if (typeof v !== "string" || !v || v.length > 150 || ids.has(v)) throw new Error("Order fields need distinct identifiers."); ids.add(v); };
  for (const field of order.fields) { id(field.id); if (typeof field.name !== "string" || !field.name.trim() || !Array.isArray(field.options)) throw new Error("Complete the person fields."); }
  for (const product of order.products) {
    id(product.id);
    if (typeof product.name !== "string" || !product.name.trim() || !Array.isArray(product.specifications) || !Array.isArray(product.quantityGroupRules) || !Number.isFinite(product.defaultQuantity) || product.defaultQuantity < 0) throw new Error("Complete the garment definitions.");
    for (const spec of product.specifications) {
      id(spec.id);
      if (typeof spec.name !== "string" || !spec.name.trim() || typeof spec.defaultValue !== "string" || !Array.isArray(spec.groupRules) || !Array.isArray(spec.attachments)) throw new Error("Each specification needs a separate name and value.");
      if (!["colour", "pattern", "attribute", "asset"].includes(spec.role) || !["same_for_all", "by_group", "per_person", "default_with_exceptions"].includes(spec.mode)) throw new Error("Invalid specification assignment.");
    }
  }
  for (const measurement of order.measurements) { id(measurement.id); if (typeof measurement.name !== "string" || !measurement.name.trim() || !["text", "number"].includes(measurement.type) || !["Optional", "When present", "Always"].includes(measurement.requiredMode) || !Array.isArray(measurement.appliesTo) || measurement.appliesTo.some(p => !order.products.some(x => x.id === p))) throw new Error("Measurements must reference existing garments and valid entry types."); }
  const errors = validateOrder(order);
  if (errors.length) throw new Error(errors.join(" "));
}

export function assistantOrderReview(order: SeikoOrder) {
  const condition = (rule: { conditions?: { fieldId: string; match: string }[]; conditionMode?: string; fieldId?: string; match?: string }) => ({
    match: rule.conditionMode === "any" ? "Any condition" : "All conditions",
    conditions: (rule.conditions?.length ? rule.conditions : rule.fieldId ? [{ fieldId: rule.fieldId, match: rule.match || "" }] : []).map(c => ({ detail: order.fields.find(f => f.id === c.fieldId)?.name || c.fieldId, values: c.match })),
  });
  return {
    order: order.details,
    personFields: order.fields.map(f => f.name),
    garments: order.products.map(p => ({ name: p.name, quantityMode: p.quantityMode.replaceAll("_", " "), defaultQuantity: p.defaultQuantity, quantityRules: p.quantityGroupRules.map(r => ({ ...condition(r), quantity: r.quantity })), specifications: p.specifications.map(s => ({ name: s.name, value: s.defaultValue, assignment: s.mode.replaceAll("_", " "), rules: s.groupRules.map(r => ({ ...condition(r), value: r.value })) })), measurements: order.measurements.filter(m => m.appliesTo.includes(p.id)).map(m => ({ name: m.name, type: m.type, required: m.requiredMode })) })),
    pricing: (order.commerce?.rules || []).map(r => ({ description: r.name, chargeBy: r.mode, rate: r.rate, taxRate: r.taxRate, ...condition(r), contents: r.contents.map(c => ({ garment: order.products.find(p => p.id === c.productId)?.name || "Unknown garment", quantity: c.quantity })) })),
    personCount: order.records.length,
  };
}
