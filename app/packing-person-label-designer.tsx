"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { groupRuleMatches, quantityForRecord, workspaceColumns, type ProductPolicy, type SeikoOrder } from "./lib/order-domain";

type ConditionalMode = "never" | "when_present" | "always";
type DisplayMode = "name_details" | "name_space_details" | "details_only" | "name_only";
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
type InfoKey = "client" | "package_contents" | "trace_person_position" | "order" | `field:${string}`;
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
};
type PersonRecord = {
  id: string;
  name: string;
  group: string;
  values: Record<string, string | number>;
  sourceIndex: number;
  packageText: string;
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
  designerKind: "packing-person-v3";
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
  designerKind: "packing-person-v3";
};

const LABEL_W = 50;
const LABEL_H = 25;
const PX_PER_MM = 8;
const PACKAGE_FIELD: InfoKey = "package_contents";
const presentationKey = (businessId: string, orderId: string) => `jinam:${businessId}:packing-person-presentation:${orderId}`;
const taskKey = (businessId: string) => `jinam:${businessId}:labels:tasks-v1`;
const layoutKey = (businessId: string) => `jinam:${businessId}:labels:templates-v1`;
const openTaskKey = (businessId: string) => `jinam:${businessId}:labels:open-task`;
const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== "";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function defaultRule(order: SeikoOrder, product: ProductPolicy): ProductRule {
  const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim());
  const primary = measurements.find(item => /^(length|size)$/i.test(item.name.trim())) || measurements[0];
  const specs = product.specifications.filter(item => item.name.trim() && item.role !== "asset");
  return {
    alias: product.name,
    included: true,
    showQuantity: false,
    displayMode: "name_details",
    primaryMeasurementId: primary?.id || "",
    measurementModes: Object.fromEntries(measurements.map(item => [item.id, "when_present"])),
    measurementAliases: Object.fromEntries(measurements.map(item => [item.id, /^waist$/i.test(item.name.trim()) ? "W" : item.name])),
    specificationModes: Object.fromEntries(specs.map(item => [item.id, "never"])),
    specificationAliases: Object.fromEntries(specs.map(item => [item.id, item.name])),
  };
}

