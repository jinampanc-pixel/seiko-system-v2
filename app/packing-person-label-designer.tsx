"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { groupRuleMatches, type ProductPolicy, type SeikoOrder } from "./lib/order-domain";

import { eligiblePackingIds, packingQuantities, constrainBox, measureLabelText } from "./lib/packing-label-model";
import { PhysicalLabelCanvas } from "./physical-label-canvas";
import { PHYSICAL_OUTPUT_PROFILES, physicalPageCss } from "./lib/physical-output";
import "./physical-label-editor.css";

type ConditionalMode = "never" | "when_present" | "always";
type DisplayMode = "name_details" | "name_space_details" | "details_only" | "name_only";
type PackageLayoutMode = "flow" | "inline" | "separate";
type PackagePresentation = { layoutMode: PackageLayoutMode; delimiter: string };
type ProductRule = {
  alias: string;
  included: boolean;
  showQuantity: boolean;
  displayMode: DisplayMode;
  primaryMeasurementId: string;
  measurementModes: Record<string, ConditionalMode>;
  measurementAliases: Record<string, string>;
  specificationModes: Record<string, ConditionalMode>;
  specificationAliases: Record<string, string>;
};
type PresentationRules = Record<string, ProductRule>;
type InfoKey = "client" | "package_contents" | "trace_person_position" | "order" | `field:${string}` | `package_row:${number}`;
type LabelItem = {
  id: string;
  field: InfoKey;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  showLabel: boolean;
  printedLabel: string;
  bold: boolean;
  align?: "left" | "center" | "right";
  textSized?: boolean;
};
type PersonRecord = {
  id: string;
  name: string;
  group: string;
  values: Record<string, string | number>;
  sourceIndex: number;
  packageText: string;
  packageLines: string[];
  packageProducts: string[];
};
type SavedTask = {
  id: string;
  name: string;
  orderId: string;
  orderNo: string;
  client: string;
  createdAt: string;
  purpose: "packing";
  sourceMode: "person";
  outputMode: "combined";
  presetId: "pixra-109";
  items: LabelItem[];
  selectedRows: string[];
  personPackagePlan: "together";
  includedProducts: string[];
  packageGroupBy: string;
  packageCounts: Record<string, number>;
  customerUpdates: false;
  presentationRules?: PresentationRules;
  packagePresentation?: PackagePresentation;
  designerKind: "packing-person-v4" | "packing-person-v3";
};
type SavedLayout = {
  id: string;
  name: string;
  clientType: string;
  product: string;
  presetId: "pixra-109";
  items: LabelItem[];
  purpose: "packing";
  sourceMode: "person";
  outputMode: "combined";
  presentationRules?: PresentationRules;
  packagePresentation?: PackagePresentation;
  designerKind: "packing-person-v4" | "packing-person-v3";
};

const PACKING_OUTPUT = PHYSICAL_OUTPUT_PROFILES.label50x25;
const LABEL_W = PACKING_OUTPUT.widthMm;
const LABEL_H = PACKING_OUTPUT.heightMm;
const PACKAGE_FIELD: InfoKey = "package_contents";
const DEFAULT_PACKAGE_PRESENTATION: PackagePresentation = { layoutMode: "flow", delimiter: " / " };
const presentationKey = (businessId: string, orderId: string) => `jinam:${businessId}:packing-person-presentation:${orderId}`;
const packagePresentationKey = (businessId: string, orderId: string) => `jinam:${businessId}:packing-person-package-layout:${orderId}`;
const taskKey = (businessId: string) => `jinam:${businessId}:labels:tasks-v1`;
const layoutKey = (businessId: string) => `jinam:${businessId}:labels:templates-v1`;
const openTaskKey = (businessId: string) => `jinam:${businessId}:labels:open-task`;
const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isPackageField = (field: InfoKey) => field === PACKAGE_FIELD || field.startsWith("package_row:");

function defaultRule(order: SeikoOrder, product: ProductPolicy): ProductRule {
  const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
  const primary = measurements.find(item => /^(length|size)$/i.test(item.name.trim())) || measurements[0];
  const specs = product.specifications.filter(item => item.name.trim() && item.role !== "asset");
  return {
    alias: product.name,
    included: true,
    showQuantity: true,
    displayMode: "name_details",
    primaryMeasurementId: primary?.id || "",
    measurementModes: Object.fromEntries(measurements.map(item => [item.id, "when_present"])),
    measurementAliases: Object.fromEntries(measurements.map(item => [item.id, /^waist$/i.test(item.name.trim()) ? "W" : item.name])),
    specificationModes: Object.fromEntries(specs.map(item => [item.id, "never"])),
    specificationAliases: Object.fromEntries(specs.map(item => [item.id, item.name])),
  };
}

function mergeRules(order: SeikoOrder, supplied?: PresentationRules): PresentationRules {
  return Object.fromEntries(order.products.filter(product => product.name.trim()).map(product => {
    const fallback = defaultRule(order, product);
    const current = supplied?.[product.id];
    return [product.id, current ? {
      ...fallback,
      ...current,
      measurementModes: { ...fallback.measurementModes, ...(current.measurementModes || {}) },
      measurementAliases: { ...fallback.measurementAliases, ...(current.measurementAliases || {}) },
      specificationModes: { ...fallback.specificationModes, ...(current.specificationModes || {}) },
      specificationAliases: { ...fallback.specificationAliases, ...(current.specificationAliases || {}) },
    } : fallback];
  }));
}

