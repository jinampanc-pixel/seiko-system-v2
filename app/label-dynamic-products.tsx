"use client";

import { useEffect } from "react";
import { groupRuleMatches, quantityForRecord, workspaceColumns, type SeikoOrder } from "./lib/order-domain";

type PackagePlan = "together" | "sets" | "products";
type FitState = "normal" | "shrunk" | "overflow";
type FitResult = { state: FitState; fontPt: number };
type DynamicLine = { productId: string; product: string; primary: string; details: string[]; quantity: number };
type DynamicRecord = {
  id: string;
  recordId: string;
  name: string;
  group: string;
  summary: string;
  lines: DynamicLine[];
  values: string[];
  fields: Record<string, string>;
  schema: string;
  score: number;
};
type SchemaGroup = { signature: string; products: string[]; records: DynamicRecord[] };
type ValidationItem = { record: DynamicRecord; state: FitState; fontPt: number };
type ValidationSummary = { total: number; normal: number; shrunk: number; overflow: ValidationItem[] };
type VariantOverride = { x: number; y: number; w: number; h: number; maxFontPt?: number };

type VariantStore = Record<string, VariantOverride>;

const PRODUCT_SUMMARY_LABELS = new Set(["Package contents", "Product and quantity summary", "Products & measurements"]);
const PX_PER_MM = 96 / 25.4;
const PX_PER_PT = 96 / 72;
const MIN_TEXT_PT = 4;
const MIN_PRODUCT_PT = 4.25;
let migratingFields = false;

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
function variantKey(order: SeikoOrder) { return `jinam:${businessId()}:labels:adaptive-variants-v1:${order.orderId}`; }
function readVariants(order: SeikoOrder): VariantStore {
  try { return JSON.parse(localStorage.getItem(variantKey(order)) || "{}") as VariantStore; }
  catch { return {}; }
}
function saveVariants(order: SeikoOrder, variants: VariantStore) { localStorage.setItem(variantKey(order), JSON.stringify(variants)); }
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
  return { productId: product.id, product: product.name, primary: primaryEntry?.value || "", details, quantity };
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
    const rawFields = Object.fromEntries(Object.entries(record.values).map(([key, value]) => [key, String(value ?? "")]));
    const fields: Record<string, string> = { ...rawFields, name, group, client: order.details.clientName, order: order.details.orderNo };
    const recordValues = Object.values(fields).map(value => value.trim()).filter(Boolean);
    const make = (packageLines: DynamicLine[], suffix: string): DynamicRecord => {
      const summary = packageLines.map(line => `${line.product} × ${line.quantity}`).join(", ");
      const schema = packageLines.map(line => line.productId).join("|");
      const detailLength = packageLines.reduce((sum, line) => sum + line.product.length + line.primary.length + line.details.join(" ").length, 0);
      return { id: `person:${record.recordId}:${suffix}`, recordId: record.recordId, name, group, summary, lines: packageLines, values: recordValues, fields, schema, score: name.length + packageLines.length * 28 + detailLength };
    };
    if (plan === "products") return lines.map((line, index) => make([line], line.productId || `product-${index + 1}`));
    if (plan === "sets") {
      const count = Math.max(...lines.map(line => line.quantity));
      return Array.from({ length: count }, (_, index) => make(lines.filter(line => line.quantity > index).map(line => ({ ...line, quantity: 1 })), `set-${index + 1}`)).filter(candidate => candidate.lines.length);
    }
    return [make(lines, "all")];
  });
}
function schemaGroups(records: DynamicRecord[]): SchemaGroup[] {
  const map = new Map<string, DynamicRecord[]>();
  records.forEach(record => map.set(record.schema, [...(map.get(record.schema) || []), record]));
  return [...map.entries()].map(([signature, grouped]) => ({ signature, products: grouped[0]?.lines.map(line => line.product) || [], records: grouped })).sort((a, b) => b.records.length - a.records.length);
}
function dynamicBlockMarkup(lines: DynamicLine[]) {
  const root = document.createElement("span"); root.className = "dynamicProductRows"; root.setAttribute("aria-label", "Products and measurements");
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
function labelDimensions(page = document.querySelector<HTMLElement>(".labelDesignerPage")) {
  const title = page?.querySelector(".canvasToolbar b")?.textContent || "";
  const match = title.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*mm/i);
  return { width: Number(match?.[1]) || 50, height: Number(match?.[2]) || 25 };
}
function elementBoxPx(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height };
  const widthMm = Number.parseFloat(element.style.width || "0"), heightMm = Number.parseFloat(element.style.height || "0");
  return { width: widthMm * PX_PER_MM, height: heightMm * PX_PER_MM };
}
function preferredFontPt(element: HTMLElement) {
  const data = Number.parseFloat(element.dataset.fontPt || "");
  if (Number.isFinite(data) && data > 0) return data;
  const inline = Number.parseFloat(element.style.fontSize || "");
  if (element.style.fontSize.endsWith("pt") && inline > 0) return inline;
  const computed = Number.parseFloat(getComputedStyle(element).fontSize || "0");
  return computed > 0 ? computed / PX_PER_PT : 7;
}
function measureMarkup(element: HTMLElement, fontPx: number) {
  const measure = document.createElement("span");
  const style = getComputedStyle(element);
  measure.className = "adaptiveMeasure";
  measure.style.cssText = `position:fixed;left:-10000px;top:-10000px;visibility:hidden;display:inline-flex;align-items:baseline;white-space:nowrap;width:max-content;height:max-content;line-height:1.02;font-family:${style.fontFamily};font-size:${fontPx}px;font-style:${style.fontStyle};font-variant:${style.fontVariant};font-weight:${style.fontWeight};letter-spacing:${style.letterSpacing};`;
  measure.innerHTML = element.innerHTML;
  document.body.appendChild(measure);
  const rect = measure.getBoundingClientRect();
  measure.remove();
  return { width: rect.width, height: rect.height };
}
function fitSingleLine(element: HTMLElement, minPt = MIN_TEXT_PT): FitResult {
  if (!element.textContent?.trim()) return { state: "normal", fontPt: preferredFontPt(element) };
  const box = elementBoxPx(element), preferredPt = preferredFontPt(element), preferredPx = preferredPt * PX_PER_PT, minimumPt = Math.min(preferredPt, minPt), minimumPx = minimumPt * PX_PER_PT;
  const fits = (px: number) => { const measured = measureMarkup(element, px); return measured.width <= box.width + .5 && measured.height <= box.height + .5; };
  let chosenPx = preferredPx, state: FitState = "normal";
  if (!fits(preferredPx)) {
    state = "shrunk";
    let low = minimumPx, high = preferredPx;
    if (!fits(minimumPx)) { chosenPx = minimumPx; state = "overflow"; }
    else {
      for (let i = 0; i < 10; i += 1) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
      chosenPx = low;
    }
  }
  const chosenPt = chosenPx / PX_PER_PT;
  element.style.fontSize = element.classList.contains("printedElement") ? `${chosenPt}pt` : `${chosenPx}px`;
  element.style.lineHeight = "1.02";
  element.style.overflow = "hidden";
  element.style.whiteSpace = "nowrap";
  element.dataset.adaptiveFit = state;
  element.dataset.adaptiveFontPt = chosenPt.toFixed(2);
  return { state, fontPt: chosenPt };
}
function measureProductLines(lines: DynamicLine[], fontPx: number) {
  const host = document.createElement("span");
  host.className = "adaptiveMeasure dynamicProductRows";
  host.style.cssText = `position:fixed;left:-10000px;top:-10000px;visibility:hidden;width:max-content;height:max-content;font-size:${fontPx}px;line-height:1.04;`;
  host.appendChild(dynamicBlockMarkup(lines));
  document.body.appendChild(host);
  const rows = Array.from(host.querySelectorAll<HTMLElement>(".dynamicProductRow"));
  const width = Math.max(0, ...rows.map(row => row.getBoundingClientRect().width));
  const height = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) + Math.max(0, rows.length - 1) * fontPx * .08;
  host.remove();
  return { width, height };
}
function fitProductBlock(element: HTMLElement, lines: DynamicLine[], maxFontPt?: number): FitResult {
  const box = elementBoxPx(element), preferredPt = Math.min(preferredFontPt(element), maxFontPt || Number.POSITIVE_INFINITY), preferredPx = preferredPt * PX_PER_PT, minimumPt = Math.min(preferredPt, MIN_PRODUCT_PT), minimumPx = minimumPt * PX_PER_PT;
  const fits = (px: number) => { const measured = measureProductLines(lines, px); return measured.width <= box.width + .5 && measured.height <= box.height + .5; };
  let chosenPx = preferredPx, state: FitState = "normal";
  if (!fits(preferredPx)) {
    state = "shrunk";
    let low = minimumPx, high = preferredPx;
    if (!fits(minimumPx)) { chosenPx = minimumPx; state = "overflow"; }
    else { for (let i = 0; i < 10; i += 1) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; } chosenPx = low; }
  }
  const chosenPt = chosenPx / PX_PER_PT;
  const rows = element.querySelector<HTMLElement>(".dynamicProductRows");
  if (rows) rows.style.fontSize = element.classList.contains("printedElement") ? `${chosenPt}pt` : `${chosenPx}px`;
  element.dataset.adaptiveFit = state; element.dataset.adaptiveFontPt = chosenPt.toFixed(2);
  return { state, fontPt: chosenPt };
}
function relabelProductSummary() {
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .fieldChoice,.labelDesignerPage .labelInfoChip").forEach(node => {
    const text = node.textContent?.replace(/×\s*$/, "").trim() || "";
    if (!PRODUCT_SUMMARY_LABELS.has(text)) return;
    const textNode = node.querySelector<HTMLElement>("label span") || node.querySelector<HTMLElement>("span") || node;
    if (textNode.textContent?.trim() !== "Products & measurements") textNode.textContent = "Products & measurements";
  });
}
function ensureAdaptiveFieldSelection(page: HTMLElement) {
  if (migratingFields || page.dataset.adaptiveFieldsReady === "true") return true;
  const choices = Array.from(page.querySelectorAll<HTMLElement>(".fieldChoice"));
  const summaryChoice = choices.find(choice => PRODUCT_SUMMARY_LABELS.has(choice.querySelector("label span")?.textContent?.trim() || ""));
  const summaryCheckbox = summaryChoice?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const productSpecific = choices.filter(choice => choice.dataset.productDetailGroup).map(choice => choice.querySelector<HTMLInputElement>('input[type="checkbox"]')).filter((input): input is HTMLInputElement => !!input && input.checked);
  if (summaryCheckbox && !summaryCheckbox.checked) {
    migratingFields = true; summaryCheckbox.click(); requestAnimationFrame(() => { migratingFields = false; }); return false;
  }
  if (productSpecific.length) {
    migratingFields = true; productSpecific.forEach(input => input.click()); requestAnimationFrame(() => { migratingFields = false; }); return false;
  }
  page.dataset.adaptiveFieldsReady = "true";
  return true;
}
function scorePrintedCandidate(label: HTMLElement, candidates: DynamicRecord[], used: Set<string>) {
  const text = label.textContent || "";
  return candidates.filter(candidate => !used.has(candidate.id)).map(candidate => ({ candidate, score: (text.includes(candidate.name) ? 120 : 0) + (candidate.group && text.includes(candidate.group) ? 30 : 0) + (candidate.summary && text.includes(candidate.summary) ? 80 : 0) + candidate.values.reduce((sum, value) => value.length > 1 && text.includes(value) ? sum + 1 : sum, 0) })).sort((a, b) => b.score - a.score)[0]?.candidate || null;
}
function applyVariantGeometry(element: HTMLElement, override: VariantOverride | undefined, printed: boolean) {
  if (!override) return;
  const size = labelDimensions();
  if (printed) {
    element.style.left = `${override.x}mm`; element.style.top = `${override.y}mm`; element.style.width = `${override.w}mm`; element.style.height = `${override.h}mm`;
  } else {
    element.style.left = `${override.x / size.width * 100}%`; element.style.top = `${override.y / size.height * 100}%`; element.style.width = `${override.w / size.width * 100}%`; element.style.height = `${override.h / size.height * 100}%`;
  }
}
function transformField(element: HTMLElement, record: DynamicRecord, override?: VariantOverride) {
  if (!record.lines.length) { element.hidden = true; return { state: "normal" as FitState, fontPt: preferredFontPt(element) }; }
  element.hidden = false; element.classList.add("element-dynamic-products"); element.dataset.dynamicRecordId = record.id; element.dataset.adaptiveSchema = record.schema;
  applyVariantGeometry(element, override, element.classList.contains("printedElement"));
  element.replaceChildren(dynamicBlockMarkup(record.lines));
  return fitProductBlock(element, record.lines, override?.maxFontPt);
}
function fitOtherElements(root: HTMLElement) {
  const selector = root.classList.contains("labelCanvas") ? ".canvasElement" : ".printedElement";
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(element => !element.classList.contains("element-dynamic-products") && !element.classList.contains("element-qr") && !element.classList.contains("element-barcode") && !element.hidden).map(element => fitSingleLine(element));
}
function findDynamicTarget(root: HTMLElement, record: DynamicRecord) {
  const selector = root.classList.contains("labelCanvas") ? ".canvasElement.element-field,.canvasElement.element-dynamic-products" : ".printedElement.element-field,.printedElement.element-dynamic-products";
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
  return elements.find(element => element.classList.contains("element-dynamic-products")) || elements.find(element => element.textContent?.trim() === record.summary) || elements.find(element => PRODUCT_SUMMARY_LABELS.has(element.textContent?.trim() || "")) || null;
}
function renderAdaptiveLabel(root: HTMLElement, record: DynamicRecord, variants: VariantStore) {
  const target = findDynamicTarget(root, record);
  const productFit = target ? transformField(target, record, variants[record.schema]) : { state: "overflow" as FitState, fontPt: MIN_PRODUCT_PT };
  const fixedFits = fitOtherElements(root);
  const all = [productFit, ...fixedFits];
  const state: FitState = all.some(item => item.state === "overflow") ? "overflow" : all.some(item => item.state === "shrunk") ? "shrunk" : "normal";
  const fontPt = Math.min(...all.map(item => item.fontPt).filter(Number.isFinite));
  root.dataset.adaptiveFit = state;
  return { state, fontPt: Number.isFinite(fontPt) ? fontPt : productFit.fontPt };
}
function enhancePreview(records: DynamicRecord[], variants: VariantStore) {
  const page = document.querySelector<HTMLElement>(".labelDesignerPage"), canvas = page?.querySelector<HTMLElement>(".labelCanvas"), sample = page?.querySelector<HTMLSelectElement>(".labelPreviewSample select");
  if (!canvas || !sample) return null;
  const record = records.find(item => item.id === sample.value); if (!record) return null;
  renderAdaptiveLabel(canvas, record, variants);
  return record;
}
function enhancePrint(records: DynamicRecord[], variants: VariantStore): ValidationSummary {
  const used = new Set<string>(), results: ValidationItem[] = [];
  document.querySelectorAll<HTMLElement>(".labelDesignerPage .printSheet .printedLabel").forEach(label => {
    const remembered = label.dataset.dynamicRecordId ? records.find(record => record.id === label.dataset.dynamicRecordId) : null;
    const record = remembered || scorePrintedCandidate(label, records, used); if (!record) return;
    used.add(record.id); label.dataset.dynamicRecordId = record.id;
    const fit = renderAdaptiveLabel(label, record, variants); results.push({ record, ...fit });
  });
  return { total: results.length, normal: results.filter(item => item.state === "normal").length, shrunk: results.filter(item => item.state === "shrunk").length, overflow: results.filter(item => item.state === "overflow") };
}
function previewRecord(id: string) {
  const sample = document.querySelector<HTMLSelectElement>(".labelDesignerPage .labelPreviewSample select");
  if (!sample) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sample, id);
  sample.dispatchEvent(new Event("change", { bubbles: true }));
}
function captureProductZone(): VariantOverride | null {
  const canvas = document.querySelector<HTMLElement>(".labelDesignerPage .labelCanvas"), target = canvas?.querySelector<HTMLElement>(".element-dynamic-products");
  if (!canvas || !target) return null;
  const canvasRect = canvas.getBoundingClientRect(), rect = target.getBoundingClientRect(), size = labelDimensions();
  if (!canvasRect.width || !canvasRect.height) return null;
  return { x: (rect.left - canvasRect.left) / canvasRect.width * size.width, y: (rect.top - canvasRect.top) / canvasRect.height * size.height, w: rect.width / canvasRect.width * size.width, h: rect.height / canvasRect.height * size.height, maxFontPt: preferredFontPt(target) };
}
function conditionalDetailCount(records: DynamicRecord[]) { return records.filter(record => record.lines.some(line => line.details.length > 0)).length; }
function renderAdaptivePanel(order: SeikoOrder, records: DynamicRecord[], schemas: SchemaGroup[], validation: ValidationSummary, variants: VariantStore) {
  const grid = document.querySelector<HTMLElement>(".labelDesignerPage .labelDesignerGrid"); if (!grid) return;
  let panel = document.querySelector<HTMLElement>(".labelDesignerPage .adaptiveLabelPanel");
  if (!panel) { panel = document.createElement("section"); panel.className = "adaptiveLabelPanel panel"; grid.insertAdjacentElement("beforebegin", panel); }
  panel.replaceChildren();
  const head = document.createElement("div"); head.className = "adaptiveLabelHead";
  head.innerHTML = `<div><p class="eyebrow">ADAPTIVE LABEL ENGINE</p><h3>${schemas.length} product structure${schemas.length === 1 ? "" : "s"} detected</h3><small>JINAM fits every selected label automatically. Product structure creates variants; occasional measurements stay conditional inside the product row.</small></div>`;
  const fit = document.createElement("div"); fit.className = `adaptiveFitSummary ${validation.overflow.length ? "hasOverflow" : "ready"}`;
  fit.innerHTML = validation.total ? `<b>${validation.total} labels checked</b><span>${validation.normal} preferred size · ${validation.shrunk} auto-fitted · ${validation.overflow.length} overflow</span>` : `<b>Preparing validation</b><span>Selected labels will be checked automatically.</span>`;
  head.appendChild(fit); panel.appendChild(head);
  const structures = document.createElement("div"); structures.className = "adaptiveSchemaList";
  schemas.forEach((schema, index) => {
    const row = document.createElement("article"); row.dataset.schema = schema.signature;
    const overflowCount = validation.overflow.filter(item => item.record.schema === schema.signature).length;
    const title = document.createElement("div"); title.innerHTML = `<b>${schema.products.join(" + ") || "No products"}</b><small>${schema.records.length} label${schema.records.length === 1 ? "" : "s"}${index === 0 ? " · primary structure" : ""}${overflowCount ? ` · ${overflowCount} needs attention` : " · adapts automatically"}</small>`;
    const actions = document.createElement("div");
    const preview = document.createElement("button"); preview.type = "button"; preview.className = "secondary"; preview.textContent = "Preview"; preview.addEventListener("click", () => previewRecord(schema.records[0].id)); actions.appendChild(preview);
    if (overflowCount || variants[schema.signature]) {
      const customize = document.createElement("button"); customize.type = "button"; customize.className = "secondary"; customize.textContent = variants[schema.signature] ? "Edit variant" : "Customize variant"; customize.addEventListener("click", () => {
        previewRecord(schema.records[0].id);
        requestAnimationFrame(() => openVariantEditor(order, schema, variants));
      }); actions.appendChild(customize);
    }
    row.append(title, actions); structures.appendChild(row);
  });
  panel.appendChild(structures);
  const conditional = conditionalDetailCount(records);
  const note = document.createElement("p"); note.className = "adaptiveConditionalNote"; note.textContent = conditional ? `${conditional} labels contain extra measurements/specifications (for example waist). They are included only where present and do not create extra templates.` : "No sparse measurement exceptions detected in this selection."; panel.appendChild(note);
  if (validation.overflow.length) {
    const exceptions = document.createElement("div"); exceptions.className = "adaptiveExceptions";
    const heading = document.createElement("b"); heading.textContent = "Layout exceptions"; exceptions.appendChild(heading);
    validation.overflow.slice(0, 8).forEach(item => { const button = document.createElement("button"); button.type = "button"; button.textContent = `${item.record.name} · ${item.record.lines.map(line => line.product).join(" + ")}`; button.addEventListener("click", () => previewRecord(item.record.id)); exceptions.appendChild(button); });
    if (validation.overflow.length > 8) { const more = document.createElement("span"); more.textContent = `+ ${validation.overflow.length - 8} more`; exceptions.appendChild(more); }
    panel.appendChild(exceptions);
  }
}
function openVariantEditor(order: SeikoOrder, schema: SchemaGroup, variants: VariantStore) {
  document.querySelector(".adaptiveVariantEditor")?.remove();
  const base = variants[schema.signature] || captureProductZone(); if (!base) return;
  const editor = document.createElement("div"); editor.className = "adaptiveVariantEditor"; editor.setAttribute("role", "dialog"); editor.setAttribute("aria-label", `Customize ${schema.products.join(" + ")} product zone`);
  editor.innerHTML = `<div><b>${schema.products.join(" + ")}</b><small>Only this product structure will use these product-zone dimensions. Names and other text still auto-fit automatically.</small></div>`;
  const fields = document.createElement("div"); fields.className = "adaptiveVariantFields";
  const definitions: Array<[keyof VariantOverride, string, number]> = [["x", "X mm", .25], ["y", "Y mm", .25], ["w", "Width mm", .25], ["h", "Height mm", .25], ["maxFontPt", "Max font pt", .25]];
  definitions.forEach(([keyName, label, step]) => { const labelNode = document.createElement("label"); const span = document.createElement("span"); span.textContent = label; const input = document.createElement("input"); input.type = "number"; input.step = String(step); input.min = keyName === "maxFontPt" ? "4.25" : "0"; input.value = String(base[keyName] ?? 7); input.dataset.variantKey = keyName; labelNode.append(span, input); fields.appendChild(labelNode); });
  editor.appendChild(fields);
  const actions = document.createElement("div"); actions.className = "adaptiveVariantActions";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "secondary"; cancel.textContent = "Cancel"; cancel.addEventListener("click", () => editor.remove());
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "secondary"; reset.textContent = "Use shared layout"; reset.addEventListener("click", () => { const next = { ...readVariants(order) }; delete next[schema.signature]; saveVariants(order, next); editor.remove(); window.dispatchEvent(new Event("resize")); });
  const save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = "Save variant"; save.addEventListener("click", () => {
    const next: VariantOverride = { ...base };
    fields.querySelectorAll<HTMLInputElement>("input").forEach(input => { const keyName = input.dataset.variantKey as keyof VariantOverride; const value = Number(input.value); if (Number.isFinite(value)) next[keyName] = value; });
    const size = labelDimensions(); next.x = Math.max(0, Math.min(next.x, size.width - 1)); next.y = Math.max(0, Math.min(next.y, size.height - 1)); next.w = Math.max(1, Math.min(next.w, size.width - next.x)); next.h = Math.max(1, Math.min(next.h, size.height - next.y));
    saveVariants(order, { ...readVariants(order), [schema.signature]: next }); editor.remove(); window.dispatchEvent(new Event("resize"));
  });
  actions.append(cancel, reset, save); editor.appendChild(actions); document.body.appendChild(editor);
}
function enhance() {
  const page = document.querySelector<HTMLElement>(".labelDesignerPage");
  if (!page || !/·\s*Packing/i.test(page.querySelector(".labelTopbar .eyebrow")?.textContent || "")) return;
  const source = page.querySelector<HTMLSelectElement>(".labelSetup select")?.value; if (source !== "person") { page.classList.remove("adaptiveLabelMode"); document.querySelector(".adaptiveLabelPanel")?.remove(); return; }
  const order = currentOrder(); if (!order) return;
  page.classList.add("adaptiveLabelMode");
  if (!ensureAdaptiveFieldSelection(page)) return;
  relabelProductSummary();
  const records = buildRecords(order), variants = readVariants(order), schemas = schemaGroups(records);
  enhancePreview(records, variants);
  const validation = enhancePrint(records, variants);
  renderAdaptivePanel(order, records, schemas, validation, variants);
}

export function LabelDynamicProducts() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; enhance(); }); };
    const beforeUserPrint = (event: Event) => { const target = event.target as Element | null; if (target?.closest?.(".labelHeaderCommandBar .primary,.labelCenterActionMenu")) enhance(); };
    const beforePrint = () => enhance();
    enhance();
    const observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    document.addEventListener("change", schedule, true); document.addEventListener("pointerdown", beforeUserPrint, true); window.addEventListener("beforeprint", beforePrint); window.addEventListener("resize", schedule);
    return () => { observer.disconnect(); document.removeEventListener("change", schedule, true); document.removeEventListener("pointerdown", beforeUserPrint, true); window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); document.querySelector(".adaptiveVariantEditor")?.remove(); };
  }, []);
  return null;
}