function loadRules(businessId: string, order: SeikoOrder): PresentationRules {
  const defaults = Object.fromEntries(order.products.filter(product => product.name.trim()).map(product => [product.id, defaultRule(order, product)]));
  try {
    const saved = JSON.parse(localStorage.getItem(presentationKey(businessId, order.orderId)) || "{}") as PresentationRules;
    return Object.fromEntries(Object.entries(defaults).map(([id, fallback]) => {
      const current = saved[id];
      return [id, current ? {
        ...fallback,
        ...current,
        measurementModes: { ...fallback.measurementModes, ...(current.measurementModes || {}) },
        measurementAliases: { ...fallback.measurementAliases, ...(current.measurementAliases || {}) },
        specificationModes: { ...fallback.specificationModes, ...(current.specificationModes || {}) },
        specificationAliases: { ...fallback.specificationAliases, ...(current.specificationAliases || {}) },
      } : fallback];
    }));
  } catch { return defaults; }
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

function buildPersonRecords(order: SeikoOrder, rules: PresentationRules): PersonRecord[] {
  const active = order.records.filter(record => !record.held);
  const firstField = order.fields[0];
  const secondField = order.fields[1];
  return active.map((record, sourceIndex) => {
    const lines: string[] = [];
    const packageProducts: string[] = [];
    for (const product of order.products.filter(product => product.name.trim())) {
      const rule = rules[product.id] || defaultRule(order, product);
      if (!rule.included) continue;
      const quantity = resolvedQuantity(order, product, record, sourceIndex);
      if (quantity <= 0) continue;
      packageProducts.push(product.name);
      const text = renderProduct(order, product, rule, record, quantity);
      if (text.trim()) lines.push(text);
    }
    return {
      id: record.recordId,
      name: String(record.values[`field:${firstField?.id}`] || record.personId || record.recordId),
      group: String(record.values[`field:${secondField?.id}`] || ""),
      values: record.values,
      sourceIndex,
      packageText: lines.join("\n"),
      packageProducts,
    };
  });
}

function fieldLabel(order: SeikoOrder, key: InfoKey) {
  if (key === "client") return "Client / school";
  if (key === "package_contents") return "Package contents";
  if (key === "trace_person_position") return "Label number / total";
  if (key === "order") return "Order number";
  const field = order.fields.find(item => `field:${item.id}` === key);
  return field?.name || "Order detail";
}

function fieldValue(order: SeikoOrder, record: PersonRecord, key: InfoKey, index: number, total: number) {
  if (key === "client") return order.details.clientName;
  if (key === "package_contents") return record.packageText;
  if (key === "trace_person_position") return `${index + 1} of ${total}`;
  if (key === "order") return order.details.orderNo;
  return String(record.values[key] ?? "");
}

function defaultItems(order: SeikoOrder): LabelItem[] {
  const name = order.fields[0];
  const group = order.fields[1];
  const items: LabelItem[] = [
    { id: crypto.randomUUID(), field: "client", label: "Client / school", printedLabel: "Client / school", x: 2, y: 1.5, w: 31, h: 3.5, font: 5.5, showLabel: false, bold: false },
  ];
  if (name) items.push({ id: crypto.randomUUID(), field: `field:${name.id}`, label: name.name, printedLabel: name.name, x: 2, y: 5.5, w: 31, h: 6, font: 10, showLabel: false, bold: false });
  if (group) items.push({ id: crypto.randomUUID(), field: `field:${group.id}`, label: group.name, printedLabel: group.name, x: 35, y: 5.5, w: 12, h: 6, font: 9, showLabel: false, bold: false });
  items.push({ id: crypto.randomUUID(), field: PACKAGE_FIELD, label: "Package contents", printedLabel: "Package contents", x: 2, y: 12.5, w: 32, h: 10.5, font: 8, showLabel: false, bold: false });
  items.push({ id: crypto.randomUUID(), field: "trace_person_position", label: "Label number / total", printedLabel: "Label", x: 36, y: 1.5, w: 11, h: 4, font: 5.5, showLabel: false, bold: false });
  return items;
}

function rectanglesOverlap(a: Pick<LabelItem, "x"|"y"|"w"|"h">, b: Pick<LabelItem, "x"|"y"|"w"|"h">, gap = .5) {
  return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
}

function freePlacement(items: LabelItem[], field: InfoKey) {
  const packageBlock = field === PACKAGE_FIELD;
  const w = packageBlock ? 30 : 22;
  const h = packageBlock ? 9 : 4.5;
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
    else if (field === "product_summary" || field === "package_contents" || field.startsWith("product_name:") || field.startsWith("measurement:") || field.startsWith("package_product:") || field.includes("__packing_product_slot_")) mapped = PACKAGE_FIELD;
    else if (field === "trace_person_position") mapped = "trace_person_position";
    else if (field === "order") mapped = "order";
    else if (field.startsWith("field:") && order.fields.some(item => `field:${item.id}` === field)) mapped = field as InfoKey;
    if (!mapped || (mapped === PACKAGE_FIELD && hasPackage)) continue;
    if (mapped === PACKAGE_FIELD) hasPackage = true;
    const x = Number(source.x), y = Number(source.y), w = Number(source.w), h = Number(source.h), font = Number(source.font);
    result.push({
      id: String(source.id || crypto.randomUUID()), field: mapped, label: fieldLabel(order, mapped), printedLabel: String(source.fieldLabel || fieldLabel(order, mapped)),
      x: Number.isFinite(x) ? clamp(x, 0, 49) : 2, y: Number.isFinite(y) ? clamp(y, 0, 24) : 2,
      w: Number.isFinite(w) ? clamp(w, 2, 50) : (mapped === PACKAGE_FIELD ? 30 : 22), h: Number.isFinite(h) ? clamp(h, 2, 25) : (mapped === PACKAGE_FIELD ? 9 : 4.5),
      font: Number.isFinite(font) ? clamp(font, 4, 40) : 8, showLabel: Boolean(source.showLabel), bold: Boolean(source.bold || source.valueBold),
    });
  }
  return result.length ? result : defaultItems(order);
}