function loadRules(businessId: string, order: SeikoOrder): PresentationRules {
  try { return mergeRules(order, JSON.parse(localStorage.getItem(presentationKey(businessId, order.orderId)) || "{}") as PresentationRules); }
  catch { return mergeRules(order); }
}

function loadPackagePresentation(businessId: string, orderId: string): PackagePresentation {
  try {
    const saved = JSON.parse(localStorage.getItem(packagePresentationKey(businessId, orderId)) || "null") as Partial<PackagePresentation> | null;
    return { layoutMode: saved?.layoutMode === "inline" || saved?.layoutMode === "separate" ? saved.layoutMode : "flow", delimiter: saved?.delimiter || DEFAULT_PACKAGE_PRESENTATION.delimiter };
  } catch { return DEFAULT_PACKAGE_PRESENTATION; }
}

function measurementValue(order: SeikoOrder, productId: string, measurementId: string, record: SeikoOrder["records"][number]) {
  const exact = record.values[`measurement:${measurementId}:product:${productId}`];
  if (hasValue(exact)) return String(exact);
  const legacy = record.values[`measurement:${measurementId}`];
  if (!hasValue(legacy)) return "";
  const targets = order.measurements.filter(item => item.id === measurementId && item.appliesTo.includes(productId));
  return targets.length === 1 ? String(legacy) : "";
}

function specificationValue(product: ProductPolicy, spec: ProductPolicy["specifications"][number], record: SeikoOrder["records"][number]) {
  if (spec.mode === "per_person") return String(record.values[`spec:${spec.id}`] || "");
  if (spec.mode === "default_with_exceptions") return String(record.values[`spec:${spec.id}:override`] ?? spec.defaultValue ?? "");
  if (spec.mode === "by_group") {
    const source = spec.groupFieldId ? String(record.values[`field:${spec.groupFieldId}`] || "") : "";
    return spec.groupRules.find(rule => groupRuleMatches(rule.match, source))?.value || spec.defaultValue || "";
  }
  return spec.defaultValue || "";
}

function renderProduct(order: SeikoOrder, product: ProductPolicy, rule: ProductRule, record: SeikoOrder["records"][number], quantity: number) {
  const details: string[] = [];
  const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
  const primary = measurements.find(item => item.id === rule.primaryMeasurementId);
  if (primary && rule.measurementModes[primary.id] !== "never") {
    const value = measurementValue(order, product.id, primary.id, record);
    if (value) details.push(value);
    else if (rule.measurementModes[primary.id] === "always") details.push(`${rule.measurementAliases[primary.id] || primary.name}: —`);
  }
  for (const measurement of measurements) {
    if (measurement.id === primary?.id) continue;
    const mode = rule.measurementModes[measurement.id] || "never";
    if (mode === "never") continue;
    const value = measurementValue(order, product.id, measurement.id, record);
    if (!value && mode === "when_present") continue;
    details.push(`${rule.measurementAliases[measurement.id] || measurement.name}: ${value || "—"}`);
  }
  for (const spec of product.specifications.filter(item => item.name.trim() && item.role !== "asset")) {
    const mode = rule.specificationModes[spec.id] || "never";
    if (mode === "never") continue;
    const value = specificationValue(product, spec, record);
    if (!value && mode === "when_present") continue;
    details.push(`${rule.specificationAliases[spec.id] || spec.name}: ${value || "—"}`);
  }
  if (rule.showQuantity) details.push(`Qty ${quantity}`);
  const name = rule.alias.trim() || product.name;
  if (rule.displayMode === "name_only") return name;
  if (rule.displayMode === "details_only") return details.join(" · ");
  if (!details.length) return name;
  return rule.displayMode === "name_space_details" ? `${name} ${details.join(" · ")}` : `${name}: ${details.join(" · ")}`;
}

export function buildPersonRecords(order: SeikoOrder, rules: PresentationRules, packagePresentation: PackagePresentation, quantities = packingQuantities(order)): PersonRecord[] {
  const included = order.products.filter(product => product.name.trim() && (rules[product.id] || defaultRule(order, product)).included).map(product => product.id);
  const eligible = new Set(eligiblePackingIds(quantities, included));
  const active = order.records.filter(record => !record.held);
  const firstField = order.fields[0];
  const secondField = order.fields[1];
  return active.map((record, sourceIndex) => {
    const lines: string[] = [];
    const packageProducts: string[] = [];
    for (const product of order.products.filter(product => product.name.trim())) {
      const rule = rules[product.id] || defaultRule(order, product);
      if (!rule.included) continue;
      const quantity = quantities.get(record.recordId)?.[product.id] || 0;
      if (quantity <= 0) continue;
      const text = renderProduct(order, product, rule, record, quantity);
      if (!text.trim()) continue;
      packageProducts.push(product.name);
      lines.push(text);
    }
    return {
      id: record.recordId,
      name: String(record.values[`field:${firstField?.id}`] || record.personId || record.recordId),
      group: String(record.values[`field:${secondField?.id}`] || ""),
      values: record.values,
      sourceIndex,
      packageText: packagePresentation.layoutMode === "inline" ? lines.join(packagePresentation.delimiter || " / ") : lines.join("\n"),
      packageLines: lines,
      packageProducts,
    };
  }).filter(record => eligible.has(record.id));
}

function fieldLabel(order: SeikoOrder, key: InfoKey) {
  if (key === "client") return "Client / school";
  if (key === "package_contents") return "Package contents";
  if (key.startsWith("package_row:")) return `Package row ${Number(key.split(":")[1]) + 1}`;
  if (key === "trace_person_position") return "Label number / total";
  if (key === "order") return "Order number";
  const field = order.fields.find(item => `field:${item.id}` === key);
  return field?.name || "Order detail";
}

