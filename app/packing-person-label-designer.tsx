"use client";

import { useEffect, useMemo, useState } from "react";
import { LabelDesigner } from "./label-designer";
import { quantityForRecord, workspaceColumns, type ProductPolicy, type SeikoOrder } from "./lib/order-domain";

type DisplayMode = "name_details" | "name_space_details" | "details_only" | "name_only";
type ConditionalMode = "never" | "when_present" | "always";
type ProductRule = {
  alias: string;
  showQuantity: boolean;
  displayMode: DisplayMode;
  primaryMeasurementId: string;
  measurementModes: Record<string, ConditionalMode>;
  measurementAliases: Record<string, string>;
};
type PresentationRules = Record<string, ProductRule>;

const SLOT_PREFIX = "__packing_product_slot_";
const syntheticProductId = "__packing_person_package__";
const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
const storageKey = (businessId: string, orderId: string) => `jinam:${businessId}:packing-person-presentation:${orderId}`;

function defaultRule(order: SeikoOrder, product: ProductPolicy): ProductRule {
  const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
  const primary = measurements.find(item => /^(length|size)$/i.test(item.name.trim())) || measurements[0];
  return {
    alias: product.name,
    showQuantity: false,
    displayMode: "name_details",
    primaryMeasurementId: primary?.id || "",
    measurementModes: Object.fromEntries(measurements.map(item => [item.id, item.id === primary?.id ? "when_present" : "when_present"])),
    measurementAliases: Object.fromEntries(measurements.map(item => [item.id, /^waist$/i.test(item.name.trim()) ? "W" : item.name])),
  };
}

function loadRules(businessId: string, order: SeikoOrder): PresentationRules {
  const defaults = Object.fromEntries(order.products.filter(product => product.name.trim()).map(product => [product.id, defaultRule(order, product)]));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(businessId, order.orderId)) || "{}") as PresentationRules;
    return Object.fromEntries(Object.entries(defaults).map(([productId, fallback]) => {
      const existing = saved[productId];
      return [productId, existing ? {
        ...fallback,
        ...existing,
        measurementModes: { ...fallback.measurementModes, ...(existing.measurementModes || {}) },
        measurementAliases: { ...fallback.measurementAliases, ...(existing.measurementAliases || {}) },
      } : fallback];
    }));
  } catch {
    return defaults;
  }
}

function explicitProductQuantity(record: SeikoOrder["records"][number], productId: string) {
  return [`product:${productId}:qty_override`, `product:${productId}:qty`].some(key => hasValue(record.values[key]));
}

function resolvedQuantity(order: SeikoOrder, product: ProductPolicy, record: SeikoOrder["records"][number], recordIndex: number) {
  const quantity = quantityForRecord(product, record, recordIndex === 0);
  if (quantity <= 0) return 0;
  if (explicitProductQuantity(record, product.id)) return quantity;

  const evidenceColumns = workspaceColumns(order).filter(column => column.groupId === `product:${product.id}` && (column.id.startsWith("measurement:") || column.id.startsWith("spec:")));
  if (!evidenceColumns.length) return quantity;
  const orderUsesEvidence = order.records.some(candidate => evidenceColumns.some(column => hasValue(candidate.values[column.id])));
  if (!orderUsesEvidence) return quantity;
  return evidenceColumns.some(column => hasValue(record.values[column.id])) ? quantity : 0;
}

function measurementValue(order: SeikoOrder, productId: string, measurementId: string, record: SeikoOrder["records"][number]) {
  const exact = record.values[`measurement:${measurementId}:product:${productId}`];
  if (hasValue(exact)) return String(exact);
  const legacy = record.values[`measurement:${measurementId}`];
  if (hasValue(legacy)) {
    const targets = order.measurements.filter(item => item.id === measurementId && item.appliesTo.includes(productId));
    if (targets.length === 1) return String(legacy);
  }
  return "";
}

