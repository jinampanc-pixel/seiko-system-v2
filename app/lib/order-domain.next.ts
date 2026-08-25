export type QuantityMode = "same_for_all" | "by_group" | "per_person" | "default_with_exceptions" | "order_total";
export type ValueMode = "same_for_all" | "by_group" | "per_person" | "default_with_exceptions";
export type OrderStatus = "Draft" | "Active" | "On Hold" | "Completed" | "Cancelled";

export type OrderField = { id: string; name: string; type: "text" | "number" | "date" | "dropdown"; options: string[]; required: boolean };
export type ArtworkAttachment = { id: string; name: string; mimeType: string; size: number; storageKey: string; addedAt: string };
export type ManufacturingLink = { manufacturerBusinessId: string; sourceBusinessId: string; sourceOrderId: string; sourceProductId: string };
export type SpecificationPolicy = { id: string; name: string; role: "colour" | "pattern" | "attribute" | "asset"; mode: ValueMode; defaultValue: string; groupFieldId?: string; groupRules: Array<{ match: string; value: string }>; required: boolean; attachments: ArtworkAttachment[] };
export type ProductPolicy = { id: string; name: string; sizeHeader: string; quantityMode: QuantityMode; defaultQuantity: number; orderTotal: number; quantityGroupFieldId?: string; quantityGroupRules: Array<{ match: string; quantity: number }>; specifications: SpecificationPolicy[]; manufacturingLink?: ManufacturingLink };
export type MeasurementPolicy = { id: string; name: string; type: "number" | "text"; appliesTo: string[]; requiredMode: "Optional" | "When present" | "Always" };
export type OrderRecord = { recordId: string; personId: string; values: Record<string, string | number>; held?: boolean };
export type OrderDetails = { orderNo: string; orderDate: string; deliveryDate: string; clientName: string; clientType: string; contactPerson: string; attnRequired: boolean; contactNumber: string; shipTo: string; billTo: string; remarks: string };
export type OrderRevision = { revision: number; at: string; reason: string; recordCount: number };
export type SeikoOrder = { orderId: string; status: OrderStatus; archived: boolean; details: OrderDetails; fields: OrderField[]; products: ProductPolicy[]; measurements: MeasurementPolicy[]; records: OrderRecord[]; revisions: OrderRevision[]; updatedAt: string };

export const CLIENT_TYPE_PRESETS: Record<string, OrderField[]> = {
  "School / Institution": [field("Name"), field("Class / Section"), field("Roll number")],
  "Corporate / Industrial": [field("Employee name"), field("Employee code"), field("Department"), field("Designation")],
  "Healthcare Facility": [field("Staff name"), field("Employee code"), field("Department"), field("Designation")],
  "Retail / Individual": [field("Customer name"), field("Reference number")],
  "Dealer / Reseller": [field("Account / person"), field("Location")],
  Custom: [field("Name")],
};

export function field(name: string, required = false): OrderField { return { id: crypto.randomUUID(), name, type: "text", options: [], required }; }
export function blankProduct(): ProductPolicy { return { id: crypto.randomUUID(), name: "", sizeHeader: "Size", quantityMode: "same_for_all", defaultQuantity: 1, orderTotal: 0, quantityGroupRules: [], specifications: [] }; }
export function blankSpecification(role: SpecificationPolicy["role"] = "attribute"): SpecificationPolicy { return { id: crypto.randomUUID(), name: role === "colour" ? "Colour" : role === "asset" ? "Logo / Artwork" : "", role, mode: "same_for_all", defaultValue: "", groupRules: [], required: true, attachments: [] }; }
export function blankMeasurement(): MeasurementPolicy { return { id: crypto.randomUUID(), name: "", type: "number", appliesTo: [], requiredMode: "Optional" }; }
export function orderStoreKey(businessId: string) { return `jinam:${businessId}:orders-v1`; }
export function productionLinkStoreKey(manufacturerBusinessId: string) { return `jinam:${manufacturerBusinessId}:production-links-v1`; }

export type WorkspaceColumn = { id: string; label: string; required: boolean; groupId: string; groupLabel: string };