function fieldValue(order: SeikoOrder, record: PersonRecord, key: InfoKey, index: number, total: number) {
  if (key === "client") return order.details.clientName;
  if (key === "package_contents") return record.packageText;
  if (key.startsWith("package_row:")) return record.packageLines[Number(key.split(":")[1])] || "";
  if (key === "trace_person_position") return `${index + 1} of ${total}`;
  if (key === "order") return order.details.orderNo;
  return String(record.values[key] ?? "");
}

function defaultItems(order: SeikoOrder): LabelItem[] {
  const name = order.fields[0];
  const group = order.fields[1];
  const items: LabelItem[] = [{ id: crypto.randomUUID(), field: "client", label: "Client / school", printedLabel: "Client / school", x: 1.8, y: 1.3, w: 32, h: 3.2, font: 6.5, showLabel: false, bold: true }];
  if (name) items.push({ id: crypto.randomUUID(), field: `field:${name.id}`, label: name.name, printedLabel: name.name, x: 1.8, y: 5, w: 31, h: 5.6, font: 11, showLabel: false, bold: true });
  if (group) items.push({ id: crypto.randomUUID(), field: `field:${group.id}`, label: group.name, printedLabel: group.name, x: 34, y: 4.8, w: 14, h: 6, font: 13, showLabel: false, bold: true });
  items.push({ id: crypto.randomUUID(), field: PACKAGE_FIELD, label: "Package contents", printedLabel: "Package contents", x: 1.8, y: 11.5, w: 46.4, h: 11.6, font: 7.25, showLabel: false, bold: false });
  items.push({ id: crypto.randomUUID(), field: "trace_person_position", label: "Label number / total", printedLabel: "Label", x: 39, y: 1.3, w: 9, h: 3.2, font: 6, showLabel: false, bold: true });
  return items;
}

function rectanglesOverlap(a: Pick<LabelItem, "x"|"y"|"w"|"h">, b: Pick<LabelItem, "x"|"y"|"w"|"h">, gap = .5) {
  return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
}

function freePlacement(items: LabelItem[], field: InfoKey) {
  const packageBlock = isPackageField(field);
  const w = packageBlock ? 30 : 22;
  const h = field.startsWith("package_row:") ? 4.5 : packageBlock ? 9 : 4.5;
  const candidates: Array<{x:number;y:number}> = [];
  for (const y of [2, 7, 12, 17]) for (const x of [2, 26]) candidates.push({ x, y });
  for (const candidate of candidates) {
    const box = { x: candidate.x, y: candidate.y, w: Math.min(w, LABEL_W - candidate.x - 1), h: Math.min(h, LABEL_H - candidate.y - 1) };
    if (!items.some(item => rectanglesOverlap(box, item))) return box;
  }
  let best = { x: 2, y: 2, w, h, score: Number.POSITIVE_INFINITY };
  for (let y = 1; y <= LABEL_H - h - 1; y += 1) for (let x = 1; x <= LABEL_W - w - 1; x += 1) {
    const box = { x, y, w, h };
    const score = items.reduce((sum, item) => sum + (rectanglesOverlap(box, item, 0) ? 1 : 0), 0);
    if (score < best.score) best = { ...box, score };
    if (!score) break;
  }
  return { x: best.x, y: best.y, w: best.w, h: best.h };
}

function migrateItems(order: SeikoOrder, raw: unknown): LabelItem[] {
  if (!Array.isArray(raw)) return defaultItems(order);
  const result: LabelItem[] = [];
  let hasPackage = false;
  for (const source of raw as Array<Record<string, unknown>>) {
    const field = String(source.field || "");
    let mapped: InfoKey | "" = "";
    if (field === "client") mapped = "client";
    else if (field.startsWith("package_row:")) mapped = field as InfoKey;
    else if (field === "product_summary" || field === "package_contents" || field.startsWith("product_name:") || field.startsWith("measurement:") || field.startsWith("package_product:") || field.includes("__packing_product_slot_")) mapped = PACKAGE_FIELD;
    else if (field === "trace_person_position") mapped = "trace_person_position";
    else if (field === "order") mapped = "order";
    else if (field.startsWith("field:") && order.fields.some(item => `field:${item.id}` === field)) mapped = field as InfoKey;
    if (!mapped || (mapped === PACKAGE_FIELD && hasPackage)) continue;
    if (mapped === PACKAGE_FIELD) hasPackage = true;
    const x = Number(source.x), y = Number(source.y), w = Number(source.w), h = Number(source.h), font = Number(source.font);
    result.push({
      id: String(source.id || crypto.randomUUID()), field: mapped, label: fieldLabel(order, mapped), printedLabel: String(source.fieldLabel || source.printedLabel || fieldLabel(order, mapped)),
      x: Number.isFinite(x) ? clamp(x, 0, 49) : 2, y: Number.isFinite(y) ? clamp(y, 0, 24) : 2,
      w: Number.isFinite(w) ? clamp(w, 1, 50) : (isPackageField(mapped) ? 30 : 22), h: Number.isFinite(h) ? clamp(h, 1, 25) : (mapped.startsWith("package_row:") ? 4.5 : isPackageField(mapped) ? 9 : 4.5),
      textSized: source.textSized === true, align: source.align === "center" || source.align === "right" ? source.align : "left", font: Number.isFinite(font) ? clamp(font, .1, 200) : 8, showLabel: Boolean(source.showLabel), bold: Boolean(source.bold || source.valueBold),
    });
  }
  return (result.length ? result : defaultItems(order)).map(constrainBox);
}

