"use client";

import { useEffect } from "react";
import { groupRuleMatches, quantityForRecord, workspaceColumns, type SeikoOrder } from "./lib/order-domain";

type DynamicLine = {
  product: string;
  primary: string;
  details: string[];
  quantity: number;
};
type DynamicRecord = {
  id: string;
  recordId: string;
  name: string;
  group: string;
  summary: string;
  lines: DynamicLine[];
  values: string[];
  score: number;
};
type PackagePlan = "together" | "sets" | "products";

const PRODUCT_SUMMARY_LABELS = new Set(["Package contents", "Product and quantity summary", "Products & measurements"]);

function businessId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}
function readOrders(): SeikoOrder[] {
  try { return JSON.parse(localStorage.getItem(`jinam:${businessId()}:orders-v1`) || "[]") as SeikoOrder[]; }
  catch { return []; }
}
function currentOrder() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("order");
  const orders = readOrders();
  if (id) return orders.find(order => order.orderId === id) || null;
  const orderNo = document.querySelector(".labelDesignerPage .labelTopbar .eyebrow")?.textContent?.match(/ORDER\s+([^·]+)/i)?.[1]?.trim();
  return orders.find(order => order.details.orderNo === orderNo) || null;
}
function hasValue(value: unknown) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function normalizedMeasurements(order: SeikoOrder, values: Record<string, unknown>) {
  const normalized: Record<string, string> = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "")]));
  const columns = workspaceColumns(order).filter(column => column.id.startsWith("measurement:"));
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith("measurement:") || key.includes(":product:") || !hasValue(value)) continue;
    const measurementId = key.replace(/^measurement:/, "");
    const targets = columns.filter(column => column.id.startsWith(`measurement:${measurementId}:product:`) && !hasValue(normalized[column.id]));
    if (targets.length === 1) normalized[targets[0].id] = String(value);
  }
  return normalized;
}
function productQuantity(order: SeikoOrder, product: SeikoOrder["products"][number], record: SeikoOrder["records"][number], recordIndex: number) {
  const quantity = quantityForRecord(product, record, recordIndex === 0);
  if (quantity <= 0) return 0;
  if ([`product:${product.id}:qty`, `product:${product.id}:qty_override`].some(key => hasValue(record.values[key]))) return quantity;
  const evidenceColumns = workspaceColumns(order).filter(column => column.groupId === `product:${product.id}` && (column.id.startsWith("measurement:") || column.id.startsWith("spec:")));
  if (!evidenceColumns.length) return quantity;
  const orderUsesEvidence = order.records.some(candidate => {
    const values = { ...candidate.values, ...normalizedMeasurements(order, candidate.values) };
    return evidenceColumns.some(column => hasValue(values[column.id]));
  });
  if (!orderUsesEvidence) return quantity;
  const values = { ...record.values, ...normalizedMeasurements(order, record.values) };
  return evidenceColumns.some(column => hasValue(values[column.id])) ? quantity : 0;
}
function abbreviation(name: string) {
  const clean = name.trim();
  const known: Record<string, string> = { waist: "W", chest: "Ch", shoulder: "Sh", sleeve: "Sl", length: "L", hip: "H", inseam: "In", size: "Size" };
  return known[clean.toLowerCase()] || clean;
}
function specificationValue(product: SeikoOrder["products"][number], specification: SeikoOrder["products"][number]["specifications"][number], record: SeikoOrder["records"][number]) {
  if (specification.role === "asset") return "";
  if (specification.mode === "per_person") return String(record.values[`spec:${specification.id}`] || "");
  if (specification.mode === "default_with_exceptions") return String(record.values[`spec:${specification.id}:override`] || specification.defaultValue || "");
  if (specification.mode === "by_group") {
    const source = String(record.values[`field:${specification.groupFieldId}`] || "");
    return specification.groupRules.find(rule => groupRuleMatches(rule.match, source))?.value || specification.defaultValue || "";
  }
  return specification.defaultValue || "";
}
function productLine(order: SeikoOrder, product: SeikoOrder["products"][number], record: SeikoOrder["records"][number], recordIndex: number): DynamicLine | null {
  const quantity = productQuantity(order, product, record, recordIndex);
  if (quantity <= 0) return null;
  const values = normalizedMeasurements(order, record.values);
  const measurementValues = order.measurements
    .filter(measurement => measurement.appliesTo.includes(product.id) && measurement.name.trim())
    .map(measurement => ({ name: measurement.name, value: String(values[`measurement:${measurement.id}:product:${product.id}`] || "").trim() }))
    .filter(entry => entry.value);
  const primaryEntry = measurementValues[0];
  const details = measurementValues.slice(1).map(entry => `${abbreviation(entry.name)} ${entry.value}`);
  for (const specification of product.specifications.filter(item => item.name.trim())) {
    const value = specificationValue(product, specification, record).trim();
    if (value) details.push(`${abbreviation(specification.name)} ${value}`);
  }
  return { product: product.name, primary: primaryEntry?.value || "", details, quantity };
}
function selectedProductNames(order: SeikoOrder) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(".personPackageSetup fieldset label"));
  if (!labels.length) return new Set(order.products.map(product => product.name));
  return new Set(labels.filter(label => label.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).map(label => label.textContent?.trim() || "").filter(Boolean));
}
function packagePlan(): PackagePlan {
  const value = document.querySelector<HTMLSelectElement>(".personPackageSetup select")?.value;
  return value === "sets" || value === "products" ? value : "together";
}
function buildRecords(order: SeikoOrder): DynamicRecord[] {
  const products = order.products.filter(product => product.name.trim());
  const included = selectedProductNames(order);
  const plan = packagePlan();
  return order.records.filter(record => !record.held).flatMap((record, recordIndex) => {
    const lines = products.filter(product => included.has(product.name)).map(product => productLine(order, product, record, recordIndex)).filter((line): line is DynamicLine => !!line);
    if (!lines.length) return [];
    const name = String(record.values[`field:${order.fields[0]?.id}`] || record.personId || "");
    const group = String(record.values[`field:${order.fields[1]?.id}`] || "");
    const recordValues = Object.values(record.values).map(value => String(value || "").trim()).filter(Boolean);
    const make = (packageLines: DynamicLine[], suffix: string): DynamicRecord => {
      const summary = packageLines.map(line => `${line.product} × ${line.quantity}`).join(", ");
      const detailLength = packageLines.reduce((sum, line) => sum + line.product.length + line.primary.length + line.details.join(" ").length, 0);
      return { id: `person:${record.recordId}:${suffix}`, recordId: record.recordId, name, group, summary, lines: packageLines, values: [name, group, ...recordValues], score: name.length + packageLines.length * 28 + detailLength };
    };
    if (plan === "products") return lines.map((line, index) => make([line], products.find(product => product.name === line.product)?.id || `product-${index + 1}`));
    if (plan === "sets") {
      const count = Math.max(...lines.map(line => line.quantity));
      return Array.from({ length: count }, (_, index) => make(lines.filter(line => line.quantity > index).map(line => ({ ...line, quantity: 1 })), `set-${index + 1}`)).filter(record => record.lines.length);
    }
    return [make(lines, "all")];
  });
}
function dynamicBlockMarkup(lines: DynamicLine[]) {
  const root = document.createElement("span");
  root.className = "dynamicProductRows";
  root.setAttribute("aria-label", "Products and measurements");
  for (const line of lines) {
    const row = document.createElement("span"); row.className = "dynamicProductRow";
    const name = document.createElement("b"); name.className = "dynamicProductName"; name.textContent = `${line.product}:`;
    const primary = document.createElement("span"); primary.className = "dynamicProductPrimary"; primary.textContent = line.primary || (line.quantity > 1 ? `×${line.quantity}` : "");
    row.append(name, primary);
    const detailParts = [...line.details];
    if (line.quantity > 1 && line.primary) detailParts.push(`×${line.quantity}`);
    if (detailParts.length) { const detail = document.createElement("small"); detail.className = "dynamicProductDetails"; detail.textContent = detailParts.join(" · "); row.appendChild(detail); }
    root.appendChild(row);
  }
  return root;
}
function fitBlock(element: HTMLElement, lines: DynamicLine[]) {
  const rect = element.getBoundingClientRect();
  const basePx = Number.parseFloat(getComputedStyle(element).fontSize || "16") || 16;
  const longest = Math.max(1, ...lines.map(line => `${line.product}: ${line.primary} ${line.details.join(" · ")} ${line.quantity > 1 ? `×${line.quantity}` : ""}`.length));
  let sizePx = basePx;
  if (rect.width > 0 && rect.height > 0) {
    const byHeight = rect.height / Math.max(1, lines.length * 1.12);
    const byWidth = rect.width / Math.max(1, longest * .53);
    sizePx = Math.max(Math.min(basePx, byHeight, byWidth), Math.min(basePx, 7));
  } else {
    const widthMm = Number.parseFloat(element.style.width || "0");
    const heightMm = Number.parseFloat(element.style.height || "0");
    const basePt = Number.parseFloat(element.style.fontSize || "0") || 7;
    const byHeightPt = heightMm > 0 ? heightMm / (.352778 * Math.max(1, lines.length * 1.12)) : basePt;
    const byWidthPt = widthMm > 0 ? widthMm / (.352778 * Math.max(1, longest * .53)) : basePt;
    element.style.setProperty("--dynamic-product-font-pt", `${Math.max(4, Math.min(basePt, byHeightPt, byWidthPt))}pt`);
  }
  element.style.setProperty("--dynamic-product-font-px", `${sizePx}px`);
}
function relabelProductSummary() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .fieldChoice,.labelDesignerPage .labelInfoChip").forEach(node => {
    const text = node.textContent?.replace(/×\s*$/, "").trim() || "";
    if (!PRODUCT_SUMMARY_LABELS.has(text)) return;
    const textNode = node.querySelector<HTMLElement>("label span,.labelInfoChipText") || node;
    if (textNode.textContent?.trim() !== "Products & measurements") textNode.textContent = "Products & measurements";
  });
}
function scorePrintedCandidate(label: HTMLElement, candidates: DynamicRecord[], used: Set<string>) {
  const text = label.textContent || "";
  return candidates.filter(candidate => !used.has(candidate.id) && text.includes(candidate.summary)).map(candidate => ({ candidate, score: (text.includes(candidate.name) ? 100 : 0) + (text.includes(candidate.group) && candidate.group ? 30 : 0) + candidate.values.reduce((sum, value) => value.length > 1 && text.includes(value) ? sum + 1 : sum, 0) })).sort((a, b) => b.score - a.score)[0]?.candidate || null;
}
function transformField(element: HTMLElement, record: DynamicRecord) {
  if (!record.lines.length) { element.hidden = true; return; }
  element.hidden = false;
  element.classList.remove("element-field");
  element.classList.add("element-dynamic-products");
  element.dataset.dynamicRecordId = record.id;
  element.replaceChildren(dynamicBlockMarkup(record.lines));
  fitBlock(element, record.lines);
}
function enhancePreview(records: DynamicRecord[]) {
  const page = document.querySelector<HTMLElement>(".labelDesignerPage");
  const canvas = page?.querySelector<HTMLElement>(".labelCanvas");
  const sample = page?.querySelector<HTMLSelectElement>(".labelPreviewSample select");
  if (!canvas || !sample) return;
  const record = records.find(item => item.id === sample.value);
  if (!record) return;
  const existing = canvas.querySelector<HTMLElement>(`.canvasElement[data-dynamic-record-id="${CSS.escape(record.id)}"]`);
  if (existing) { fitBlock(existing, record.lines); return; }
  const target = Array.from(canvas.querySelectorAll<HTMLElement>(".canvasElement.element-field,.canvasElement.element-dynamic-products")).find(element => element.classList.contains("element-dynamic-products") || element.textContent?.trim() === record.summary);
  if (target) transformField(target, record);
}
function enhancePrint(records: DynamicRecord[]) {
  const used = new Set<string>();
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .printSheet .printedLabel").forEach(label => {
    const remembered = label.dataset.dynamicRecordId ? records.find(record => record.id === label.dataset.dynamicRecordId) : null;
    const record = remembered || scorePrintedCandidate(label, records, used);
    if (!record) return;
    used.add(record.id); label.dataset.dynamicRecordId = record.id;
    const target = Array.from(label.querySelectorAll<HTMLElement>(".printedElement.element-field,.printedElement.element-dynamic-products")).find(element => element.classList.contains("element-dynamic-products") || element.textContent?.trim() === record.summary);
    if (target) transformField(target, record);
  });
}
function stressPreview(records: DynamicRecord[]) {
  const toolbar = document.querySelector<HTMLElement>(".labelDesignerPage .canvasToolbar");
  const sample = toolbar?.querySelector<HTMLSelectElement>(".labelPreviewSample select");
  if (!toolbar || !sample || !records.length) return;
  let control = toolbar.querySelector<HTMLLabelElement>(".labelStressPreview");
  if (!control) {
    control = document.createElement("label"); control.className = "labelStressPreview";
    const title = document.createElement("span"); title.textContent = "Test layout";
    const select = document.createElement("select"); select.setAttribute("aria-label", "Test label layout with demanding records");
    control.append(title, select); toolbar.appendChild(control);
    select.addEventListener("change", () => {
      if (!select.value) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sample, select.value);
      sample.dispatchEvent(new Event("change", { bubbles: true }));
      select.value = "";
    });
  }
  const select = control.querySelector("select")!;
  const longestName = [...records].sort((a, b) => b.name.length - a.name.length)[0];
  const mostProducts = [...records].sort((a, b) => b.lines.length - a.lines.length || b.score - a.score)[0];
  const mostDemanding = [...records].sort((a, b) => b.score - a.score)[0];
  const signature = [longestName.id, mostProducts.id, mostDemanding.id].join("|");
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  select.replaceChildren(new Option("Choose stress test", ""), new Option(`Longest name · ${longestName.name}`, longestName.id), new Option(`Most products · ${mostProducts.name}`, mostProducts.id), new Option(`Most demanding · ${mostDemanding.name}`, mostDemanding.id));
}
function enhance() {
  const page = document.querySelector<HTMLElement>(".labelDesignerPage");
  if (!page || !/·\s*Packing/i.test(page.querySelector(".labelTopbar .eyebrow")?.textContent || "")) return;
  const source = page.querySelector<HTMLSelectElement>(".labelSetup select")?.value;
  if (source !== "person") return;
  const order = currentOrder(); if (!order) return;
  const records = buildRecords(order);
  relabelProductSummary();
  enhancePreview(records);
  enhancePrint(records);
  stressPreview(records);
}

export function LabelDynamicProducts() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; enhance(); }); };
    enhance();
    const observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    document.addEventListener("change", schedule, true);
    window.addEventListener("resize", schedule);
    return () => { observer.disconnect(); document.removeEventListener("change", schedule, true); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