function FitText({ text, preferredPt, bold, multiline }: { text: string; preferredPt: number; bold: boolean; multiline?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      const width = element.clientWidth - 2;
      const height = element.clientHeight - 1;
      if (width <= 0 || height <= 0) return;
      const lines = (text || "").split("\n").filter((_, index, arr) => arr.length === 1 || true);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const family = getComputedStyle(element).fontFamily || "Arial";
      let pt = preferredPt;
      const minPt = 4;
      while (pt > minPt) {
        const px = pt * 1.333;
        context.font = `${bold ? 700 : 400} ${px}px ${family}`;
        const widest = Math.max(1, ...lines.map(line => context.measureText(line || " ").width));
        const neededHeight = Math.max(1, lines.length) * px * 1.08;
        if (widest <= width && neededHeight <= height) break;
        pt -= .25;
      }
      element.style.fontSize = `${Math.max(minPt, pt) * 1.333}px`;
      element.dataset.fitReady = "true";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, preferredPt, bold, multiline]);
  return <div ref={ref} className="packingFitText" style={{ whiteSpace: multiline ? "pre-line" : "nowrap", fontWeight: bold ? 700 : 400 }}>{text}</div>;
}

export function PackingPersonLabelDesigner({ businessId, canManageSizes: _canManageSizes, order, onBack, backLabel }: {
  businessId: string;
  canManageSizes: boolean;
  order: SeikoOrder;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [rules, setRules] = useState<PresentationRules>(() => loadRules(businessId, order));
  const records = useMemo(() => buildPersonRecords(order, rules), [order, rules]);
  const [items, setItems] = useState<LabelItem[]>(() => defaultItems(order));
  const [selectedId, setSelectedId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [selectedRows, setSelectedRows] = useState<string[]>(() => records[0] ? [records[0].id] : []);
  const [query, setQuery] = useState("");
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tasks, setTasks] = useState<SavedTask[]>(() => { try { return JSON.parse(localStorage.getItem(taskKey(businessId)) || "[]") as SavedTask[]; } catch { return []; } });
  const [layouts, setLayouts] = useState<SavedLayout[]>(() => { try { return JSON.parse(localStorage.getItem(layoutKey(businessId)) || "[]") as SavedLayout[]; } catch { return []; } });
  const [activeTaskId, setActiveTaskId] = useState("");
  const dragging = useRef<{id:string;startX:number;startY:number;x:number;y:number}|null>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState("");
  const current = records.find(record => record.id === previewId) || records.find(record => selectedRows.includes(record.id)) || records[0];
  const selected = items.find(item => item.id === selectedId);
  const visibleRecords = records.filter(record => `${record.name} ${record.group} ${record.packageProducts.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const infoOptions = useMemo(() => [
    { key: "client" as InfoKey, label: "Client / school" },
    ...order.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}` as InfoKey, label: field.name })),
    { key: PACKAGE_FIELD, label: "Package contents" },
    { key: "trace_person_position" as InfoKey, label: "Label number / total" },
    { key: "order" as InfoKey, label: "Order number" },
  ], [order]);

  useEffect(() => {
    localStorage.setItem(presentationKey(businessId, order.orderId), JSON.stringify(rules));
  }, [businessId, order.orderId, rules]);

  useEffect(() => {
    const taskId = sessionStorage.getItem(openTaskKey(businessId));
    if (!taskId) return;
    const rawTasks = (() => { try { return JSON.parse(localStorage.getItem(taskKey(businessId)) || "[]") as Array<SavedTask & { items?: unknown }>; } catch { return []; } })();
    const task = rawTasks.find(item => item.id === taskId && item.orderId === order.orderId);
    if (task) {
      setItems(migrateItems(order, task.items));
      setSelectedRows(task.selectedRows?.filter(id => records.some(record => record.id === id)) || []);
      setActiveTaskId(task.id);
    }
    sessionStorage.removeItem(openTaskKey(businessId));
  }, [businessId, order, records]);

  const updateRule = (productId: string, change: Partial<ProductRule>) => setRules(currentRules => ({ ...currentRules, [productId]: { ...(currentRules[productId] || defaultRule(order, order.products.find(product => product.id === productId)!)), ...change } }));
  const updateItem = (id: string, change: Partial<LabelItem>) => setItems(currentItems => currentItems.map(item => item.id === id ? { ...item, ...change } : item));
  const toggleInfo = (key: InfoKey) => {
    const existing = items.find(item => item.field === key);
    if (existing) { setItems(currentItems => currentItems.filter(item => item.id !== existing.id)); if (selectedId === existing.id) setSelectedId(""); return; }
    const label = fieldLabel(order, key);
    setItems(currentItems => {
      const position = freePlacement(currentItems, key);
      const next: LabelItem = { id: crypto.randomUUID(), field: key, label, printedLabel: label, ...position, font: key === PACKAGE_FIELD ? 8 : 7, showLabel: false, bold: false };
      return [...currentItems, next];
    });
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>, item: LabelItem) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { id: item.id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y };
    setSelectedId(item.id); setDraggingId(item.id);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragging.current;
    const stage = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!state || !stage || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const item = items.find(candidate => candidate.id === state.id); if (!item) return;
    const dx = (event.clientX - state.startX) * LABEL_W / stage.width;
    const dy = (event.clientY - state.startY) * LABEL_H / stage.height;
    updateItem(item.id, { x: Math.round(clamp(state.x + dx, 0, LABEL_W - item.w) * 4) / 4, y: Math.round(clamp(state.y + dy, 0, LABEL_H - item.h) * 4) / 4 });
  };
  const stop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const trash = trashRef.current?.getBoundingClientRect();
    if (trash && event.clientX >= trash.left && event.clientX <= trash.right && event.clientY >= trash.top && event.clientY <= trash.bottom && dragging.current) {
      const removeId = dragging.current.id;
      setItems(currentItems => currentItems.filter(item => item.id !== removeId));
      setSelectedId("");
    }
    dragging.current = null; setDraggingId("");
  };
  const wheel = (event: React.WheelEvent<HTMLDivElement>, item: LabelItem) => {
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 1 : .25;
    updateItem(item.id, { font: Math.round(clamp(item.font + (event.deltaY < 0 ? step : -step), 4, 40) * 4) / 4 });
  };

  const saveSet = () => {
    const name = `Packing batch · ${order.details.clientName} · ${selectedRows.length} labels`;
    const task: SavedTask = { id: activeTaskId || crypto.randomUUID(), name, orderId: order.orderId, orderNo: order.details.orderNo, client: order.details.clientName, createdAt: new Date().toISOString(), purpose: "packing", sourceMode: "person", outputMode: "combined", presetId: "pixra-109", items, selectedRows, personPackagePlan: "together", includedProducts: order.products.map(product => product.id), packageGroupBy: "product", packageCounts: {}, customerUpdates: false, designerKind: "packing-person-v3" };
    const next = activeTaskId ? tasks.map(existing => existing.id === activeTaskId ? task : existing) : [...tasks, task];
    setTasks(next); setActiveTaskId(task.id); localStorage.setItem(taskKey(businessId), JSON.stringify(next)); setMenuOpen(false);
  };
  const saveLayout = () => {
    const layout: SavedLayout = { id: crypto.randomUUID(), name: `Packing · ${order.details.clientName}`, clientType: order.details.clientType, product: "", presetId: "pixra-109", items, purpose: "packing", sourceMode: "person", outputMode: "combined", designerKind: "packing-person-v3" };
    const next = [...layouts, layout]; setLayouts(next); localStorage.setItem(layoutKey(businessId), JSON.stringify(next)); setMenuOpen(false);
  };
  const print = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event("jinam:labels:print"))));
  };

  const renderItem = (item: LabelItem, record: PersonRecord, index: number) => {
    const value = fieldValue(order, record, item.field, index, records.length);
    const text = item.showLabel && value ? `${item.printedLabel}: ${value}` : value;
    return <FitText text={text} preferredPt={item.font} bold={item.bold} multiline={item.field === PACKAGE_FIELD}/>;
  };

  return <div className="packingWorkflowDesigner labelDesignerPage">
    {onBack && <div className="labelWorkspaceBackRow"><button className="secondary contextBackButton" onClick={onBack}>{backLabel || "← Back"}</button></div>}
    <section className="labelTopbar panel"><div><p className="eyebrow">ORDER {order.details.orderNo} · PACKING</p><h2>Packing labels for {order.details.clientName}</h2><p>Choose information from this order, position it once, and JINAM resolves each person&apos;s package automatically.</p></div><div className="labelHeaderCommandBar"><div className="packingMenuWrap"><button type="button" className="labelHeaderMenuButton" aria-label="Label actions" onClick={() => setMenuOpen(value => !value)}><span/><span/><span/></button>{menuOpen && <div className="labelHeaderMoreMenu packingHeaderMenu"><button className="labelHeaderMenuPrimary" onClick={saveSet}>{activeTaskId ? "Update label set" : "Save label set"}</button><button onClick={saveLayout}>Save layout</button></div>}</div><button className="primary" disabled={!selectedRows.length} onClick={print}>Print</button></div></section>

    <section className="panel packingInformationPanel"><div className="simpleDesignerHead"><div><h3>Information on the label</h3><small>Everything here comes directly from this order. Adding a field places it in the next free area automatically.</small></div></div><div className="packingInfoGrid">{infoOptions.map(option => { const item = items.find(candidate => candidate.field === option.key); return <div className={`fieldChoice ${item ? "chosen" : ""}`} key={option.key}><label><input type="checkbox" checked={!!item} onChange={() => toggleInfo(option.key)}/><span>{option.label}</span></label>{item && <><label className="showName"><input type="checkbox" checked={item.showLabel} onChange={event => updateItem(item.id, { showLabel: event.target.checked })}/> Show field name</label>{item.showLabel && <input aria-label={`Printed name for ${option.label}`} value={item.printedLabel} onChange={event => updateItem(item.id, { printedLabel: event.target.value })}/>}<label className="showName"><input type="checkbox" checked={item.bold} onChange={event => updateItem(item.id, { bold: event.target.checked })}/> Bold</label></>}</div>; })}</div></section>

    <section className="panel packingPresentationPanel"><div className="packingPresentationHead"><div><p className="eyebrow">PACKAGE CONTENTS</p><h3>How products should print</h3><p>Products are included only when they actually apply to that person. Change names, measurements and attributes only when you want a different presentation.</p></div><button type="button" className="secondary" onClick={() => setPresentationOpen(value => !value)}>{presentationOpen ? "Done" : "Customize"}</button></div>{presentationOpen && <div className="packingPresentationRules">{order.products.filter(product => product.name.trim()).map(product => { const rule = rules[product.id] || defaultRule(order, product); const measurements = order.measurements.filter(item => item.appliesTo.includes(product.id) && item.name.trim()); const specs = product.specifications.filter(item => item.name.trim() && item.role !== "asset"); return <details key={product.id}><summary><b>{product.name}</b><span>{rule.included ? `prints as “${rule.alias || product.name}”` : "hidden"}</span></summary><div className="packingRuleBody"><label className="packingCheck"><input type="checkbox" checked={rule.included} onChange={event => updateRule(product.id, { included: event.target.checked })}/><span>Include this product when applicable</span></label><label><span>Printed product name</span><input value={rule.alias} onChange={event => updateRule(product.id, { alias: event.target.value })}/></label><label><span>Format</span><select value={rule.displayMode} onChange={event => updateRule(product.id, { displayMode: event.target.value as DisplayMode })}><option value="name_details">Name: details</option><option value="name_space_details">Name details</option><option value="details_only">Details only</option><option value="name_only">Name only</option></select></label><label><span>Primary measurement</span><select value={rule.primaryMeasurementId} onChange={event => updateRule(product.id, { primaryMeasurementId: event.target.value })}><option value="">None</option>{measurements.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="packingCheck"><input type="checkbox" checked={rule.showQuantity} onChange={event => updateRule(product.id, { showQuantity: event.target.checked })}/><span>Show quantity</span></label>{measurements.length > 0 && <div className="packingDetailRules"><b>Measurements</b>{measurements.map(measurement => <div className="packingMeasurementRow" key={measurement.id}><input aria-label={`${measurement.name} printed name`} value={rule.measurementAliases[measurement.id] || measurement.name} onChange={event => updateRule(product.id, { measurementAliases: { ...rule.measurementAliases, [measurement.id]: event.target.value } })}/><select aria-label={`${measurement.name} display rule`} value={rule.measurementModes[measurement.id] || "never"} onChange={event => updateRule(product.id, { measurementModes: { ...rule.measurementModes, [measurement.id]: event.target.value as ConditionalMode } })}><option value="never">Never</option><option value="when_present">When present</option><option value="always">Always</option></select></div>)}</div>}{specs.length > 0 && <div className="packingDetailRules"><b>Attributes</b>{specs.map(spec => <div className="packingMeasurementRow" key={spec.id}><input aria-label={`${spec.name} printed name`} value={rule.specificationAliases[spec.id] || spec.name} onChange={event => updateRule(product.id, { specificationAliases: { ...rule.specificationAliases, [spec.id]: event.target.value } })}/><select aria-label={`${spec.name} display rule`} value={rule.specificationModes[spec.id] || "never"} onChange={event => updateRule(product.id, { specificationModes: { ...rule.specificationModes, [spec.id]: event.target.value as ConditionalMode } })}><option value="never">Never</option><option value="when_present">When present</option><option value="always">Always</option></select></div>)}</div>}</div></details>; })}</div>}</section>

    <div className="packingDesignerGrid"><main className="labelCanvasPanel panel"><div className="canvasToolbar"><div><b>50 × 25 mm label</b><span>Drag to move · mouse wheel resizes text · longer values shrink automatically inside the area</span></div><label className="labelPreviewSample"><span>Preview sample</span><select value={current?.id || ""} onChange={event => setPreviewId(event.target.value)}>{records.map(record => <option value={record.id} key={record.id}>{record.name}{record.group ? ` · ${record.group}` : ""}</option>)}</select></label></div><div className="labelStageV2"><div className="labelCanvas packingCanvas" style={{ width: `${LABEL_W * PX_PER_MM}px`, height: `${LABEL_H * PX_PER_MM}px` }} onPointerDown={() => setSelectedId("")}><div className="labelGrid"/>{current && items.map(item => <div key={item.id} className={`canvasElement element-field ${selectedId === item.id ? "selected" : ""}`} data-item-id={item.id} style={{ left: `${item.x / LABEL_W * 100}%`, top: `${item.y / LABEL_H * 100}%`, width: `${item.w / LABEL_W * 100}%`, height: `${item.h / LABEL_H * 100}%` }} onPointerDown={event => down(event, item)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onWheel={event => wheel(event, item)}>{renderItem(item, current, records.indexOf(current))}</div>)}{draggingId && <div ref={trashRef} className="packingTrash">× Drop to remove</div>}</div></div>{selected && <div className="packingSelectedControls"><b>{selected.label}</b><label>Font <input type="number" min="4" max="40" step=".25" value={selected.font} onChange={event => updateItem(selected.id, { font: clamp(Number(event.target.value), 4, 40) })}/></label><label>Width <input type="number" min="2" max={LABEL_W} step=".25" value={selected.w} onChange={event => updateItem(selected.id, { w: clamp(Number(event.target.value), 2, LABEL_W - selected.x) })}/></label><label>Height <input type="number" min="2" max={LABEL_H} step=".25" value={selected.h} onChange={event => updateItem(selected.id, { h: clamp(Number(event.target.value), 2, LABEL_H - selected.y) })}/></label></div>}</main>

    <aside className="labelSidebar panel"><div className="panelHead"><div><p className="eyebrow">LABELS TO PRINT</p><h3>{selectedRows.length} {selectedRows.length === 1 ? "label" : "labels"} selected</h3><small>{selectedRows.length} of {records.length} records</small></div><button className="textButton" onClick={() => setSelectedRows(selectedRows.length === records.length ? [] : records.map(record => record.id))}>{selectedRows.length === records.length ? "Clear all" : "Select all"}</button></div><input className="recordSearch" aria-label="Find label records" placeholder="Find person, class/group or product" value={query} onChange={event => setQuery(event.target.value)}/><p className="labelRecordAccuracyHint">Package contents use the saved order quantities, products, measurements and attributes. Products that do not apply are omitted automatically.</p><div className="recordList">{visibleRecords.map(record => <button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} key={record.id} onClick={() => { setPreviewId(record.id); setSelectedRows(currentRows => currentRows.includes(record.id) ? currentRows.filter(id => id !== record.id) : [...currentRows, record.id]); }}><span className="check">{selectedRows.includes(record.id) ? "✓" : ""}</span><span><b>{record.name}</b><small>{[record.group, record.packageProducts.join(", ")].filter(Boolean).join(" · ")}</small></span></button>)}</div></aside></div>

    <section className="printSheet" aria-hidden="true" style={{ gridTemplateColumns: "repeat(2,50mm)" }}>{records.filter(record => selectedRows.includes(record.id)).map((record, recordIndex) => <div className="printedLabel" key={record.id}>{items.map(item => <div className="printedElement element-field" key={item.id} style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm` }}>{renderItem(item, record, records.indexOf(record))}</div>)}</div>)}</section>

    <style>{`
      .packingWorkflowDesigner{padding-bottom:20px}.packingInformationPanel,.packingPresentationPanel{margin:0 28px 14px;padding:14px 16px}.packingInfoGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}.packingInfoGrid .fieldChoice{min-height:44px}.packingPresentationHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.packingPresentationHead h3{margin:2px 0 4px}.packingPresentationHead p:last-child{margin:0;color:var(--muted);font-size:12px;max-width:760px}.packingPresentationRules{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:12px}.packingPresentationRules details{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:10px}.packingPresentationRules summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px}.packingPresentationRules summary span{font-size:11px;color:var(--muted)}.packingRuleBody{display:grid;gap:8px;margin-top:10px}.packingRuleBody label{display:grid;gap:4px;font-size:11px}.packingRuleBody input,.packingRuleBody select{min-height:34px}.packingCheck{display:flex!important;align-items:center;gap:7px!important}.packingDetailRules{display:grid;gap:6px}.packingMeasurementRow{display:grid;grid-template-columns:1fr 135px;gap:6px}.packingDesignerGrid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:12px;margin:0 28px}.packingCanvas{position:relative;overflow:hidden}.packingFitText{width:100%;height:100%;line-height:1.08;overflow:hidden;display:block}.packingTrash{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);z-index:20;padding:7px 14px;border:1px solid #e7b7aa;border-radius:999px;background:#fff5f2;color:#c43822;font-weight:700;font-size:12px;pointer-events:auto}.packingSelectedControls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding-top:8px}.packingSelectedControls label{display:grid;gap:3px;font-size:11px}.packingSelectedControls input{width:82px;min-height:32px}.packingMenuWrap{position:relative}.packingHeaderMenu{display:grid;position:absolute;right:0;top:44px;z-index:50;min-width:180px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px;box-shadow:0 12px 28px #102d4920}.packingHeaderMenu button{border:0;background:transparent;text-align:left;padding:9px;border-radius:7px}.packingHeaderMenu button:hover{background:var(--background)}.packingWorkflowDesigner .canvasElement{overflow:hidden}.packingWorkflowDesigner .canvasElement.selected{outline:1px solid #0582ca}.packingWorkflowDesigner .printedElement{overflow:hidden}.packingWorkflowDesigner .printSheet{grid-template-columns:repeat(2,50mm)}
      @media(max-width:980px){.packingDesignerGrid{grid-template-columns:1fr}.packingWorkflowDesigner .labelSidebar{max-height:420px}.packingInformationPanel,.packingPresentationPanel,.packingDesignerGrid{margin-left:14px;margin-right:14px}}
    `}</style>
  </div>;
}
