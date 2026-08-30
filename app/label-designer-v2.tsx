"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { groupRuleMatches, quantityForRecord, type ProductPolicy, type SeikoOrder } from "./lib/order-domain";
import { garmentScanToken } from "./lib/production-domain";

type LabelPurpose = "production" | "packing" | "inventory";
type Representation = "item" | "person" | "package" | "product_group" | "custom";
type PackagePlan = "person" | "sets" | "products";
type TraceScope = "person" | "product" | "group" | "order" | "print";
type ElementKind = "field" | "text" | "qr" | "barcode";
type FilterRule = { id: string; key: string; value: string };
type TraceConfig = { noun: string; scope: TraceScope; showTotal: boolean };

type Preset = {
  id: string;
  name: string;
  labelW: number;
  labelH: number;
  rollW: number;
  columns: number;
  outer: number;
  gapX: number;
  gapY: number;
  locked?: boolean;
};

type LayoutItem = {
  id: string;
  kind: ElementKind;
  field?: string;
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  showLabel?: boolean;
  fieldLabel?: string;
  labelBold?: boolean;
  valueBold?: boolean;
};

type BaseRow = {
  id: string;
  recordId: string;
  personId: string;
  personName: string;
  personGroup: string;
  productId: string;
  product: string;
  size: string;
  qty: number;
  token: string;
  values: Record<string, string>;
};

type LabelUnit = {
  id: string;
  recordId?: string;
  productId?: string;
  title: string;
  subtitle: string;
  token: string;
  values: Record<string, string>;
  contents: string[];
};

type SavedLayout = {
  id: string;
  name: string;
  presetId: string;
  items: LayoutItem[];
  advanced: boolean;
  updatedAt: string;
};

type SavedLabelSet = {
  id: string;
  name: string;
  orderId: string;
  orderNo: string;
  client: string;
  createdAt: string;
  purpose: LabelPurpose;
  sourceMode: "person_product" | "person" | "product" | "group" | "order";
  personPackagePlan?: "together" | "sets" | "products";
  selectedRows: string[];
  representation?: Representation;
  packagePlan?: PackagePlan;
  groupKeys?: string[];
  filters?: FilterRule[];
  sortKey?: string;
  groupKey?: string;
  presetId?: string;
  items?: LayoutItem[];
  trace?: TraceConfig;
};

type FieldOption = { key: string; label: string; category: "core" | "person" | "product" | "trace" };

type PointerState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