function renderProduct(order: SeikoOrder, product: ProductPolicy, rule: ProductRule, record: SeikoOrder["records"][number], quantity: number) {
  const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
  const primary = measurements.find(item => item.id === rule.primaryMeasurementId);
  const primaryValue = primary ? measurementValue(order, product.id, primary.id, record) : "";
  const details: string[] = [];
  if (primary && primaryValue && rule.measurementModes[primary.id] !== "never") details.push(primaryValue);
  else if (primary && rule.measurementModes[primary.id] === "always") details.push(`${rule.measurementAliases[primary.id] || primary.name}: —`);

  for (const measurement of measurements) {
    if (measurement.id === primary?.id) continue;
    const mode = rule.measurementModes[measurement.id] || "never";
    if (mode === "never") continue;
    const value = measurementValue(order, product.id, measurement.id, record);
    if (!value && mode === "when_present") continue;
    details.push(`${rule.measurementAliases[measurement.id] || measurement.name}: ${value || "—"}`);
  }
  if (rule.showQuantity && quantity !== 1) details.push(`Qty ${quantity}`);

  const name = rule.alias.trim() || product.name;
  if (rule.displayMode === "name_only") return name;
  if (rule.displayMode === "details_only") return details.join(" · ");
  if (!details.length) return name;
  return rule.displayMode === "name_space_details" ? `${name} ${details.join(" · ")}` : `${name}: ${details.join(" · ")}`;
}

function applicableProducts(order: SeikoOrder, record: SeikoOrder["records"][number], recordIndex: number) {
  return order.products.filter(product => product.name.trim()).map(product => ({ product, quantity: resolvedQuantity(order, product, record, recordIndex) })).filter(item => item.quantity > 0);
}

function makeDesignerOrder(order: SeikoOrder, rules: PresentationRules) {
  const active = order.records.filter(record => !record.held);
  const maxSlots = Math.max(1, ...active.map((record, index) => applicableProducts(order, record, index).length));
  const originalFields = order.fields.filter(field => field.name.trim());
  const firstTwo = originalFields.slice(0, 2);
  const rest = originalFields.slice(2);
  const slotFields = Array.from({ length: maxSlots }, (_, index) => ({ id: `${SLOT_PREFIX}${index + 1}`, name: `Product ${index + 1}`, type: "text" as const, options: [], required: false }));
  const fields = [...firstTwo, ...slotFields, ...rest];
  const records = order.records.map((record, recordIndex) => {
    const products = applicableProducts(order, record, recordIndex);
    const values = { ...record.values };
    slotFields.forEach((field, slotIndex) => {
      const entry = products[slotIndex];
      values[`field:${field.id}`] = entry ? renderProduct(order, entry.product, rules[entry.product.id] || defaultRule(order, entry.product), record, entry.quantity) : "";
    });
    return { ...record, values };
  });
  return {
    ...order,
    fields,
    records,
    products: [{ id: syntheticProductId, name: "Person package", sizeHeader: "", quantityMode: "same_for_all" as const, defaultQuantity: 1, orderTotal: 0, quantityGroupRules: [], specifications: [] }],
    measurements: [],
  } satisfies SeikoOrder;
}