export function workspaceColumns(order: SeikoOrder): WorkspaceColumn[] {
  const columns: WorkspaceColumn[] = order.fields.map(item => ({ id: `field:${item.id}`, label: item.name, required: item.required, groupId: "record", groupLabel: "Person / record" }));
  for (const product of order.products) {
    if (!product.name.trim()) continue;
    const group = { groupId: `product:${product.id}`, groupLabel: product.name };
    if (product.quantityMode === "per_person") columns.push({ id: `product:${product.id}:qty`, label: "Quantity", required: true, ...group });
    if (product.quantityMode === "default_with_exceptions") columns.push({ id: `product:${product.id}:qty_override`, label: "Quantity override", required: false, ...group });
    for (const spec of product.specifications) {
      if (spec.mode === "per_person") columns.push({ id: `spec:${spec.id}`, label: spec.name, required: spec.required, ...group });
      if (spec.mode === "default_with_exceptions") columns.push({ id: `spec:${spec.id}:override`, label: `${spec.name} override`, required: false, ...group });
    }
  }
  for (const measurement of order.measurements) {
    const linked = order.products.filter(product => measurement.appliesTo.includes(product.id) && product.name.trim());
    for (const product of linked) columns.push({ id: `measurement:${measurement.id}:product:${product.id}`, label: measurement.name, required: measurement.requiredMode === "Always" || measurement.requiredMode === "When present", groupId: `product:${product.id}`, groupLabel: product.name });
    if (!linked.length && measurement.name.trim()) columns.push({ id: `measurement:${measurement.id}`, label: measurement.name, required: measurement.requiredMode === "Always", groupId: "measurements", groupLabel: "Other measurements" });
  }
  return columns;
}

export function quantityForRecord(order: SeikoOrder, product: ProductPolicy, record: OrderRecord, firstRecord = false): number {
  if (product.quantityMode === "order_total") return firstRecord ? Math.max(0, Number(product.orderTotal) || 0) : 0;
  if (product.quantityMode === "by_group") {
    const sourceValue = product.quantityGroupFieldId ? String(record.values[`field:${product.quantityGroupFieldId}`] ?? "").trim() : "";
    const rule = (product.quantityGroupRules || []).find(item => item.match.trim().toLowerCase() === sourceValue.toLowerCase());
    if (rule && Number.isFinite(Number(rule.quantity))) return Math.max(0, Number(rule.quantity));
    return Math.max(0, Number(product.defaultQuantity) || 0);
  }
  const override = Number(record.values[`product:${product.id}:qty_override`] ?? record.values[`product:${product.id}:qty`]);
  if (Number.isFinite(override) && override > 0) return override;
  return Math.max(0, Number(product.defaultQuantity) || 0);
}

export function readinessIssues(order: SeikoOrder): string[] {
  const issues = validateOrder(order);
  if (!order.records.length) issues.push("No person / record entries yet. You can still save this order.");
  if (!order.products.some(product => product.name.trim())) issues.push("No products defined yet. Add them now or later.");
  // Cell completeness is displayed in the workspace itself. Older revisions can
  // retain obsolete internal column IDs, so they must not create false alerts.
  for (const product of order.products) {
    if (product.quantityMode === "by_group") {
      const rules = product.quantityGroupRules || [];
      if (!product.quantityGroupFieldId) issues.push(`Choose a grouping field for ${product.name || "this product"} quantity.`);
      if (!rules.length) issues.push(`Add group quantity rules for ${product.name || "this product"}.`);
      if (rules.some(rule => !rule.match.trim() || !Number.isFinite(Number(rule.quantity)) || Number(rule.quantity) <= 0)) issues.push(`Complete every group quantity rule for ${product.name || "this product"}.`);
    }
    for (const spec of product.specifications.filter(item => item.mode === "by_group")) {
      if (!spec.groupFieldId) issues.push(`Choose a grouping field for ${product.name} - ${spec.name}.`);
      if (!spec.groupRules.length) issues.push(`Add group rules for ${product.name} - ${spec.name}.`);
      if (spec.groupRules.some(rule => !rule.match.trim() || !rule.value.trim())) issues.push(`Complete every group rule for ${product.name} - ${spec.name}.`);
    }
  }
  return [...new Set(issues)];
}

export function validateOrder(order: SeikoOrder): string[] {
  const errors: string[] = [];
  if (!order.details.clientName.trim()) errors.push("Client name is required.");
  if (order.details.attnRequired && !order.details.contactPerson.trim()) errors.push("Attn name is required for this order.");
  return errors;
}

export function saveRevision(order: SeikoOrder, reason: string): SeikoOrder {
  const now = new Date().toISOString();
  return { ...order, status: order.status === "Draft" && order.records.length ? "Active" : order.status, updatedAt: now, revisions: [...order.revisions, { revision: order.revisions.length + 1, at: now, reason, recordCount: order.records.length }] };
}