const PIXRA: Preset = { id: "pixra-109", name: "109 mm roll · 2 × 50 × 25", labelW: 50, labelH: 25, rollW: 109, columns: 2, outer: 3, gapX: 3, gapY: 3, locked: true };
const SAFE_MM = 1.5;
const storageKey = (businessId: string, suffix: string) => `jinam:${businessId}:labels:${suffix}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function stored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function uniqueName(base: string, names: string[]) {
  if (!names.includes(base)) return base;
  let index = 2;
  while (names.includes(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function flash(message: string) {
  document.querySelector(".labelV2Toast")?.remove();
  const node = document.createElement("div");
  node.className = "labelV2Toast";
  node.setAttribute("role", "status");
  node.textContent = `✓ ${message}`;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 2200);
}

function firstPersonValue(order: SeikoOrder, values: Record<string, string | number>, fallback: string) {
  const first = order.fields[0];
  return String(first ? values[`field:${first.id}`] ?? fallback : fallback).trim() || fallback;
}

function secondPersonValue(order: SeikoOrder, values: Record<string, string | number>) {
  const second = order.fields[1];
  return String(second ? values[`field:${second.id}`] ?? "" : "").trim();
}

function resolvedSpecification(product: ProductPolicy, spec: ProductPolicy["specifications"][number], record: SeikoOrder["records"][number]) {
  if (spec.role === "asset") return (spec.attachments || []).map(item => item.name).join(", ");
  if (spec.mode === "per_person") return String(record.values[`spec:${spec.id}`] ?? "");
  if (spec.mode === "default_with_exceptions") return String(record.values[`spec:${spec.id}:override`] ?? spec.defaultValue ?? "");
  if (spec.mode === "by_group") {
    const groupValue = String(record.values[`field:${spec.groupFieldId}`] ?? "");
    return spec.groupRules.find(rule => groupRuleMatches(rule.match, groupValue))?.value || spec.defaultValue || "";
  }
  return spec.defaultValue || "";
}

function baseRows(order: SeikoOrder): BaseRow[] {
  const products = order.products.filter(product => product.name.trim());
  const activeRecords = order.records.filter(record => !record.held);
  return activeRecords.flatMap((record, recordIndex) => products.flatMap(product => {
    const qty = quantityForRecord(product, record, recordIndex === 0);
    if (qty <= 0) return [];
    const measurementValues = order.measurements
      .filter(measurement => measurement.appliesTo.includes(product.id) && measurement.name.trim())
      .map(measurement => ({
        key: `measurement:${measurement.id}:product:${product.id}`,
        label: measurement.name,
        value: String(record.values[`measurement:${measurement.id}:product:${product.id}`] ?? "").trim(),
      }));
    const preferredSize = measurementValues.find(item => /size/i.test(item.label) && item.value) || measurementValues.find(item => item.value);
    const personName = firstPersonValue(order, record.values, record.personId);
    const personGroup = secondPersonValue(order, record.values);
    const values: Record<string, string> = {
      order: order.details.orderNo,
      client: order.details.clientName,
      client_type: order.details.clientType,
      delivery_date: order.details.deliveryDate,
      contact_person: order.details.contactPerson,
      contact_number: order.details.contactNumber,
      person_id: record.personId,
      person_name: personName,
      person_group: personGroup,
      product: product.name,
      product_id: product.id,
      size: preferredSize?.value || "",
      quantity: String(qty),
      record_id: record.recordId,
    };
    order.fields.forEach(field => { values[`field:${field.id}`] = String(record.values[`field:${field.id}`] ?? ""); });
    measurementValues.forEach(item => { values[item.key] = item.value; });
    product.specifications.filter(spec => spec.name.trim()).forEach(spec => { values[`spec:${spec.id}`] = resolvedSpecification(product, spec, record); });
    values.product_summary = `${product.name}${values.size ? ` ${values.size}` : ""} ×${qty}`;
    const token = `${order.orderId}:${record.recordId}:${product.id}`;
    return [{ id: `${record.recordId}:${product.id}`, recordId: record.recordId, personId: record.personId, personName, personGroup, productId: product.id, product: product.name, size: values.size, qty, token, values }];
  }));
}

function mergedValues(rows: BaseRow[]) {
  const first = rows[0];
  const values = { ...(first?.values || {}) };
  const keys = new Set(rows.flatMap(row => Object.keys(row.values)));
  keys.forEach(key => {
    const unique = [...new Set(rows.map(row => row.values[key]).filter(Boolean))];
    if (unique.length === 1) values[key] = unique[0];
    else if (unique.length > 1 && (key === "product" || key === "size" || key.startsWith("field:"))) values[key] = unique.join(", ");
  });
  return values;
}

function makePersonUnit(rows: BaseRow[], suffix = "person", subtitle = "Complete person record"): LabelUnit {
  const first = rows[0];
  const contents = rows.map(row => `${row.product}${row.size ? ` ${row.size}` : ""} ×${row.qty}`);
  const values = mergedValues(rows);
  values.product_summary = contents.join(" · ");
  values.quantity = String(rows.reduce((sum, row) => sum + row.qty, 0));
  values.package_position = subtitle;
  return { id: `${suffix}:${first.recordId}`, recordId: first.recordId, title: first.personName, subtitle, token: `package:${first.values.order}:${first.recordId}:${suffix}`, values, contents };
}

function groupedUnits(rows: BaseRow[], keys: string[], prefix: string): LabelUnit[] {
  if (!keys.length) return [];
  const groups = new Map<string, BaseRow[]>();
  rows.forEach(row => {
    const parts = keys.map(key => row.values[key] || "");
    const signature = JSON.stringify(parts);
    groups.set(signature, [...(groups.get(signature) || []), row]);
  });
  return [...groups.values()].map((items, index) => {
    const values = mergedValues(items);
    const total = items.reduce((sum, item) => sum + item.qty, 0);
    const people = new Set(items.map(item => item.recordId)).size;
    const groupLabel = keys.map(key => values[key]).filter(Boolean).join(" · ") || `Group ${index + 1}`;
    values.quantity = String(total);
    values.people_count = String(people);
    values.product_summary = [...new Set(items.map(item => `${item.product}${item.size ? ` ${item.size}` : ""}`))].join(" · ");
    values.group_label = groupLabel;
    return { id: `${prefix}:${index + 1}`, title: groupLabel, subtitle: `${people} ${people === 1 ? "person" : "people"} · ${total} pieces`, token: `${prefix}:${items[0].values.order}:${index + 1}`, values, contents: items.map(item => `${item.personName} · ${item.product}${item.size ? ` ${item.size}` : ""} ×${item.qty}`) };
  });
}

function buildUnits(order: SeikoOrder, representation: Representation, packagePlan: PackagePlan, groupKeys: string[]): LabelUnit[] {
  const rows = baseRows(order);
  if (representation === "item") {
    return rows.flatMap(row => Array.from({ length: row.qty }, (_, index) => {
      const unit = index + 1;
      const token = garmentScanToken(order.orderId, row.recordId, row.productId, unit);
      return {
        id: `item:${row.recordId}:${row.productId}:${unit}`,
        recordId: row.recordId,
        productId: row.productId,
        title: `${row.personName} — ${row.product}`,
        subtitle: [row.personGroup, row.size && `Size ${row.size}`, `Piece ${unit} of ${row.qty}`].filter(Boolean).join(" · "),
        token,
        values: { ...row.values, quantity: "1", trace_code: token, item_position: `${unit} of ${row.qty}` },
        contents: [`${row.product}${row.size ? ` ${row.size}` : ""} ×1`],
      };
    }));
  }
  const byPerson = new Map<string, BaseRow[]>();
  rows.forEach(row => byPerson.set(row.recordId, [...(byPerson.get(row.recordId) || []), row]));
  if (representation === "person") return [...byPerson.values()].map(items => makePersonUnit(items));
  if (representation === "package") {
    return [...byPerson.values()].flatMap(items => {
      const first = items[0];
      if (packagePlan === "products") return items.map(item => {
        const values = { ...item.values, product_summary: `${item.product}${item.size ? ` ${item.size}` : ""} ×${item.qty}`, package_position: `${item.product} package` };
        return { id: `package:${item.recordId}:${item.productId}`, recordId: item.recordId, productId: item.productId, title: first.personName, subtitle: `${item.product} package`, token: `package:${order.orderId}:${item.recordId}:${item.productId}`, values, contents: [values.product_summary] };
      });
      if (packagePlan === "sets") {
        const count = Math.max(...items.map(item => item.qty));
        return Array.from({ length: count }, (_, index) => {
          const included = items.filter(item => item.qty > index).map(item => ({ ...item, qty: 1, values: { ...item.values, quantity: "1" } }));
          const unit = makePersonUnit(included, `set-${index + 1}`, `Set ${index + 1} of ${count}`);
          return { ...unit, id: `package:${first.recordId}:set:${index + 1}`, token: `package:${order.orderId}:${first.recordId}:set:${index + 1}` };
        });
      }
      const unit = makePersonUnit(items, "package", "One package for this person");
      return [{ ...unit, id: `package:${first.recordId}:all`, token: `package:${order.orderId}:${first.recordId}:all` }];
    });
  }
  if (representation === "product_group") return groupedUnits(rows, groupKeys.length ? groupKeys : ["product", "size"], "product-group");
  return groupedUnits(rows, groupKeys, "custom-group");
}

function fieldOptions(order: SeikoOrder): FieldOption[] {
  const options: FieldOption[] = [
    { key: "order", label: "Order number", category: "core" },
    { key: "client", label: "Client name", category: "core" },
    { key: "client_type", label: "Client type", category: "core" },
    { key: "delivery_date", label: "Delivery date", category: "core" },
    { key: "contact_person", label: "Contact person / Attn", category: "core" },
    { key: "contact_number", label: "Phone number", category: "core" },
    { key: "person_id", label: "Person / record ID", category: "person" },
    { key: "person_name", label: "Person / record name", category: "person" },
    ...order.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}`, label: field.name, category: "person" as const })),
    { key: "product", label: "Product", category: "product" },
    { key: "size", label: "Size / resolved measurement", category: "product" },
    { key: "quantity", label: "Quantity", category: "product" },
    { key: "product_summary", label: "Package / product contents", category: "product" },
    { key: "package_position", label: "Package position", category: "product" },
    { key: "people_count", label: "People count", category: "product" },
    { key: "group_label", label: "Group label", category: "product" },
    ...order.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id) && product.name.trim()).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}`, category: "product" as const }))),
    ...order.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name}`, category: "product" as const }))),
    { key: "trace_position", label: "Piece / package number", category: "trace" },
    { key: "trace_code", label: "Trace code", category: "trace" },
  ];
  return options.filter((option, index, all) => all.findIndex(item => item.key === option.key) === index);
}