function textMetrics(text: string, font: number, bold: boolean) {
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = `${bold ? 700 : 400} ${font * 96 / 72}px Arial`;
  const lines = text.split("\n"), metrics = lines.map(line => context.measureText(line || " "));
  const ascent = Math.max(1, ...metrics.map(m => m.actualBoundingBoxAscent || 0));
  const descent = Math.max(0, ...metrics.map(m => m.actualBoundingBoxDescent || 0));
  const advance = font * 96 / 72 * 1.12;
  return { lines, width: Math.max(1, ...metrics.map(m => Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight))) + .2, height: ascent + descent + (lines.length - 1) * advance + .2, ascent, advance };
}
function FitText({ text, preferredPt, bold, widthMm, heightMm, align = "left" }: { text: string; preferredPt: number; bold: boolean; widthMm: number; heightMm: number; align?: "left" | "center" | "right" }) {
  const small = heightMm / Math.max(1, text.split("\n").length) < 1;
  return <div className="physicalText" data-overflow={small || undefined} aria-label={text} style={{ fontFamily: "Arial", fontSize: `${preferredPt}pt`, fontWeight: bold ? 700 : 400, textAlign: align, lineHeight: 1.12, whiteSpace: "pre", width: "100%", height: "100%", overflow: "hidden" }}>{text}</div>;
}

function packageBounds(items: LabelItem[]) {
  const packageItems = items.filter(item => isPackageField(item.field));
  if (!packageItems.length) return { x: 2, y: 12.5, w: 32, h: 10.5, font: 8 };
  return {
    x: Math.min(...packageItems.map(item => item.x)),
    y: Math.min(...packageItems.map(item => item.y)),
    w: Math.max(...packageItems.map(item => item.x + item.w)) - Math.min(...packageItems.map(item => item.x)),
    h: Math.max(...packageItems.map(item => item.y + item.h)) - Math.min(...packageItems.map(item => item.y)),
    font: packageItems[0].font,
  };
}