function autoFit(root: HTMLElement) {
  const fit = (element: HTMLElement) => {
    if (!element.classList.contains("element-field") && !element.classList.contains("element-text") && !element.classList.contains("element-sequence")) return;
    const preferredPt = Number(element.dataset.fontPt || "") || Number.parseFloat(getComputedStyle(element).fontSize) / 1.333 || 6;
    const preferredPx = preferredPt * 1.333;
    const minPx = 4 * 1.333;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const text = (element.textContent || "").trim();
    if (!text) return;
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;
    context.font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${preferredPx}px ${style.fontFamily || "sans-serif"}`;
    const width = Math.max(1, context.measureText(text).width);
    const height = preferredPx * 1.12;
    const scale = Math.min(1, Math.max(.01, (rect.width - 2) / width), Math.max(.01, (rect.height - 1) / height));
    element.style.fontSize = `${Math.max(minPx, preferredPx * scale)}px`;
    element.style.whiteSpace = "nowrap";
  };
  root.querySelectorAll<HTMLElement>(".canvasElement,.printedElement").forEach(fit);
}

export function PackingPersonLabelDesigner({ businessId, canManageSizes, order, onBack, backLabel }: {
  businessId: string;
  canManageSizes: boolean;
  order: SeikoOrder;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [rules, setRules] = useState<PresentationRules>(() => loadRules(businessId, order));
  const [open, setOpen] = useState(false);
  const designerOrder = useMemo(() => makeDesignerOrder(order, rules), [order, rules]);

  useEffect(() => {
    localStorage.setItem(storageKey(businessId, order.orderId), JSON.stringify(rules));
  }, [businessId, order.orderId, rules]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".packingPersonNative");
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => autoFit(root));
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"], characterData: true });
    document.addEventListener("wheel", schedule, true);
    document.addEventListener("pointerup", schedule, true);
    window.addEventListener("beforeprint", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("wheel", schedule, true);
      document.removeEventListener("pointerup", schedule, true);
      window.removeEventListener("beforeprint", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [designerOrder]);

  const updateRule = (productId: string, change: Partial<ProductRule>) => setRules(current => ({ ...current, [productId]: { ...current[productId], ...change } }));

  return <div className="packingPersonNative">
    <section className="panel packingPresentationPanel">
      <div className="packingPresentationHead"><div><p className="eyebrow">PRODUCT PRESENTATION</p><h3>Automatic product slots</h3><p>JINAM places each person&apos;s applicable products into Product 1, Product 2, etc. You control exactly how every product is written.</p></div><button type="button" className="secondary" onClick={() => setOpen(value => !value)}>{open ? "Done" : "Customize"}</button></div>
      {open && <div className="packingPresentationRules">{order.products.filter(product => product.name.trim()).map(product => {
        const rule = rules[product.id] || defaultRule(order, product);
        const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
        return <details key={product.id}><summary><b>{product.name}</b><span>prints as “{rule.alias || product.name}”</span></summary><div className="packingRuleBody">
          <label><span>Printed product name</span><input value={rule.alias} onChange={event => updateRule(product.id, { alias: event.target.value })}/></label>
          <label><span>Format</span><select value={rule.displayMode} onChange={event => updateRule(product.id, { displayMode: event.target.value as DisplayMode })}><option value="name_details">Name: details</option><option value="name_space_details">Name details</option><option value="details_only">Details only</option><option value="name_only">Name only</option></select></label>
          <label><span>Primary measurement</span><select value={rule.primaryMeasurementId} onChange={event => updateRule(product.id, { primaryMeasurementId: event.target.value })}><option value="">None</option>{measurements.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="packingCheck"><input type="checkbox" checked={rule.showQuantity} onChange={event => updateRule(product.id, { showQuantity: event.target.checked })}/><span>Show quantity when not 1</span></label>
          {measurements.length > 0 && <div className="packingMeasurements"><b>Measurements</b>{measurements.map(measurement => <div className="packingMeasurementRow" key={measurement.id}><input aria-label={`${measurement.name} printed name`} value={rule.measurementAliases[measurement.id] || measurement.name} onChange={event => updateRule(product.id, { measurementAliases: { ...rule.measurementAliases, [measurement.id]: event.target.value } })}/><select aria-label={`${measurement.name} display rule`} value={rule.measurementModes[measurement.id] || "never"} onChange={event => updateRule(product.id, { measurementModes: { ...rule.measurementModes, [measurement.id]: event.target.value as ConditionalMode } })}><option value="never">Never</option><option value="when_present">When present</option><option value="always">Always</option></select></div>)}</div>}
        </div></details>;
      })}</div>}
    </section>
    <LabelDesigner businessId={businessId} order={designerOrder} initialPurpose="packing" initialSourceMode="person" canManageSizes={canManageSizes} onBack={onBack} backLabel={backLabel}/>
    <style>{`
      .packingPersonNative .packingPresentationPanel{margin:0 28px 14px;padding:14px 16px}.packingPresentationHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.packingPresentationHead h3{margin:2px 0 4px}.packingPresentationHead p:last-child{margin:0;color:var(--muted);font-size:12px;max-width:760px}.packingPresentationRules{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:12px}.packingPresentationRules details{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:10px}.packingPresentationRules summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px}.packingPresentationRules summary span{font-size:11px;color:var(--muted)}.packingRuleBody{display:grid;gap:8px;margin-top:10px}.packingRuleBody label{display:grid;gap:4px;font-size:11px}.packingRuleBody input,.packingRuleBody select{min-height:34px}.packingCheck{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center}.packingMeasurements{display:grid;gap:6px}.packingMeasurementRow{display:grid;grid-template-columns:1fr 130px;gap:6px}.packingPersonNative .canvasElement,.packingPersonNative .printedElement{overflow:hidden}.packingPersonNative .canvasElement.element-field,.packingPersonNative .printedElement.element-field{white-space:nowrap}
    `}</style>
  </div>;
}