function groupingOptions(order: SeikoOrder): Array<{ key: string; label: string }> {
  return [
    { key: "product", label: "Product" },
    { key: "size", label: "Size" },
    { key: "person_name", label: "Person / record" },
    ...order.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}`, label: field.name })),
  ];
}

function normalizeLegacyField(field?: string) {
  return ({ name: "person_name", group: "person_group", resolved_quantity: "quantity", unit_position: "trace_position", token: "trace_code" } as Record<string, string>)[field || ""] || field || "person_name";
}

function initialItems(order: SeikoOrder): LayoutItem[] {
  const personKey = order.fields[0] ? `field:${order.fields[0].id}` : "person_name";
  return [
    { id: crypto.randomUUID(), kind: "field", field: personKey, value: "Person", x: 2, y: 2, w: 29, h: 4.5, font: 8.5, valueBold: true },
    { id: crypto.randomUUID(), kind: "field", field: "product", value: "Product", x: 2, y: 7, w: 29, h: 4, font: 7.5 },
    { id: crypto.randomUUID(), kind: "field", field: "size", value: "Size", x: 2, y: 11.5, w: 18, h: 3.5, font: 7 },
    { id: crypto.randomUUID(), kind: "field", field: "trace_position", value: "Piece number", x: 2, y: 15.5, w: 24, h: 3.5, font: 6.5 },
    { id: crypto.randomUUID(), kind: "qr", value: "trace_code", x: 37, y: 2, w: 11, h: 11, font: 7 },
  ];
}

function autoArrange(items: LayoutItem[], preset: Preset): LayoutItem[] {
  const pad = 2;
  const gap = .7;
  const qrs = items.filter(item => item.kind === "qr");
  const barcodes = items.filter(item => item.kind === "barcode");
  const textItems = items.filter(item => item.kind === "field" || item.kind === "text");
  const qrSize = qrs.length ? Math.min(10.5, preset.labelH - pad * 2) : 0;
  const rightReserve = qrSize ? qrSize + 2 : 0;
  const barcodeH = barcodes.length ? 5 : 0;
  const contentW = Math.max(12, preset.labelW - pad * 2 - rightReserve);
  const contentH = Math.max(5, preset.labelH - pad * 2 - (barcodeH ? barcodeH + gap : 0));
  const rows = Math.max(1, textItems.length);
  const rowH = Math.min(4.4, contentH / rows);
  const arrangedText = textItems.map((item, index) => ({ ...item, x: pad, y: pad + index * rowH, w: contentW, h: Math.max(2.7, rowH - .25), font: clamp(item.font || 7, 4.5, Math.max(5, rowH * 1.45)) }));
  const arrangedQr = qrs.map((item, index) => ({ ...item, x: preset.labelW - pad - qrSize, y: pad + index * (qrSize + gap), w: qrSize, h: qrSize }));
  const arrangedBarcode = barcodes.map((item, index) => ({ ...item, x: pad, y: preset.labelH - pad - barcodeH - index * (barcodeH + gap), w: preset.labelW - pad * 2, h: barcodeH }));
  return [...arrangedText, ...arrangedQr, ...arrangedBarcode];
}

function traceText(unit: LabelUnit, pool: LabelUnit[], trace: TraceConfig) {
  const key = trace.scope === "person" ? unit.recordId || unit.values.person_id : trace.scope === "product" ? unit.productId || unit.values.product : trace.scope === "group" ? unit.values.group_label || unit.values.person_group : trace.scope === "order" ? unit.values.order : "__print__";
  const group = pool.filter(item => {
    if (trace.scope === "person") return (item.recordId || item.values.person_id) === key;
    if (trace.scope === "product") return (item.productId || item.values.product) === key;
    if (trace.scope === "group") return (item.values.group_label || item.values.person_group) === key;
    if (trace.scope === "order") return item.values.order === key;
    return true;
  });
  const position = Math.max(1, group.findIndex(item => item.id === unit.id) + 1);
  return trace.showTotal ? `${trace.noun} ${position} of ${Math.max(1, group.length)}` : `${trace.noun} ${position}`;
}

function fieldValue(unit: LabelUnit, field: string, trace: TraceConfig, pool: LabelUnit[]) {
  if (field === "trace_code") return unit.token;
  if (field === "trace_position") return traceText(unit, pool, trace);
  return unit.values[field] || "";
}

function representationSourceMode(value: Representation): SavedLabelSet["sourceMode"] {
  if (value === "item") return "person_product";
  if (value === "person" || value === "package") return "person";
  if (value === "product_group") return "product";
  return "group";
}

function representationFromLegacy(value?: SavedLabelSet["sourceMode"]): Representation {
  if (value === "person_product") return "item";
  if (value === "person") return "package";
  if (value === "product") return "product_group";
  return value === "order" || value === "group" ? "custom" : "item";
}

function representationHelp(value: Representation, count: number) {
  const label = count === 1 ? "label" : "labels";
  if (value === "item") return `${count} ${label} available — one for every individual product piece.`;
  if (value === "person") return `${count} ${label} available — one for every person / record.`;
  if (value === "package") return `${count} ${label} available from the selected packing rule.`;
  if (value === "product_group") return `${count} ${label} available — one for each unique product grouping.`;
  return `${count} ${label} available from your custom grouping.`;
}

function filterableFields(order: SeikoOrder) {
  return [
    { key: "product", label: "Product" },
    { key: "size", label: "Size" },
    { key: "person_name", label: "Person / record" },
    ...order.fields.filter(field => field.name.trim()).map(field => ({ key: `field:${field.id}`, label: field.name })),
  ];
}

export function LabelDesigner({ businessId, canManageSizes, order, onBack, initialPurpose = null }: {
  businessId: string;
  canManageSizes: boolean;
  order?: SeikoOrder | null;
  onBack?: () => void;
  initialPurpose?: LabelPurpose | null;
}) {
  const purpose: LabelPurpose = initialPurpose || "production";
  const actualOrder = order || null;
  const [representation, setRepresentation] = useState<Representation>(purpose === "packing" ? "package" : purpose === "inventory" ? "product_group" : "item");
  const [packagePlan, setPackagePlan] = useState<PackagePlan>("person");
  const [groupKeys, setGroupKeys] = useState<string[]>(purpose === "inventory" ? ["product", "size"] : ["product", "size"]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [groupKey, setGroupKey] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState("");
  const [trace, setTrace] = useState<TraceConfig>({ noun: purpose === "packing" ? "Package" : "Piece", scope: purpose === "packing" ? "person" : "person", showTotal: true });
  const [presets, setPresets] = useState<Preset[]>(() => [PIXRA, ...stored<Preset[]>(storageKey(businessId, "presets-v1"), [])]);
  const [presetId, setPresetId] = useState(PIXRA.id);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [newSize, setNewSize] = useState({ name: "", labelW: "50", labelH: "25", rollW: "109", columns: "2", outer: "3", gapX: "3", gapY: "3" });
  const [items, setItems] = useState<LayoutItem[]>(() => actualOrder ? initialItems(actualOrder) : []);
  const [advanced, setAdvanced] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [layouts, setLayouts] = useState<SavedLayout[]>(() => stored<SavedLayout[]>(storageKey(businessId, "layouts-v2"), []));
  const [layoutName, setLayoutName] = useState("");
  const [activeLayoutId, setActiveLayoutId] = useState("");
  const [labelSets, setLabelSets] = useState<SavedLabelSet[]>(() => stored<SavedLabelSet[]>(storageKey(businessId, "tasks-v1"), []));
  const [setName, setSetName] = useState("");
  const [activeSetId, setActiveSetId] = useState("");
  const [library, setLibrary] = useState<"layouts" | "sets" | null>(null);
  const pointer = useRef<PointerState | null>(null);

  const preset = presets.find(item => item.id === presetId) || PIXRA;
  const options = useMemo(() => actualOrder ? fieldOptions(actualOrder) : [], [actualOrder]);
  const grouping = useMemo(() => actualOrder ? groupingOptions(actualOrder) : [], [actualOrder]);
  const generated = useMemo(() => actualOrder ? buildUnits(actualOrder, representation, packagePlan, groupKeys) : [], [actualOrder, representation, packagePlan, groupKeys]);
  const filterFields = useMemo(() => actualOrder ? filterableFields(actualOrder) : [], [actualOrder]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const next = generated.filter(unit => {
      if (term && !`${unit.title} ${unit.subtitle} ${Object.values(unit.values).join(" ")}`.toLowerCase().includes(term)) return false;
      return filters.every(rule => !rule.value || unit.values[rule.key] === rule.value);
    });
    if (sortKey) next.sort((a, b) => String(a.values[sortKey] || "").localeCompare(String(b.values[sortKey] || ""), undefined, { numeric: true }));
    return next;
  }, [generated, filters, query, sortKey]);
  const selectedForPrint = filtered.filter(unit => selectedIds.includes(unit.id));
  const preview = generated.find(unit => unit.id === previewId) || filtered[0] || generated[0];
  const previewPool = trace.scope === "print" && selectedForPrint.length ? selectedForPrint : generated;
  const selectedItem = items.find(item => item.id === selectedItemId);
  const displayedItems = useMemo(() => advanced ? items : autoArrange(items, preset), [advanced, items, preset]);

  useEffect(() => {
    if (!previewId && generated[0]) setPreviewId(generated[0].id);
    if (previewId && !generated.some(unit => unit.id === previewId)) setPreviewId(generated[0]?.id || "");
  }, [generated, previewId]);

  useEffect(() => {
    if (!actualOrder) return;
    const taskId = sessionStorage.getItem(storageKey(businessId, "open-task"));
    if (!taskId) return;
    const task = labelSets.find(item => item.id === taskId && item.orderId === actualOrder.orderId);
    sessionStorage.removeItem(storageKey(businessId, "open-task"));
    if (!task) return;
    const nextRepresentation = task.representation || representationFromLegacy(task.sourceMode);
    setRepresentation(nextRepresentation);
    setPackagePlan(task.packagePlan || (task.personPackagePlan === "sets" ? "sets" : task.personPackagePlan === "products" ? "products" : "person"));
    setGroupKeys(task.groupKeys || ["product", "size"]);
    setFilters(task.filters || []);
    setSortKey(task.sortKey || "");
    setGroupKey(task.groupKey || "");
    if (task.presetId) setPresetId(task.presetId);
    if (task.items?.length) setItems(task.items.map(item => ({ ...item, field: item.kind === "field" ? normalizeLegacyField(item.field) : item.field })));
    if (task.trace) setTrace(task.trace);
    setSelectedIds(task.selectedRows || []);
    setSetName(task.name);
    setActiveSetId(task.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualOrder?.orderId, businessId]);

  if (!actualOrder) return <div className="page labelDesignerPage labelDesignerV2"><section className="panel labelV2Empty"><h2>Open an order to create labels</h2><p>Labels use the people, products, quantities and measurements saved on a real order.</p>{onBack && <button className="secondary" onClick={onBack}>Back</button>}</section></div>;

  const changeRepresentation = (value: Representation) => {
    setRepresentation(value);
    setSelectedIds([]);
    setPreviewId("");
    if (value === "product_group" && !groupKeys.length) setGroupKeys(["product", "size"]);
    if (value === "custom" && !groupKeys.length) setGroupKeys(["person_name"]);
  };

  const toggleField = (key: string, label: string) => {
    const current = items.find(item => item.kind === "field" && item.field === key);
    if (current) {
      setItems(all => all.filter(item => item.id !== current.id));
      if (selectedItemId === current.id) setSelectedItemId("");
      return;
    }
    const next: LayoutItem = { id: crypto.randomUUID(), kind: "field", field: key, value: label, fieldLabel: label, x: 2, y: 2, w: 28, h: 4, font: 7 };
    setItems(all => advanced ? autoArrange([...all, next], preset) : [...all, next]);
  };

  const toggleCode = (kind: "qr" | "barcode") => {
    const current = items.find(item => item.kind === kind);
    if (current) setItems(all => all.filter(item => item.id !== current.id));
    else {
      const next: LayoutItem = { id: crypto.randomUUID(), kind, value: "trace_code", x: kind === "qr" ? 37 : 2, y: kind === "qr" ? 2 : 18, w: kind === "qr" ? 11 : 32, h: kind === "qr" ? 11 : 5, font: 7 };
      setItems(all => advanced ? autoArrange([...all, next], preset) : [...all, next]);
    }
  };

  const updateItem = (id: string, patch: Partial<LayoutItem>) => setItems(all => all.map(item => item.id === id ? { ...item, ...patch } : item));

  const beginPointer = (event: ReactPointerEvent<HTMLDivElement>, item: LayoutItem, mode: "move" | "resize") => {
    if (!advanced) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedItemId(item.id);
    pointer.current = { id: item.id, mode, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y, w: item.w, h: item.h };
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointer.current;
    const canvas = event.currentTarget.closest(".labelCanvas") as HTMLElement | null;
    if (!active || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - active.startX) * preset.labelW / rect.width;
    const dy = (event.clientY - active.startY) * preset.labelH / rect.height;
    if (active.mode === "move") {
      const current = items.find(item => item.id === active.id);
      if (!current) return;
      updateItem(active.id, { x: clamp(active.x + dx, SAFE_MM, preset.labelW - SAFE_MM - current.w), y: clamp(active.y + dy, SAFE_MM, preset.labelH - SAFE_MM - current.h) });
    } else {
      updateItem(active.id, { w: clamp(active.w + dx, 4, preset.labelW - SAFE_MM - active.x), h: clamp(active.h + dy, 2.5, preset.labelH - SAFE_MM - active.y) });
    }
  };

  const endPointer = () => { pointer.current = null; };

  const saveLayout = () => {
    const name = layoutName.trim() || uniqueName(`${preset.labelW}×${preset.labelH} label`, layouts.map(item => item.name));
    const layout: SavedLayout = { id: activeLayoutId || crypto.randomUUID(), name, presetId, items: displayedItems, advanced, updatedAt: new Date().toISOString() };
    const next = activeLayoutId ? layouts.map(item => item.id === activeLayoutId ? layout : item) : [...layouts, layout];
    setLayouts(next); setActiveLayoutId(layout.id); setLayoutName(name); setItems(displayedItems);
    localStorage.setItem(storageKey(businessId, "layouts-v2"), JSON.stringify(next));
    flash(activeLayoutId ? "Layout updated" : "Layout saved");
  };

  const loadLayout = (layout: SavedLayout) => {
    setActiveLayoutId(layout.id); setLayoutName(layout.name); setPresetId(layout.presetId); setItems(layout.items); setAdvanced(layout.advanced); setLibrary(null);
  };

  const saveLabelSet = () => {
    const name = setName.trim() || uniqueName(`${purpose[0].toUpperCase()}${purpose.slice(1)} · ${actualOrder.details.clientName}`, labelSets.filter(item => item.orderId === actualOrder.orderId).map(item => item.name));
    const saved: SavedLabelSet = {
      id: activeSetId || crypto.randomUUID(), name, orderId: actualOrder.orderId, orderNo: actualOrder.details.orderNo, client: actualOrder.details.clientName,
      createdAt: new Date().toISOString(), purpose, sourceMode: representationSourceMode(representation), personPackagePlan: packagePlan === "sets" ? "sets" : packagePlan === "products" ? "products" : "together",
      selectedRows: selectedForPrint.map(item => item.id), representation, packagePlan, groupKeys, filters, sortKey, groupKey, presetId, items: displayedItems, trace,
    };
    const next = activeSetId ? labelSets.map(item => item.id === activeSetId ? saved : item) : [...labelSets, saved];
    setLabelSets(next); setActiveSetId(saved.id); setSetName(name); setItems(displayedItems);
    localStorage.setItem(storageKey(businessId, "tasks-v1"), JSON.stringify(next));
    flash(activeSetId ? "Label set updated" : "Label set saved");
  };

  const loadLabelSet = (saved: SavedLabelSet) => {
    setActiveSetId(saved.id); setSetName(saved.name); setRepresentation(saved.representation || representationFromLegacy(saved.sourceMode));
    setPackagePlan(saved.packagePlan || (saved.personPackagePlan === "sets" ? "sets" : saved.personPackagePlan === "products" ? "products" : "person"));
    setGroupKeys(saved.groupKeys || ["product", "size"]); setFilters(saved.filters || []); setSortKey(saved.sortKey || ""); setGroupKey(saved.groupKey || "");
    if (saved.presetId) setPresetId(saved.presetId); if (saved.items?.length) setItems(saved.items.map(item => ({ ...item, field: item.kind === "field" ? normalizeLegacyField(item.field) : item.field })));
    if (saved.trace) setTrace(saved.trace); setSelectedIds(saved.selectedRows || []); setLibrary(null);
  };

  const createSize = () => {
    const next: Preset = { id: crypto.randomUUID(), name: newSize.name.trim(), labelW: Number(newSize.labelW), labelH: Number(newSize.labelH), rollW: Number(newSize.rollW), columns: Math.max(1, Math.floor(Number(newSize.columns))), outer: Number(newSize.outer), gapX: Number(newSize.gapX), gapY: Number(newSize.gapY) };
    if (!next.name || [next.labelW, next.labelH, next.rollW, next.columns].some(value => !Number.isFinite(value) || value <= 0)) return;
    const custom = [...presets.filter(item => item.locked), ...presets.filter(item => !item.locked), next];
    setPresets(custom); setPresetId(next.id); setSizeOpen(false);
    localStorage.setItem(storageKey(businessId, "presets-v1"), JSON.stringify(custom.filter(item => !item.locked)));
  };

  const filterValueOptions = (key: string) => [...new Set(generated.map(unit => unit.values[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const groupedList = groupKey ? filtered.reduce<Array<{ name: string; units: LabelUnit[] }>>((result, unit) => {
    const name = unit.values[groupKey] || "Other";
    const found = result.find(group => group.name === name);
    if (found) found.units.push(unit); else result.push({ name, units: [unit] });
    return result;
  }, []) : [{ name: "", units: filtered }];
  const allFilteredSelected = filtered.length > 0 && filtered.every(unit => selectedIds.includes(unit.id));

  const renderItem = (item: LayoutItem, unit: LabelUnit, pool: LabelUnit[]) => {
    if (item.kind === "qr") return <span className="fakeQr" aria-label={`QR ${unit.token}`}>▦</span>;
    if (item.kind === "barcode") return <span className="fakeBarcode"><i/><small>{unit.token}</small></span>;
    if (item.kind === "text") return item.value;
    const key = item.field || "person_name";
    const value = fieldValue(unit, key, trace, pool);
    if (!value) return null;
    const label = item.fieldLabel || options.find(option => option.key === key)?.label || item.value;
    return <>{item.showLabel && <span className="fieldName" style={{ fontWeight: item.labelBold === false ? 400 : 700 }}>{label}: </span>}<span style={{ fontWeight: item.valueBold ? 700 : 400 }}>{value}</span></>;
  };

  return <div className="page labelDesignerPage labelDesignerV2">
    <section className="labelTopbar panel labelV2Topbar"><div><p className="eyebrow">ORDER {actualOrder.details.orderNo} · {purpose.toUpperCase()}</p><h2>Labels for {actualOrder.details.clientName}</h2><p>Create, preview, filter, save and print labels from this order without changing the order itself.</p></div><div className="labelV2TopActions">{onBack && <button className="secondary" onClick={onBack}>← Back to labels</button>}<button className="primary" disabled={!selectedForPrint.length} onClick={() => window.print()}>Print · {selectedForPrint.length}</button></div></section>

    <nav className="labelV2LibraryBar" aria-label="Label libraries"><button className="secondary" onClick={saveLayout}>{activeLayoutId ? "Update layout" : "Save layout"}</button><button onClick={() => setLibrary(library === "layouts" ? null : "layouts")}>Layouts <span>{layouts.length}</span></button><i/><button className="primary labelSetSave" onClick={saveLabelSet}>{activeSetId ? "Update label set" : "Save label set"}</button><button onClick={() => setLibrary(library === "sets" ? null : "sets")}>Label sets <span>{labelSets.filter(item => item.orderId === actualOrder.orderId).length}</span></button></nav>

    {library === "layouts" && <section className="panel labelV2Library"><div className="labelV2LibraryHead"><div><p className="eyebrow">LAYOUT LIBRARY</p><h3>Reusable physical layouts</h3><p>Layouts control label size, content placement and typography.</p></div><button className="iconButton" onClick={() => setLibrary(null)} aria-label="Close layout library">×</button></div><div className="labelV2LibraryRows">{layouts.map(layout => <article key={layout.id}><div><b>{layout.name}</b><small>{presets.find(item => item.id === layout.presetId)?.name || "Saved size"}</small></div><button onClick={() => loadLayout(layout)}>Use</button>{canManageSizes && <button className="iconButton" aria-label={`Delete ${layout.name}`} onClick={() => { const next = layouts.filter(item => item.id !== layout.id); setLayouts(next); localStorage.setItem(storageKey(businessId, "layouts-v2"), JSON.stringify(next)); }}>×</button>}</article>)}{!layouts.length && <p>No saved layouts yet.</p>}</div></section>}
    {library === "sets" && <section className="panel labelV2Library"><div className="labelV2LibraryHead"><div><p className="eyebrow">LABEL SET LIBRARY</p><h3>Saved label jobs for this order</h3><p>Label sets remember what one label represents, filtering, numbering and layout.</p></div><button className="iconButton" onClick={() => setLibrary(null)} aria-label="Close label set library">×</button></div><div className="labelV2LibraryRows">{labelSets.filter(item => item.orderId === actualOrder.orderId).map(saved => <article key={saved.id}><div><b>{saved.name}</b><small>{saved.selectedRows.length} selected · {saved.purpose}</small></div><button onClick={() => loadLabelSet(saved)}>Open</button><button onClick={() => { loadLabelSet(saved); window.setTimeout(() => window.print(), 80); }}>Print</button></article>)}{!labelSets.some(item => item.orderId === actualOrder.orderId) && <p>No saved label sets yet.</p>}</div></section>}

    <div className="labelV2SetupGrid">
      <section className="panel labelSetup labelV2Setup"><div className="labelV2SectionHead"><div><p className="eyebrow">1 · LABEL OUTPUT</p><h3>What gets one label?</h3></div></div><label className="labelV2MainSelect"><span>Create one label for</span><select value={representation} onChange={event => changeRepresentation(event.target.value as Representation)}><option value="item">Each item</option><option value="person">Each person / record</option><option value="package">Each package</option><option value="product_group">Each product group</option><option value="custom">Custom grouping</option></select><small>{representationHelp(representation, generated.length)}</small></label>
        {representation === "package" && <div className="labelV2Conditional"><label><span>How should items be packed?</span><select value={packagePlan} onChange={event => { setPackagePlan(event.target.value as PackagePlan); setSelectedIds([]); }}><option value="person">One package per person</option><option value="sets">Complete sets / pairs</option><option value="products">Same products together</option></select></label><p>{packagePlan === "sets" ? "Example: 2 shirts + 2 pants becomes two complete-set packages." : packagePlan === "products" ? "Example: both shirts together and both pants together." : "All products for one person are listed on one package label."}</p></div>}
        {(representation === "product_group" || representation === "custom") && <fieldset className="labelV2Grouping"><legend>{representation === "product_group" ? "Group product labels by" : "One label for each unique combination of"}</legend>{grouping.map(option => <label key={option.key}><input type="checkbox" checked={groupKeys.includes(option.key)} onChange={event => { setGroupKeys(current => event.target.checked ? [...current, option.key] : current.filter(key => key !== option.key)); setSelectedIds([]); }}/>{option.label}</label>)}{!groupKeys.length && <small>Choose at least one grouping field.</small>}</fieldset>}
      </section>

      <section className="panel labelV2Trace"><div className="labelV2SectionHead"><div><p className="eyebrow">2 · TRACE & NUMBERING</p><h3>Number labels in a useful context</h3></div></div><div className="labelV2TraceGrid"><label><span>Call each unit</span><input value={trace.noun} onChange={event => setTrace(current => ({ ...current, noun: event.target.value || "Piece" }))} placeholder="Piece, Pair, Package…"/></label><label><span>Number within</span><select value={trace.scope} onChange={event => setTrace(current => ({ ...current, scope: event.target.value as TraceScope }))}><option value="person">Each person</option><option value="product">Each product</option><option value="group">Each class / group</option><option value="order">Entire order</option><option value="print">This print selection</option></select></label><label className="labelV2Check"><input type="checkbox" checked={trace.showTotal} onChange={event => setTrace(current => ({ ...current, showTotal: event.target.checked }))}/> Show “of total”</label></div><p className="labelV2TraceExample">Example: {preview ? traceText(preview, previewPool, trace) : `${trace.noun} 1 of 1`}</p></section>
    </div>

    <section className="panel labelV2Information"><div className="labelV2SectionHead"><div><p className="eyebrow">3 · LABEL INFORMATION</p><h3>Choose what appears on the label</h3><p>Core information is order/client data. Person and product fields come from this order.</p></div></div><div className="labelV2Categories">{(["core", "person", "product", "trace"] as const).map(category => <div key={category}><b>{({ core: "Core information", person: "Person details", product: "Product details", trace: "Trace & codes" } as const)[category]}</b><div>{options.filter(option => option.category === category).map(option => { const item = items.find(candidate => candidate.kind === "field" && candidate.field === option.key); return <article className={item ? "selected" : ""} key={option.key}><label><input type="checkbox" checked={!!item} onChange={() => toggleField(option.key, option.label)}/><span>{option.label}</span></label>{item && <button className="labelV2FieldRemove" aria-label={`Remove ${option.label}`} onClick={() => toggleField(option.key, option.label)}>×</button>}</article>; })}{category === "trace" && <><article className={items.some(item => item.kind === "qr") ? "selected" : ""}><label><input type="checkbox" checked={items.some(item => item.kind === "qr")} onChange={() => toggleCode("qr")}/><span>QR code</span></label></article><article className={items.some(item => item.kind === "barcode") ? "selected" : ""}><label><input type="checkbox" checked={items.some(item => item.kind === "barcode")} onChange={() => toggleCode("barcode")}/><span>Barcode</span></label></article></>}</div></div>)}</div></section>

    <section className="panel labelV2FilterPanel"><div className="labelV2SectionHead"><div><p className="eyebrow">4 · FIND, FILTER & GROUP</p><h3>Choose exactly which labels to print</h3></div><button className="secondary" onClick={() => setFilters(current => [...current, { id: crypto.randomUUID(), key: filterFields[0]?.key || "product", value: "" }])}>+ Filter</button></div><div className="labelV2FilterTop"><input type="search" placeholder="Search person, product, class, size…" value={query} onChange={event => setQuery(event.target.value)}/><label><span>Sort by</span><select value={sortKey} onChange={event => setSortKey(event.target.value)}><option value="">Order sequence</option>{filterFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label><span>Group list by</span><select value={groupKey} onChange={event => setGroupKey(event.target.value)}><option value="">No visual grouping</option>{filterFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label></div>{filters.length > 0 && <div className="labelV2FilterRules">{filters.map(rule => <div key={rule.id}><select value={rule.key} onChange={event => setFilters(current => current.map(item => item.id === rule.id ? { ...item, key: event.target.value, value: "" } : item))}>{filterFields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select><select value={rule.value} onChange={event => setFilters(current => current.map(item => item.id === rule.id ? { ...item, value: event.target.value } : item))}><option value="">Any value</option>{filterValueOptions(rule.key).map(value => <option key={value}>{value}</option>)}</select><button className="iconButton" aria-label="Remove filter" onClick={() => setFilters(current => current.filter(item => item.id !== rule.id))}>×</button></div>)}</div>}<div className="labelV2FilterSummary"><b>{filtered.length} matching labels</b><span>{selectedForPrint.length} selected for print</span><button className="textButton" disabled={!filtered.length} onClick={() => setSelectedIds(allFilteredSelected ? selectedIds.filter(id => !filtered.some(unit => unit.id === id)) : [...new Set([...selectedIds, ...filtered.map(unit => unit.id)])])}>{allFilteredSelected ? "Clear filtered selection" : `Select all ${filtered.length} matching`}</button></div></section>

    <div className="labelV2WorkGrid">
      <aside className="panel labelV2Records"><div className="labelV2RecordsHead"><div><p className="eyebrow">LABELS TO PRINT</p><h3>{selectedForPrint.length} selected</h3></div></div><div className="labelV2RecordScroll">{groupedList.map(group => <div className="labelV2RecordGroup" key={group.name || "all"}>{group.name && <h4>{group.name}</h4>}{group.units.map(unit => <article className={selectedIds.includes(unit.id) ? "selected" : ""} key={unit.id}><button className="labelV2RecordPick" onClick={() => setSelectedIds(current => current.includes(unit.id) ? current.filter(id => id !== unit.id) : [...current, unit.id])}><span className="check">{selectedIds.includes(unit.id) ? "✓" : ""}</span><span><b>{unit.title}</b><small>{unit.subtitle}</small></span></button>{unit.contents.length > 1 && <details><summary>Package details</summary><ul>{unit.contents.map((line, index) => <li key={`${unit.id}:${index}`}>{line}</li>)}</ul></details>}</article>)}</div>)}{!filtered.length && <p className="labelV2NoRecords">No labels match the current filters.</p>}</div></aside>

      <main className="panel labelCanvasPanel labelV2CanvasPanel"><div className="canvasToolbar"><div><p className="eyebrow">PREVIEW</p><b>{preset.labelW} × {preset.labelH} mm label</b><span>{advanced ? "Drag elements, use the resize handle, or enter exact measurements." : "Automatic layout keeps selected information inside the printable area."}</span></div><div className="labelV2CanvasActions"><button className="secondary" onClick={() => { if (!advanced) setItems(autoArrange(items, preset)); setAdvanced(value => !value); }}>{advanced ? "Use automatic layout" : "Edit layout"}</button><button className="secondary canvasSizeButton" onClick={() => setSizeOpen(value => !value)}>Label size</button></div></div><label className="labelV2PreviewPicker"><span>Preview sample</span><select value={preview?.id || ""} onChange={event => setPreviewId(event.target.value)}>{generated.map(unit => <option key={unit.id} value={unit.id}>{unit.title} · {unit.subtitle}</option>)}</select><small>This sample changes only the preview, never the print selection.</small></label><div className="labelV2Stage"><div className="labelCanvas" role="application" aria-label="Label layout preview" style={{ width: `${preset.labelW * 8}px`, height: `${preset.labelH * 8}px` }} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerDown={() => setSelectedItemId("")}><div className="labelV2SafeArea"/>{preview && displayedItems.map(item => <div key={item.id} data-item-id={item.id} tabIndex={advanced ? 0 : -1} className={`canvasElement element-${item.kind} ${selectedItemId === item.id ? "selected" : ""}`} style={{ left: `${item.x / preset.labelW * 100}%`, top: `${item.y / preset.labelH * 100}%`, width: `${item.w / preset.labelW * 100}%`, height: `${item.h / preset.labelH * 100}%`, fontSize: `${item.font * 1.333}px` }} onPointerDown={event => beginPointer(event, item, "move")} onClick={event => { event.stopPropagation(); setSelectedItemId(item.id); }} onKeyDown={event => { if (!advanced || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 1 : .25; updateItem(item.id, { x: clamp(item.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), SAFE_MM, preset.labelW - SAFE_MM - item.w), y: clamp(item.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), SAFE_MM, preset.labelH - SAFE_MM - item.h) }); }}>{renderItem(item, preview, previewPool)}{advanced && selectedItemId === item.id && <span className="labelV2ResizeHandle" role="button" aria-label="Resize element" onPointerDown={event => beginPointer(event as unknown as ReactPointerEvent<HTMLDivElement>, item, "resize")}/>}</div>)}</div></div>
        <div className="managedSizeControl" hidden><span>Label size</span><button type="button" className="managedSizeTrigger"><span>{preset.name}</span></button></div>
      </main>

      <aside className="panel labelV2Properties"><div className="labelV2SectionHead"><div><p className="eyebrow">LAYOUT</p><h3>{advanced ? selectedItem ? "Selected element" : "Select an element" : "Automatic layout"}</h3></div></div>{advanced && selectedItem ? <div className="labelV2PropertyGrid"><label><span>X (mm)</span><input type="number" step=".25" value={selectedItem.x} onChange={event => updateItem(selectedItem.id, { x: clamp(Number(event.target.value), SAFE_MM, preset.labelW - SAFE_MM - selectedItem.w) })}/></label><label><span>Y (mm)</span><input type="number" step=".25" value={selectedItem.y} onChange={event => updateItem(selectedItem.id, { y: clamp(Number(event.target.value), SAFE_MM, preset.labelH - SAFE_MM - selectedItem.h) })}/></label><label><span>Width (mm)</span><input type="number" step=".25" value={selectedItem.w} onChange={event => updateItem(selectedItem.id, { w: clamp(Number(event.target.value), 4, preset.labelW - SAFE_MM - selectedItem.x) })}/></label><label><span>Height (mm)</span><input type="number" step=".25" value={selectedItem.h} onChange={event => updateItem(selectedItem.id, { h: clamp(Number(event.target.value), 2.5, preset.labelH - SAFE_MM - selectedItem.y) })}/></label>{selectedItem.kind === "field" && <><label><span>Font (pt)</span><input type="number" min="4" max="24" step=".5" value={selectedItem.font} onChange={event => updateItem(selectedItem.id, { font: clamp(Number(event.target.value), 4, 24) })}/></label><label className="labelV2Check"><input type="checkbox" checked={selectedItem.showLabel || false} onChange={event => updateItem(selectedItem.id, { showLabel: event.target.checked })}/> Show field name</label><label className="labelV2Check"><input type="checkbox" checked={selectedItem.valueBold || false} onChange={event => updateItem(selectedItem.id, { valueBold: event.target.checked })}/> Bold value</label></>}<button className="dangerText" onClick={() => { setItems(current => current.filter(item => item.id !== selectedItem.id)); setSelectedItemId(""); }}>Remove element</button></div> : <p className="labelV2PropertyHelp">{advanced ? "Click an element in the preview. Arrow keys nudge by 0.25 mm; Shift + Arrow nudges by 1 mm." : "Automatic layout is recommended for day-to-day use. Choose Edit layout only when exact manual placement is needed."}</p>}<div className="labelV2Naming"><label><span>Layout name</span><input placeholder="e.g. SEIKO 50×25 Production" value={layoutName} onChange={event => setLayoutName(event.target.value)}/></label><label><span>Label set name</span><input placeholder="e.g. School production labels" value={setName} onChange={event => setSetName(event.target.value)}/></label></div></aside>
    </div>

    {sizeOpen && <section className="panel labelV2SizeEditor" role="dialog" aria-label="Label size settings"><div className="labelV2LibraryHead"><div><p className="eyebrow">LABEL SIZE</p><h3>{preset.name}</h3></div><button className="iconButton" onClick={() => setSizeOpen(false)}>×</button></div><div className="labelV2PresetList">{presets.map(item => <button className={item.id === presetId ? "active" : ""} key={item.id} onClick={() => { setPresetId(item.id); setSizeOpen(false); }}>{item.name}</button>)}</div>{canManageSizes && <div className="labelV2NewSize"><input placeholder="Preset name" value={newSize.name} onChange={event => setNewSize(current => ({ ...current, name: event.target.value }))}/>{(["labelW", "labelH", "rollW", "columns", "outer", "gapX", "gapY"] as const).map(key => <label key={key}><span>{({ labelW: "Label width", labelH: "Label height", rollW: "Roll width", columns: "Across", outer: "Outer margin", gapX: "Horizontal gap", gapY: "Vertical gap" } as const)[key]}</span><input type="number" min="0" step=".5" value={newSize[key]} onChange={event => setNewSize(current => ({ ...current, [key]: event.target.value }))}/></label>)}<button className="primary" onClick={createSize}>Save size</button></div>}</section>}

    <section className="printSheet" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${preset.columns},${preset.labelW}mm)` }}>{selectedForPrint.map(unit => <div className="printedLabel" key={unit.id}>{displayedItems.map(item => <div className={`printedElement element-${item.kind}`} key={item.id} style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm`, fontSize: `${item.font}pt` }}>{renderItem(item, unit, selectedForPrint)}</div>)}</div>)}</section>
  </div>;
}