export function PackingPersonLabelDesigner({ businessId, order, onBack, backLabel }: {
  businessId: string; canManageSizes: boolean; order: SeikoOrder; onBack?: () => void; backLabel?: string;
}) {
  const [openedTask] = useState<SavedTask | undefined>(() => {
    try {
      const id = sessionStorage.getItem(openTaskKey(businessId));
      return (JSON.parse(localStorage.getItem(taskKey(businessId)) || "[]") as SavedTask[]).find(task => task.id === id && task.orderId === order.orderId);
    } catch { return undefined; }
  });
  const [rules, setRules] = useState(() => openedTask?.presentationRules ? mergeRules(order, openedTask.presentationRules) : loadRules(businessId, order));
  const [packagePresentation, setPackagePresentation] = useState(() => openedTask?.packagePresentation || loadPackagePresentation(businessId, order.orderId));
  const quantities = useMemo(() => packingQuantities(order), [order]);
  const records = useMemo(() => buildPersonRecords(order, rules, packagePresentation, quantities), [order, rules, packagePresentation, quantities]);
  const [items, rawSetItems] = useState<LabelItem[]>(() => openedTask ? migrateItems(order, openedTask.items) : defaultItems(order).map(constrainBox));
  const itemsRef = useRef(items); itemsRef.current = items;
  const [past, setPast] = useState<LabelItem[][]>([]);
  const [future, setFuture] = useState<LabelItem[][]>([]);
  const gesture = useRef<LabelItem[] | null>(null);
  const setItems = (next: LabelItem[]) => {
    const safe = next.map(constrainBox);
    if (JSON.stringify(safe) === JSON.stringify(itemsRef.current)) return;
    const before = itemsRef.current;
    if (!gesture.current) setPast(old => [...old.slice(-99), before]);
    setFuture([]); itemsRef.current = safe; rawSetItems(safe);
  };
  const undo = () => { if (!past.length) return; const next = past[past.length - 1]; setFuture(old => [items, ...old]); setPast(old => old.slice(0, -1)); itemsRef.current = next; rawSetItems(next); };
  const redo = () => { if (!future.length) return; const next = future[0]; setPast(old => [...old, items]); setFuture(old => old.slice(1)); itemsRef.current = next; rawSetItems(next); };
  const [excluded, setExcluded] = useState<string[]>(() => openedTask ? records.filter(record => !openedTask.selectedRows.includes(record.id)).map(record => record.id) : []);
  const selectedRows = records.filter(record => !excluded.includes(record.id)).map(record => record.id);
  const selectedRecords = records.filter(record => !excluded.includes(record.id));
  const [previewId, setPreviewId] = useState("");
  const current = records.find(record => record.id === previewId) || records[0];
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const visibleRecords = records.filter(record => `${record.name} ${record.group} ${record.packageProducts.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const start = Math.max(0, Math.min(Math.floor(scrollTop / 56) - 2, visibleRecords.length - 1));
  const windowRecords = visibleRecords.slice(start, start + 12);
  const eligibilityKey = records.map(record => record.id).join("|");
  const previousEligibility = useRef(eligibilityKey);
  useEffect(() => {
    if (previousEligibility.current === eligibilityKey) return;
    previousEligibility.current = eligibilityKey;
    setExcluded([]); setPreviewId(""); setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [eligibilityKey]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<LabelItem[]>([]);
  const infoButton = useRef<HTMLButtonElement>(null);
  const infoDrawer = useRef<HTMLElement>(null);
  const [recordDetail, setRecordDetail] = useState<{ record: PersonRecord; top: number; left: number } | null>(null);
  const closeInfo = () => { setInfoOpen(false); infoButton.current?.focus(); };
  useEffect(() => { if (infoOpen) infoDrawer.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [infoOpen]);
  useEffect(() => {
    if (!previewId || !listRef.current) return;
    const index = visibleRecords.findIndex(record => record.id === previewId); if (index < 0) return;
    const list = listRef.current, top = index * 56;
    if (top < list.scrollTop || top + 56 > list.scrollTop + list.clientHeight) { list.scrollTop = Math.max(0, top - list.clientHeight / 2 + 28); setScrollTop(list.scrollTop); }
  }, [previewId]);
  // One-time conversion removes legacy container padding while preserving the
  // existing text size. Subsequent gestures scale the glyphs with the box.
  useLayoutEffect(() => {
    if (!current || !items.some(item => !item.textSized)) return;
    const next = items.map(item => {
      if (item.textSized) return item;
      const value = fieldValue(order, current, item.field, records.indexOf(current), records.length);
      const text = item.showLabel && value ? `${item.printedLabel}: ${value}` : value;
      const ctx = document.createElement("canvas").getContext("2d")!;
      const fitted = measureLabelText(text, item.font, item.w, item.h, (line, pt) => { ctx.font = `${item.bold ? 700 : 400} ${pt * 96 / 72}px Arial`; return ctx.measureText(line).width; });
      const metric = textMetrics(text, fitted.font, item.bold);
      return constrainBox({ ...item, textSized: true, font: fitted.font, w: metric.width * 25.4 / 96, h: metric.height * 25.4 / 96 });
    });
    itemsRef.current = next; rawSetItems(next);
  }, [items, current, order, records]);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [draftRules, setDraftRules] = useState(rules);
  const [draftPresentation, setDraftPresentation] = useState(packagePresentation);
  const [printReady, setPrintReady] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTaskId, setActiveTaskId] = useState(openedTask?.id || "");
  const drawerRef = useRef<HTMLElement>(null);
  const customizeRef = useRef<HTMLButtonElement>(null);
  const draftProducts = order.products.filter(product => product.name.trim() && draftRules[product.id]?.included);
  const predicted = eligiblePackingIds(quantities, draftProducts.map(product => product.id)).length;
  const draftExample = useMemo(() => presentationOpen ? buildPersonRecords(order, draftRules, draftPresentation, quantities)[0] : undefined, [presentationOpen, order, draftRules, draftPresentation, quantities]);
  const updateRule = (id: string, change: Partial<ProductRule>) => setDraftRules(old => ({ ...old, [id]: { ...old[id], ...change } }));
  const closeDrawer = () => { setPresentationOpen(false); customizeRef.current?.focus(); };
  useEffect(() => { if (presentationOpen) drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [presentationOpen]);
  useEffect(() => { localStorage.setItem(presentationKey(businessId, order.orderId), JSON.stringify(rules)); }, [businessId, order.orderId, rules]);
  useEffect(() => { localStorage.setItem(packagePresentationKey(businessId, order.orderId), JSON.stringify(packagePresentation)); }, [businessId, order.orderId, packagePresentation]);
  useEffect(() => { sessionStorage.removeItem(openTaskKey(businessId)); }, [businessId]);
  useEffect(() => {
    const prepare = () => flushSync(() => setPrintReady(true));
    const done = () => { setPrintReady(false); setPrintBusy(false); };
    window.addEventListener("beforeprint", prepare); window.addEventListener("afterprint", done);
    return () => { window.removeEventListener("beforeprint", prepare); window.removeEventListener("afterprint", done); };
  }, []);
  const infoOptions = [{ key: "client", label: "Client / school" }, ...order.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}`, label: field.name })), { key: PACKAGE_FIELD, label: "Package contents" }, { key: "trace_person_position", label: "Label number / total" }, { key: "order", label: "Order number" }];
  const toggleInfo = (field: InfoKey) => {
    if (draftItems.some(item => field === PACKAGE_FIELD ? isPackageField(item.field) : item.field === field)) { setDraftItems(draftItems.filter(item => field === PACKAGE_FIELD ? !isPackageField(item.field) : item.field !== field)); return; }
    const label = fieldLabel(order, field);
    setDraftItems([...draftItems, { id: crypto.randomUUID(), field, label, printedLabel: label, ...freePlacement(draftItems, field), font: 7, showLabel: false, bold: false }]);
  };
  const apply = () => {
    setRules(draftRules); setPackagePresentation(draftPresentation);
    if ((draftPresentation.layoutMode !== packagePresentation.layoutMode || (draftPresentation.layoutMode === "separate" && items.filter(item => isPackageField(item.field)).length !== draftProducts.length)) && items.some(item => isPackageField(item.field))) {
      const others = items.filter(item => !isPackageField(item.field)); const box = packageBounds(items);
      const count = draftPresentation.layoutMode === "separate" ? Math.max(1, draftProducts.length) : 1;
      setItems([...others, ...Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), field: (count === 1 && draftPresentation.layoutMode !== "separate" ? PACKAGE_FIELD : `package_row:${index}`) as InfoKey, label: count === 1 ? "Package contents" : `Package row ${index + 1}`, printedLabel: "", x: box.x, y: box.y + index * box.h / count, w: box.w, h: box.h / count, font: box.font, bold: false, showLabel: false }))]);
    }
    closeDrawer();
  };
  const saveSet = () => {
    const task: SavedTask = { id: activeTaskId || crypto.randomUUID(), name: `Packing batch · ${order.details.clientName} · ${selectedRows.length} labels`, orderId: order.orderId, orderNo: order.details.orderNo, client: order.details.clientName, createdAt: new Date().toISOString(), purpose: "packing", sourceMode: "person", outputMode: "combined", presetId: "pixra-109", items, selectedRows, personPackagePlan: "together", includedProducts: order.products.filter(product => rules[product.id]?.included).map(product => product.id), packageGroupBy: "product", packageCounts: {}, customerUpdates: false, presentationRules: rules, packagePresentation, designerKind: "packing-person-v4" };
    const tasks = JSON.parse(localStorage.getItem(taskKey(businessId)) || "[]") as SavedTask[];
    localStorage.setItem(taskKey(businessId), JSON.stringify([...tasks.filter(item => item.id !== task.id), task])); setActiveTaskId(task.id); setNotice("Label set saved.");
  };
  const saveLayout = () => {
    const layout: SavedLayout = { id: crypto.randomUUID(), name: `Packing · ${order.details.clientName}`, clientType: order.details.clientType, product: "", presetId: "pixra-109", items, purpose: "packing", sourceMode: "person", outputMode: "combined", presentationRules: rules, packagePresentation, designerKind: "packing-person-v4" };
    const layouts = JSON.parse(localStorage.getItem(layoutKey(businessId)) || "[]") as SavedLayout[];
    localStorage.setItem(layoutKey(businessId), JSON.stringify([...layouts, layout])); setNotice("Layout saved.");
  };
  const print = useCallback(async () => {
    setPrintBusy(true); setPrintReady(true);
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.print(); setPrintBusy(false);
  }, []);
  useEffect(() => {
    const request = () => { if (selectedRows.length && items.length) void print(); };
    window.addEventListener("jinam:packing:print", request);
    return () => window.removeEventListener("jinam:packing:print", request);
  }, [selectedRows.length, items.length, print]);
  const renderItem = (item: LabelItem, record: PersonRecord) => {
    const value = fieldValue(order, record, item.field, records.indexOf(record), records.length);
    const text = item.showLabel && value ? `${item.printedLabel}: ${value}` : value;
    return <FitText text={text} preferredPt={item.font} bold={item.bold} widthMm={item.w} heightMm={item.h} align={item.align}/>;
  };
  return <div className="physicalPackingEditor" data-selected-count={selectedRows.length} data-eligible-count={records.length} onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (event.key === "Escape" && infoOpen) { event.preventDefault(); closeInfo(); }
    if (event.key === "Escape") setRecordDetail(null);
    if (event.key === "Escape" && presentationOpen) { event.preventDefault(); closeDrawer(); }
    if ((event.ctrlKey || event.metaKey) && !target.closest("input,textarea,select") && !presentationOpen && !infoOpen) {
      if (event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    }
  }}>
    <header className="physicalHeader"><div>{onBack && <button onClick={onBack}>{backLabel || "← Back"}</button>}<small>ORDER {order.details.orderNo} · PACKING</small><h2>Packing labels for {order.details.clientName}</h2><p>Choose a product combination, then arrange one label for every eligible person.</p></div><div className="physicalActions"><button onClick={saveSet}>Save label set</button><button onClick={saveLayout}>Save layout</button><button className="primary" disabled={!selectedRows.length || !items.length || printBusy} onClick={print}>{printBusy ? "Preparing…" : `Print / PDF (${selectedRows.length})`}</button></div></header>
    {notice && <p role="status">{notice}</p>}
    <section className="physicalInfo physicalPackageSummary"><div><h3>Information on the label</h3><p>{items.map(item => item.label).join(" · ") || "No fields selected"}</p><small>{items.length} fields · choose what appears and how it is named</small></div><button ref={infoButton} aria-label="Customize label information" onClick={() => { setDraftItems(items.map(item => ({ ...item }))); setInfoOpen(true); }}>Customize</button></section>
    <section className="physicalPackageSummary"><div><h3>Package contents</h3><p>{order.products.filter(product => rules[product.id]?.included).map(product => product.name).join(" + ") || "No products selected"} · <b>{records.length} eligible labels</b></p><small>AND rule: a person must have quantity greater than zero for every selected product.</small></div><button ref={customizeRef} onClick={() => { setDraftRules(mergeRules(order, rules)); setDraftPresentation({ ...packagePresentation }); setPresentationOpen(true); }}>Customize</button></section>
    <div className="physicalWorkspace"><main className="physicalMain">
      <div className="physicalPreviewNav"><button disabled={!current || records.indexOf(current) === 0} onClick={() => setPreviewId(records[records.indexOf(current) - 1].id)}>Previous</button><b>{current ? `${records.indexOf(current) + 1} of ${records.length} · ${current.name}` : "No eligible people"}</b><button disabled={!current || records.indexOf(current) >= records.length - 1} onClick={() => setPreviewId(records[records.indexOf(current) + 1].id)}>Next</button></div>
      <PhysicalLabelCanvas items={items} onChange={setItems} onGesture={active => { if (active) gesture.current = itemsRef.current; else { if (gesture.current && JSON.stringify(gesture.current) !== JSON.stringify(itemsRef.current)) { const before = gesture.current; setPast(old => [...old.slice(-99), before]); } gesture.current = null; } }} renderItem={item => current ? renderItem(item, current) : null}>
        <button disabled={!past.length} onClick={undo}>Undo</button><button disabled={!future.length} onClick={redo}>Redo</button>
      </PhysicalLabelCanvas>
      <p className="physicalTextWarning">Highlighted text is very small. Your chosen size is preserved in the PDF.</p>
    </main><aside className="physicalRecords"><h3>{selectedRows.length} labels selected</h3><p>{records.length} eligible people · {order.records.length} source records</p><button disabled={!records.length} onClick={() => setExcluded(selectedRows.length === records.length ? records.map(record => record.id) : [])}>{selectedRows.length === records.length ? "Clear all" : "Select all"}</button><input aria-label="Find label records" placeholder="Find eligible person, class or product" value={query} onChange={event => { setQuery(event.target.value); setScrollTop(0); if (listRef.current) listRef.current.scrollTop = 0; }}/><small>{visibleRecords.length} matching eligible people</small>
      <div className="physicalRecordList" ref={listRef} onScroll={event => { setScrollTop(event.currentTarget.scrollTop); setRecordDetail(null); }}><div style={{ height: visibleRecords.length * 56, position: "relative" }}>{windowRecords.map((record, index) => <div className="physicalRecord" key={record.id} style={{ position: "absolute", top: (start + index) * 56, height: 56 }}><input aria-label={`Select ${record.name}`} type="checkbox" checked={!excluded.includes(record.id)} onChange={event => setExcluded(old => event.target.checked ? old.filter(id => id !== record.id) : [...old, record.id])}/><button onPointerEnter={event => { if (event.pointerType === "touch") return; const box = event.currentTarget.getBoundingClientRect(); setRecordDetail({ record, top: Math.max(8, Math.min(window.innerHeight - 240, box.top)), left: Math.max(8, box.left - 292) }); }} onPointerLeave={() => setRecordDetail(null)} onFocus={event => { const box = event.currentTarget.getBoundingClientRect(); setRecordDetail({ record, top: Math.max(8, Math.min(window.innerHeight - 240, box.top)), left: Math.max(8, box.left - 292) }); }} onBlur={() => setRecordDetail(null)} aria-describedby={recordDetail?.record.id === record.id ? "packing-record-details" : undefined} aria-label={`Preview ${record.name}`} onClick={() => setPreviewId(record.id)} aria-pressed={current?.id === record.id}><b>{record.name}</b><small>{record.group} · {record.packageProducts.join(", ")}</small></button></div>)}</div></div>
      {!records.length && <p>Select a product combination with eligible people.</p>}
    </aside></div>
    {recordDetail && <div id="packing-record-details" role="tooltip" className="physicalRecordPopover" style={{ top: recordDetail.top, left: recordDetail.left }}><b>{recordDetail.record.name}</b><dl>{order.fields.filter(field => field.name.trim()).map(field => <div key={field.id}><dt>{field.name}</dt><dd>{String(recordDetail.record.values[`field:${field.id}`] ?? "—")}</dd></div>)}</dl><strong>Package contents</strong>{recordDetail.record.packageLines.map((line, index) => <p key={index}>{line}</p>)}</div>}
    {infoOpen && <div className="physicalDrawerBackdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeInfo(); }}><section className="physicalDrawer" role="dialog" aria-modal="true" aria-label="Customize label information" ref={infoDrawer} onKeyDown={event => {
      if (event.key !== "Tab") return; const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button,input,select")).filter(node => node.getClientRects().length && !(node as HTMLButtonElement).disabled); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><header><h3>Information on the label</h3><button onClick={closeInfo}>Cancel</button></header><div className="physicalDrawerBody"><p>Choose fields for your label. Drag and stretch them directly on the canvas after applying.</p><div className="physicalFieldChoices">{infoOptions.map(option => {
      const matching = (item: LabelItem) => option.key === PACKAGE_FIELD ? isPackageField(item.field) : item.field === option.key;
      const item = draftItems.find(matching);
      const change = (patch: Partial<LabelItem>) => setDraftItems(draftItems.map(other => matching(other) ? { ...other, ...patch } : other));
      const sample = current ? fieldValue(order, current, option.key as InfoKey, records.indexOf(current), records.length) : "";
      return <div key={option.key} className={item ? "enabled" : ""}><label className="physicalFieldToggle"><input type="checkbox" checked={!!item} onChange={() => toggleInfo(option.key as InfoKey)}/><b>{option.label}</b></label><p className="physicalFieldExample">{sample || "No value in this record"}</p>{item && <div className="physicalFieldSettings"><label><input type="checkbox" checked={item.showLabel} onChange={e => change({ showLabel: e.target.checked })}/>Print field name</label>{item.showLabel && <label>Printed field name<input aria-label={`${option.label} printed caption`} value={item.printedLabel} onChange={e => change({ printedLabel: e.target.value })}/></label>}<label><input type="checkbox" checked={item.bold} onChange={e => change({ bold: e.target.checked })}/>Bold text</label></div>}</div>;
    })}</div></div><footer><div><b>{draftItems.length} fields selected</b><small>Changes apply to every label in this set.</small></div><button onClick={closeInfo}>Cancel</button><button className="primary" onClick={() => { setItems(draftItems); closeInfo(); }}>Apply</button></footer></section></div>}
    {presentationOpen && <div className="physicalDrawerBackdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeDrawer(); }}><section className="physicalDrawer" role="dialog" aria-modal="true" aria-label="Customize package contents" ref={drawerRef} onKeyDown={event => {
      if (event.key !== "Tab") return; const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button,input,select,summary,[tabindex='0']")).filter(node => node.getClientRects().length && !(node as HTMLButtonElement).disabled); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}><header><h3>Package contents</h3><button onClick={closeDrawer}>Cancel</button></header><div className="physicalDrawerBody"><p>A label is eligible only when <b>every checked product</b> has quantity &gt; 0. Pieces and people below are totals for the whole order. The footer shows how many people match your selected combination.</p><div className="physicalProductChoices">{order.products.filter(product => product.name.trim()).map(product => {
      const values = [...quantities.values()].map(row => row[product.id] || 0); const people = values.filter(qty => qty > 0).length; const pieces = values.reduce((a, b) => a + b, 0);
      return <label key={product.id}><input type="checkbox" checked={draftRules[product.id]?.included ?? true} onChange={event => updateRule(product.id, { included: event.target.checked })}/><b>{product.name}</b><span>{pieces} pieces · {people} people</span></label>;
    })}</div><div className="physicalLayoutOptions"><label>Product layout<select value={draftPresentation.layoutMode} onChange={e => setDraftPresentation(old => ({ ...old, layoutMode: e.target.value as PackageLayoutMode }))}><option value="flow">Flow rows</option><option value="inline">Inline</option><option value="separate">Separate movable rows</option></select></label>{draftPresentation.layoutMode === "inline" && <label>Separator<input value={draftPresentation.delimiter} onChange={e => setDraftPresentation(old => ({ ...old, delimiter: e.target.value }))}/></label>}</div>
      <div className="physicalPackageExample"><b>Formatting preview{draftExample ? ` · ${draftExample.name}` : ""}</b><p>{draftExample?.packageText || "No person has every selected product. Choose a different combination to preview it."}</p><small>{draftPresentation.layoutMode === "separate" ? "Each product becomes its own movable text box on the canvas." : "Products share one text box on the canvas."}</small></div>
      <div className="packingPresentationRules">{order.products.filter(product => product.name.trim()).map(product => { const rule = draftRules[product.id] || defaultRule(order, product); const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim()); const specs = product.specifications.filter(item => item.name.trim() && item.role !== "asset"); return <details key={product.id}><summary><b>{product.name} formatting</b><span>{rule.alias || product.name}</span></summary><div className="packingRuleBody"><label><span>Printed product name</span><input value={rule.alias} onChange={event => updateRule(product.id, { alias: event.target.value })}/></label><label><span>Format</span><select value={rule.displayMode} onChange={event => updateRule(product.id, { displayMode: event.target.value as DisplayMode })}><option value="name_details">Name: details</option><option value="name_space_details">Name details</option><option value="details_only">Details only</option><option value="name_only">Name only</option></select></label><label><span>Primary measurement</span><select value={rule.primaryMeasurementId} onChange={event => updateRule(product.id, { primaryMeasurementId: event.target.value })}><option value="">None</option>{measurements.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="packingCheck"><input type="checkbox" checked={rule.showQuantity} onChange={event => updateRule(product.id, { showQuantity: event.target.checked })}/><span>Show quantity</span></label>{measurements.length > 0 && <div className="packingDetailRules"><b>Measurements</b>{measurements.map(measurement => <div className="packingMeasurementRow" key={measurement.id}><input aria-label={`${measurement.name} printed name`} value={rule.measurementAliases[measurement.id] || measurement.name} onChange={event => updateRule(product.id, { measurementAliases: { ...rule.measurementAliases, [measurement.id]: event.target.value } })}/><select aria-label={`${measurement.name} display rule`} value={rule.measurementModes[measurement.id] || "never"} onChange={event => updateRule(product.id, { measurementModes: { ...rule.measurementModes, [measurement.id]: event.target.value as ConditionalMode } })}><option value="never">Never</option><option value="when_present">When present</option><option value="always">Always</option></select></div>)}</div>}{specs.length > 0 && <div className="packingDetailRules"><b>Attributes / specifications</b>{specs.map(spec => <div className="packingMeasurementRow" key={spec.id}><input aria-label={`${spec.name} printed name`} value={rule.specificationAliases[spec.id] || spec.name} onChange={event => updateRule(product.id, { specificationAliases: { ...rule.specificationAliases, [spec.id]: event.target.value } })}/><select aria-label={`${spec.name} display rule`} value={rule.specificationModes[spec.id] || "never"} onChange={event => updateRule(product.id, { specificationModes: { ...rule.specificationModes, [spec.id]: event.target.value as ConditionalMode } })}><option value="never">Never</option><option value="when_present">When present</option><option value="always">Always</option></select></div>)}</div>}</div></details>; })}</div>
      </div><footer><div aria-live="polite"><b>{predicted} eligible labels</b><small>{draftProducts.map(product => product.name).join(" + ") || "Choose at least one product"}</small></div><button onClick={closeDrawer}>Cancel</button><button className="primary" onClick={apply}>Apply</button></footer></section></div>}
    <style media="print">{physicalPageCss(PACKING_OUTPUT)}</style>
    {printReady && <section className="physicalPrintSheet" aria-hidden="true">{selectedRecords.map(record => <div className="physicalPrintedLabel" key={record.id}>{items.map(item => <div className="physicalPrintedItem" key={item.id} style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm` }}>{renderItem(item, record)}</div>)}</div>)}</section>}
  </div>;
}
