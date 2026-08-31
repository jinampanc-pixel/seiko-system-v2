"use client";
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable @typescript-eslint/no-unused-vars -- old cutting-template readers remain during local data migration */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { workspaceColumns, type SeikoOrder } from "./lib/order-domain";
import { garmentScanToken } from "./lib/production-domain";
type Kind = "text" | "field" | "barcode" | "qr" | "sequence";
type OutputMode = "combined" | "code" | "information" | "custom";
type SourceMode = "person_product" | "person" | "group" | "product" | "order";
type LabelPurpose = "production" | "packing" | "inventory";
type PersonPackagePlan = "together" | "sets" | "products";
type GroupCriterion = "order" | "product" | "size" | "specifications" | "measurements";
type RecordRow = {
    id: string;
    name: string;
    group: string;
    product: string;
    size: string;
    qty: string;
    token: string;
    order: string;
    client: string;
    values: Record<string, string>;
};
type Item = {
    id: string;
    kind: Kind;
    x: number;
    y: number;
    w: number;
    h: number;
    font: number;
    value: string;
    field?: string;
    fieldLabel?: string;
    showLabel?: boolean;
    bold?: boolean;
    labelBold?: boolean;
    valueBold?: boolean;
    reset?: "order" | "day" | "print" | "never";
};
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
type Template = {
    id: string;
    name: string;
    clientType: string;
    product: string;
    presetId: string;
    items: Item[];
    purpose?: LabelPurpose;
    customerUpdates?: boolean;
    sourceMode?: SourceMode;
    outputMode?: OutputMode;
    personPackagePlan?: PersonPackagePlan;
    includedProducts?: string[];
    classificationFieldId?: string;
};
type LabelTask = {
    id: string;
    name: string;
    orderId: string;
    orderNo: string;
    client: string;
    createdAt: string;
    purpose: LabelPurpose;
    sourceMode: SourceMode;
    outputMode: OutputMode;
    presetId: string;
    items: Item[];
    selectedRows: string[];
    personPackagePlan: PersonPackagePlan;
    includedProducts: string[];
    packageGroupBy: string;
    packageCounts: Record<string, number>;
    customerUpdates: boolean;
    classificationFieldId?: string;
};
const roll: Preset = { id: "pixra-109", name: "109 mm roll · 2 × 50 × 25", labelW: 50, labelH: 25, rollW: 109, columns: 2, outer: 3, gapX: 3, gapY: 3, locked: true };
const emptyRecord: RecordRow = { id: "", name: "Select a record", group: "", product: "", size: "", qty: "", token: "", order: "", client: "", values: {} };
const initial: Item[] = [{ id: "name", kind: "field", field: "name", value: "Name", x: 3, y: 3, w: 27, h: 5, font: 10, bold: true }, { id: "product", kind: "field", field: "product", value: "Product", x: 3, y: 9, w: 27, h: 4, font: 7 }, { id: "qr", kind: "qr", value: "token", x: 36, y: 3, w: 11, h: 11, font: 7 }];
const key = (businessId: string, suffix: string) => `jinam:${businessId}:labels:${suffix}`;
function stored<T>(storageKey: string, fallback: T): T { if (typeof window === "undefined")
    return fallback; try {
    return JSON.parse(localStorage.getItem(storageKey) || "null") || fallback;
}
catch {
    return fallback;
} }
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
function arrangeLabelItems(items: Item[], preset: Preset) {
    const fields = items.filter(item => item.kind === "field");
    const qrs = items.filter(item => item.kind === "qr");
    const barcodes = items.filter(item => item.kind === "barcode");
    const others = items.filter(item => item.kind !== "field" && item.kind !== "qr" && item.kind !== "barcode");
    const pad = 2;
    const gap = 1;
    const qrSize = qrs.length ? Math.min(10, preset.labelH - pad * 2) : 0;
    const rightReserve = qrSize ? qrSize + 2 : 0;
    const barcodeH = barcodes.length ? Math.min(5.5, Math.max(4, preset.labelH * .22)) : 0;
    const textW = Math.max(12, preset.labelW - pad * 2 - rightReserve);
    const textH = Math.max(6, preset.labelH - pad * 2 - (barcodeH ? barcodeH + gap : 0));
    const columns = fields.length > 6 && textW >= 24 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(fields.length / columns));
    const cellW = textW / columns;
    const rowH = Math.min(4.2, textH / rows);
    const fontLimit = clamp(rowH * 1.55, 4.5, 8);
    const arrangedFields = fields.map((item, index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        return { ...item, x: pad + column * cellW, y: pad + row * rowH, w: Math.max(8, cellW - .8), h: Math.max(2.4, rowH - .35), font: clamp(Math.min(item.font, fontLimit), 4, 8) };
    });
    const arrangedQrs = qrs.map((item, index) => ({ ...item, x: preset.labelW - qrSize - pad, y: pad + index * (qrSize + gap), w: qrSize, h: qrSize }));
    const arrangedBarcodes = barcodes.map((item, index) => ({ ...item, x: pad, y: Math.max(pad, preset.labelH - pad - barcodeH - index * (barcodeH + gap)), w: preset.labelW - pad * 2, h: barcodeH }));
    return [...arrangedFields, ...arrangedQrs, ...arrangedBarcodes, ...others];
}
function arrangeLabelItemsForRow(items: Item[], preset: Preset, row: RecordRow) {
    return arrangeLabelItems(items.filter(item => item.kind !== "field" || hasLabelValue(labelValue(row, item.field))), preset);
}
export function LabelDesigner({ businessId, canManageSizes, order, onBack, initialPurpose = null }: {
    businessId: string;
    canManageSizes: boolean;
    order?: SeikoOrder | null;
    onBack?: () => void;
    initialPurpose?: LabelPurpose | null;
}) {
    const [purpose, setPurpose] = useState<LabelPurpose | null>(order ? initialPurpose : "production");
    const [sourceMode, setSourceModeState] = useState<SourceMode>(initialPurpose === "packing" ? "person" : initialPurpose === "inventory" ? "product" : "person_product");
    const [personPackagePlan, setPersonPackagePlan] = useState<PersonPackagePlan>("together"), [includedProducts, setIncludedProducts] = useState<string[]>(() => order?.products.filter(product => product.name.trim()).map(product => product.id) || []);
    const [packageGroupBy, setPackageGroupBy] = useState(() => order?.fields[1] ? `field:${order.fields[1].id}` : "product"), [packageCounts, setPackageCounts] = useState<Record<string, number>>({});
    const records = useMemo(() => { if (!order)
        return []; const resolved = resolveLabelRows(order, sourceMode, packageGroupBy, packageCounts, personPackagePlan, includedProducts), labels = Object.fromEntries(labelFieldOptions(order).filter(option => !option.key.startsWith("field_name:")).map(option => [`field_name:${option.key}`, option.label.replace(/ \(resolved\)$/, "")])); return resolved.map(row => ({ ...row, values: { ...row.values, ...labels } })); }, [order, sourceMode, packageGroupBy, packageCounts, personPackagePlan, includedProducts]);
    const [selectedRows, setSelectedRows] = useState(() => records[0] ? [records[0].id] : []), [items, setItems] = useState<Item[]>(initial), [selectedId, setSelectedId] = useState("name"), [snap, setSnap] = useState(true), [guides, setGuides] = useState(true);
    const [outputMode, setOutputMode] = useState<OutputMode>("combined");
    const [advanced, setAdvanced] = useState(false), [customerUpdates, setCustomerUpdates] = useState(false);
    const classificationKey = key(businessId, `classification:${order?.orderId || "no-order"}`);
    const [classificationFieldId, setClassificationFieldId] = useState(() => stored<string>(classificationKey, ""));
    const personDetailFields = useMemo(() => order?.fields.filter(field => field.name.trim()) || [], [order]);
    useEffect(() => {
        if (classificationFieldId && !personDetailFields.some(field => field.id === classificationFieldId)) {
            setClassificationFieldId("");
            localStorage.removeItem(classificationKey);
        }
    }, [classificationFieldId, classificationKey, personDetailFields]);
    const chooseClassification = (fieldId: string) => {
        setClassificationFieldId(fieldId);
        if (fieldId) localStorage.setItem(classificationKey, JSON.stringify(fieldId));
        else localStorage.removeItem(classificationKey);
    };
    useEffect(() => { document.documentElement.dataset.labelAdvanced = advanced ? "true" : "false"; return () => { delete document.documentElement.dataset.labelAdvanced; }; }, [advanced]);
    const [presets, setPresets] = useState<Preset[]>(() => [roll, ...stored<Preset[]>(key(businessId, "presets-v1"), [])]), [presetId, setPresetId] = useState(roll.id), [showSizes, setShowSizes] = useState(false), [sizeMenuOpen, setSizeMenuOpen] = useState(false);
    const [templates, setTemplates] = useState<Template[]>(() => stored<Template[]>(key(businessId, "templates-v1"), [])), [templateName, setTemplateName] = useState(""), [activeTemplateId, setActiveTemplateId] = useState(""), [clientType, setClientType] = useState(""), [productScope, setProductScope] = useState("");
    const [labelTasks, setLabelTasks] = useState<LabelTask[]>(() => stored<LabelTask[]>(key(businessId, "tasks-v1"), [])), [taskName, setTaskName] = useState(""), [activeTaskId, setActiveTaskId] = useState(""), [openLibrary, setOpenLibrary] = useState<"layouts" | "tasks" | null>(null);
    const [newSize, setNewSize] = useState({ name: "", labelW: "50", labelH: "25", rollW: "109", columns: "2", outer: "3", gapX: "3", gapY: "3" }), [activeGuides, setActiveGuides] = useState({ x: false, y: false });
    const [recordQuery, setRecordQuery] = useState("");
    const [previewId, setPreviewId] = useState("");
    useEffect(() => { const outside = (event: globalThis.PointerEvent) => { const target = event.target as Element; if (!target?.closest?.(".canvasElement,.labelProperties"))
        setSelectedId(""); }; document.addEventListener("pointerdown", outside, true); return () => document.removeEventListener("pointerdown", outside, true); }, []);
    const dragging = useRef<{
        id: string;
        startX: number;
        startY: number;
        x: number;
        y: number;
    } | null>(null), preset = presets.find(p => p.id === presetId) || roll, selectedRecords = records.filter(record => selectedRows.includes(record.id)), printRecords = selectedRecords, current = records.find(r => r.id === previewId) || printRecords[0] || records.find(r => r.id === selectedRows.at(-1)) || records[0] || emptyRecord, selected = items.find(i => i.id === selectedId), products = useMemo(() => [...new Set(records.map(r => r.product))], [records]);
    const visibleRecords = records.filter(record => `${record.name} ${record.product} ${record.group} ${Object.values(record.values).join(" ")}`.toLowerCase().includes(recordQuery.toLowerCase()));
    const packageGroups = useMemo(() => order && sourceMode === "group" ? packingGroupOptions(order, packageGroupBy) : [], [order, sourceMode, packageGroupBy]);
    const shownRecords = visibleRecords, allShownSelected = shownRecords.length > 0 && shownRecords.every(record => selectedRows.includes(record.id));
    const fieldOptions = useMemo(() => labelFieldOptions(order).map(option => option.key === "product_summary" ? { ...option, label: "Package contents" } : option), [order]);
    // Simple setup is content-driven: every chosen field must remain visible. Older
    // saved batches can contain stale, overlapping or out-of-bounds coordinates,
    // so only the advanced editor is allowed to honour manual coordinates.
    const displayedItems = useMemo(() => advanced ? items : arrangeLabelItems(items, preset), [advanced, items, preset]);
    const previewItems = useMemo(() => advanced ? items : arrangeLabelItemsForRow(items, preset, current), [advanced, items, preset, current]);
    const update = (id: string, change: Partial<Item>) => setItems(all => all.map(i => i.id === id ? { ...i, ...change } : i));
    useEffect(() => {
        const nudgeSelected = (event: globalThis.KeyboardEvent) => {
            if (!advanced || !selectedId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
            event.preventDefault();
            const step = event.shiftKey ? 1 : .25;
            setItems(all => all.map(item => {
                if (item.id !== selectedId) return item;
                if (event.key === "ArrowLeft") return { ...item, x: clamp(item.x - step, 0, Math.max(0, preset.labelW - item.w)) };
                if (event.key === "ArrowRight") return { ...item, x: clamp(item.x + step, 0, Math.max(0, preset.labelW - item.w)) };
                if (event.key === "ArrowUp") return { ...item, y: clamp(item.y - step, 0, Math.max(0, preset.labelH - item.h)) };
                return { ...item, y: clamp(item.y + step, 0, Math.max(0, preset.labelH - item.h)) };
            }));
        };
        document.addEventListener("keydown", nudgeSelected);
        return () => document.removeEventListener("keydown", nudgeSelected);
    }, [advanced, selectedId, preset.labelW, preset.labelH]);
    const resizeElement = useCallback((id: string, direction: 1 | -1, coarse = false) => {
        setItems(all => all.map(item => {
            if (item.id !== id) return item;
            if (["text", "field", "sequence"].includes(item.kind)) {
                const step = coarse ? 1 : .25;
                const font = Math.round(clamp(item.font + direction * step, 4, 40) * 4) / 4;
                return { ...item, font };
            }
            if (item.kind === "qr") {
                const step = coarse ? 1 : .25;
                const maxSize = Math.min(preset.labelW - item.x, preset.labelH - item.y);
                const size = Math.round(clamp(item.w + direction * step, 5, maxSize) * 4) / 4;
                return { ...item, w: size, h: size };
            }
            if (item.kind === "barcode") {
                const widthStep = coarse ? 2 : .5;
                const heightStep = coarse ? 1 : .25;
                const w = Math.round(clamp(item.w + direction * widthStep, 8, preset.labelW - item.x) * 4) / 4;
                const h = Math.round(clamp(item.h + direction * heightStep, 4, preset.labelH - item.y) * 4) / 4;
                return { ...item, w, h };
            }
            return item;
        }));
    }, [preset.labelH, preset.labelW]);
    const sizeReadout = (item: Item) => ["text", "field", "sequence"].includes(item.kind)
        ? item.font.toFixed(2) + " pt"
        : item.w.toFixed(2) + " × " + item.h.toFixed(2) + " mm";
    useEffect(() => {
        const hint = document.querySelector(".canvasToolbar span");
        if (hint) hint.textContent = "Wheel = precise size · Shift + wheel = larger step";
        let remainder = 0;
        const resizeSelected = (event: globalThis.WheelEvent) => {
            const target = (event.target as Element)?.closest?.(".canvasElement.selected") as HTMLElement | null;
            if (!target) return;
            const id = target.dataset.itemId;
            if (!id) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 120 : event.deltaY;
            remainder += delta;
            const threshold = 72;
            const steps = Math.min(4, Math.floor(Math.abs(remainder) / threshold));
            if (!steps) return;
            const direction: 1 | -1 = remainder < 0 ? 1 : -1;
            remainder -= Math.sign(remainder) * steps * threshold;
            for (let index = 0; index < steps; index++) resizeElement(id, direction, event.shiftKey);
        };
        document.addEventListener("wheel", resizeSelected, { capture: true, passive: false });
        return () => document.removeEventListener("wheel", resizeSelected, true);
    }, [resizeElement]);
    const setSourceMode = (next: SourceMode) => { setSourceModeState(next); const nextRecords = order ? resolveLabelRows(order, next, packageGroupBy, packageCounts, personPackagePlan, includedProducts) : []; setSelectedRows(nextRecords[0] ? [nextRecords[0].id] : []); };
    const choosePurpose = (next: LabelPurpose) => { setPurpose(next); setSourceMode(next === "production" ? "person_product" : next === "inventory" ? "product" : "person"); };
    const add = (kind: Kind) => { const id = crypto.randomUUID(); setItems(all => [...all, { id, kind, x: 5, y: 5, w: kind === "barcode" ? 28 : kind === "qr" ? 12 : 24, h: kind === "barcode" ? 8 : kind === "qr" ? 12 : 5, font: 9, value: kind === "text" ? "Text" : kind === "sequence" ? "001" : "token", field: kind === "field" ? "name" : undefined, reset: kind === "sequence" ? "order" : undefined }]); setSelectedId(id); };
    const down = (e: ReactPointerEvent, item: Item) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setSelectedId(item.id); dragging.current = { id: item.id, startX: e.clientX, startY: e.clientY, x: item.x, y: item.y }; };
    const move = (e: ReactPointerEvent) => { const d = dragging.current, box = e.currentTarget.parentElement?.getBoundingClientRect(); if (!d || !box || !e.currentTarget.hasPointerCapture(e.pointerId))
        return; const item = items.find(i => i.id === d.id); if (!item)
        return; let x = d.x + (e.clientX - d.startX) * preset.labelW / box.width, y = d.y + (e.clientY - d.startY) * preset.labelH / box.height; if (snap) {
        x = Math.round(x);
        y = Math.round(y);
    } x = clamp(x, 0, preset.labelW - item.w); y = clamp(y, 0, preset.labelH - item.h); setActiveGuides({ x: guides && Math.abs(x + item.w / 2 - preset.labelW / 2) < .7, y: guides && Math.abs(y + item.h / 2 - preset.labelH / 2) < .7 }); update(item.id, { x, y }); };
    const stop = () => { dragging.current = null; setActiveGuides({ x: false, y: false }); };
    const savePresets = (next: Preset[]) => { setPresets(next); localStorage.setItem(key(businessId, "presets-v1"), JSON.stringify(next.filter(p => !p.locked))); };
    const createSize = () => { const p: Preset = { id: crypto.randomUUID(), name: newSize.name.trim(), labelW: Number(newSize.labelW), labelH: Number(newSize.labelH), rollW: Number(newSize.rollW), columns: Number(newSize.columns), outer: Number(newSize.outer), gapX: Number(newSize.gapX), gapY: Number(newSize.gapY) }; if (!p.name || [p.labelW, p.labelH, p.rollW, p.columns].some(n => !Number.isFinite(n) || n <= 0))
        return; savePresets([...presets, p]); setPresetId(p.id); setShowSizes(false); setNewSize({ name: "", labelW: "50", labelH: "25", rollW: "109", columns: "2", outer: "3", gapX: "3", gapY: "3" }); };
    const saveTemplate = () => { if (!order || !purpose)
        return; const suggested = `${purposeLabel(purpose)} · ${order.details.clientName}`; const name = templateName.trim() || uniqueSavedName(suggested, templates.map(item => item.name)); const t: Template = { id: activeTemplateId || crypto.randomUUID(), name, clientType: clientType.trim(), product: productScope, presetId, items: displayedItems, purpose, customerUpdates: purpose === "production" && customerUpdates, sourceMode, outputMode, personPackagePlan, includedProducts, classificationFieldId }; const next = activeTemplateId ? templates.map(item => item.id === activeTemplateId ? t : item) : [...templates, t]; setTemplates(next); setItems(displayedItems); setTemplateName(name); setActiveTemplateId(t.id); flashSaveNotice(activeTemplateId ? "Layout updated" : "Layout saved"); localStorage.setItem(key(businessId, "templates-v1"), JSON.stringify(next)); };
    const loadTemplate = (template: Template) => { setActiveTemplateId(template.id); setTemplateName(template.name); setClientType(template.clientType); setProductScope(template.product); setItems(template.items.map(item => item.field === "product_summary" ? { ...item, value: item.value === "Product and quantity summary" ? "Package contents" : item.value, fieldLabel: item.fieldLabel === "Product and quantity summary" ? "Package contents" : item.fieldLabel } : item)); setPresetId(template.presetId); if (template.sourceMode)
        setSourceModeState(template.sourceMode); if (template.outputMode)
        setOutputMode(template.outputMode); if (template.personPackagePlan)
        setPersonPackagePlan(template.personPackagePlan); if (template.includedProducts)
        setIncludedProducts(template.includedProducts); setCustomerUpdates(!!template.customerUpdates); chooseClassification(template.classificationFieldId || ""); };
    const saveLabelTask = () => { if (!order || !purpose)
        return; const suggested = `${purposeLabel(purpose)} batch · ${order.details.clientName} · ${selectedRows.length} labels`; const name = taskName.trim() || uniqueSavedName(suggested, labelTasks.filter(item => item.orderId === order.orderId).map(item => item.name)); const task: LabelTask = { id: activeTaskId || crypto.randomUUID(), name, orderId: order.orderId, orderNo: order.details.orderNo, client: order.details.clientName, createdAt: new Date().toISOString(), purpose, sourceMode, outputMode, presetId, items: displayedItems, selectedRows, personPackagePlan, includedProducts, packageGroupBy, packageCounts, customerUpdates, classificationFieldId }; const next = activeTaskId ? labelTasks.map(item => item.id === activeTaskId ? task : item) : [...labelTasks, task]; setLabelTasks(next); setItems(displayedItems); setTaskName(name); setActiveTaskId(task.id); flashSaveNotice(activeTaskId ? "Batch updated" : "Batch saved"); localStorage.setItem(key(businessId, "tasks-v1"), JSON.stringify(next)); };
    const loadLabelTask = (task: LabelTask) => { setActiveTaskId(task.id); setTaskName(task.name); setPurpose(task.purpose); setSourceModeState(task.sourceMode); setOutputMode(task.outputMode); setPresetId(task.presetId); setItems(task.items); setSelectedRows(task.selectedRows); setPersonPackagePlan(task.personPackagePlan); setIncludedProducts(task.includedProducts); setPackageGroupBy(task.packageGroupBy); setPackageCounts(task.packageCounts); setCustomerUpdates(task.customerUpdates); chooseClassification(task.classificationFieldId || ""); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (!order)
        return; const taskId = sessionStorage.getItem(key(businessId, "open-task")); if (!taskId)
        return; const task = labelTasks.find(item => item.id === taskId && item.orderId === order.orderId), timer = setTimeout(() => { if (task)
        loadLabelTask(task); sessionStorage.removeItem(key(businessId, "open-task")); }, 0); return () => clearTimeout(timer); }, [businessId, order]);
    const toggleField = (field: string, label: string) => { const existing = items.find(item => item.kind === "field" && item.field === field); if (existing) {
        setItems(all => all.filter(item => item.id !== existing.id));
        return;
    } setItems(all => [...all, { id: crypto.randomUUID(), kind: "field", field, value: label, fieldLabel: label, showLabel: false, x: 2, y: 2, w: 20, h: 4, font: 7 }]); };
    const print = () => { const s = document.documentElement.style; s.setProperty("--print-roll", `${preset.rollW}mm`); s.setProperty("--print-w", `${preset.labelW}mm`); s.setProperty("--print-h", `${preset.labelH}mm`); s.setProperty("--print-outer", `${preset.outer}mm`); s.setProperty("--print-gap-x", `${preset.gapX}mm`); s.setProperty("--print-gap-y", `${preset.gapY}mm`); window.print(); };
    if (order && !purpose)
        return <div className="page labelPurposePage"><section className="labelPurposeHead panel"><div><p className="eyebrow">ORDER {order.details.orderNo}</p><h2>What will this label identify?</h2><p>Choose its use. You can change the information and size next.</p></div>{onBack && <button className="secondary" onClick={onBack}>← Back to order</button>}</section><section className="purposeGrid"><button onClick={() => choosePurpose("production")}><b>Garment / production</b><span>One identity can follow a garment through work, delivery and payment.</span></button><button onClick={() => choosePurpose("packing")}><b>Packing</b><span>Identify a person’s set, product package or outer order package.</span></button><button onClick={() => choosePurpose("inventory")}><b>Inventory</b><span>Identify stock or batches without creating customer messages.</span></button></section></div>;
    return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div><p className="eyebrow">{order ? `ORDER ${order.details.orderNo} · ${purposeLabel(purpose)}` : "LABEL DESIGNER"}</p><h2>{order ? `${purposeLabel(purpose)} labels for ${order.details.clientName}` : "Design and print labels"}</h2><p>{order ? "The preview and print records come only from the selected orders and products." : "Open an order first. The designer will use only that order's saved people and products."}</p></div><div>{order && onBack && <button className="secondary" onClick={onBack}>← Back to order</button>}<button className="primary" disabled={!printRecords.length} onClick={print}>Print / save PDF · {printRecords.length}</button></div></section>
 {order && purpose && <><nav className="labelSaveBar" aria-label="Label saving"><button className="textButton" onClick={saveTemplate}>{activeTemplateId ? "Update layout" : "Save layout"}</button><button className={openLibrary === "layouts" ? "active" : ""} onClick={() => setOpenLibrary(current => current === "layouts" ? null : "layouts")}>Layouts <span>{templates.filter(template => !template.purpose || template.purpose === purpose).length}</span></button><i /><button className="textButton" disabled={!selectedRows.length} onClick={saveLabelTask}>{activeTaskId ? "Update batch" : "Save batch"}</button><button className={openLibrary === "tasks" ? "active" : ""} onClick={() => setOpenLibrary(current => current === "tasks" ? null : "tasks")}>Batches <span>{labelTasks.filter(task => task.orderId === order.orderId && task.purpose === purpose).length}</span></button></nav>{openLibrary === "layouts" && <section className="compactLibrary panel"><div className="compactLibraryHead"><div><p className="eyebrow">LAYOUT LIBRARY</p><h3>Reusable label layouts</h3></div><button className="iconButton" aria-label="Close layout library" onClick={() => setOpenLibrary(null)}>×</button></div><div className="libraryRows">{templates.filter(template => !template.purpose || template.purpose === purpose).map(template => <article className={activeTemplateId === template.id ? "active" : ""} key={template.id}><input aria-label={`Rename ${template.name}`} value={template.name} onChange={event => { const next = templates.map(item => item.id === template.id ? { ...item, name: event.target.value } : item); setTemplates(next); localStorage.setItem(key(businessId, "templates-v1"), JSON.stringify(next)); if (activeTemplateId === template.id)
        setTemplateName(event.target.value); }}/><small>{purposeLabel(template.purpose || purpose)} · {presets.find(item => item.id === template.presetId)?.name || "Saved size"}</small><button onClick={() => loadTemplate(template)}>Use</button>{canManageSizes && <button className="iconButton" aria-label={`Remove ${template.name} layout`} onClick={() => { const next = templates.filter(item => item.id !== template.id); setTemplates(next); localStorage.setItem(key(businessId, "templates-v1"), JSON.stringify(next)); }}>×</button>}</article>)}{!templates.some(template => !template.purpose || template.purpose === purpose) && <p className="emptyLibrary">No saved layouts yet. Choose the information and appearance, then press Save layout.</p>}</div></section>}{openLibrary === "tasks" && <section className="compactLibrary panel"><div className="compactLibraryHead"><div><p className="eyebrow">BATCH LIBRARY</p><h3>Saved label batches for this order</h3></div><button className="iconButton" aria-label="Close batch library" onClick={() => setOpenLibrary(null)}>×</button></div><div className="libraryRows">{labelTasks.filter(task => task.orderId === order.orderId && task.purpose === purpose).map(task => <article className={activeTaskId === task.id ? "active" : ""} key={task.id}><input aria-label={`Rename ${task.name}`} value={task.name} onChange={event => { const next = labelTasks.map(item => item.id === task.id ? { ...item, name: event.target.value } : item); setLabelTasks(next); localStorage.setItem(key(businessId, "tasks-v1"), JSON.stringify(next)); if (activeTaskId === task.id)
        setTaskName(event.target.value); }}/><small>{task.selectedRows.length} labels · {new Date(task.createdAt).toLocaleString()}</small><button onClick={() => loadLabelTask(task)}>Open</button><button onClick={() => { loadLabelTask(task); setTimeout(() => window.print(), 100); }}>Print</button>{canManageSizes && <button className="iconButton" aria-label={`Remove ${task.name} batch`} onClick={() => { const next = labelTasks.filter(item => item.id !== task.id); setLabelTasks(next); localStorage.setItem(key(businessId, "tasks-v1"), JSON.stringify(next)); }}>×</button>}</article>)}{!labelTasks.some(task => task.orderId === order.orderId && task.purpose === purpose) && <p className="emptyLibrary">No saved batches yet. Select the required labels and press Save batch.</p>}</div></section>}</>}
 {!order && <section className="labelNoOrder panel"><h3>Open an order to design labels</h3><p>Go to Orders, open the required order, then choose <b>Print labels</b>. No sample or unrelated information will appear here.</p></section>}
 <span hidden>Choose elements · Production labels · Packing labels</span>
 {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
 <div className="labelControlStack">
 <section className="simpleDesigner panel"><div className="simpleDesignerHead"><div><h3>Information on the label</h3><small>Choose what people should see. The preview uses the selected real record.</small></div><button className="secondary" onClick={() => setAdvanced(value => !value)}>{advanced ? "Use simple setup" : "Advanced layout"}</button></div><div className="classificationInformation"><b>Classification / group</b>{personDetailFields.length ? <><select aria-label="Classification field for label grouping" value={classificationFieldId} onChange={event => chooseClassification(event.target.value)}><option value="">Choose Person detail…</option>{personDetailFields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select><small>Uses the selected Person-detail value for grouping. This is separate from Label type.</small></> : <small className="classificationEmpty">Add a Person detail in Order setup first</small>}</div><div className="fieldChecklist">{fieldOptions.filter(option => !option.key.startsWith("field_name:")).map(option => { const item = items.find(entry => entry.kind === "field" && entry.field === option.key); return <div className={`fieldChoice ${item ? "chosen" : ""}`} key={option.key}><label><input type="checkbox" checked={!!item} onChange={() => toggleField(option.key, option.label.replace(/ \(resolved\)$/, ""))}/><span>{option.label.replace(/ \(resolved\)$/, "")}</span></label>{item && <><label className="showName"><input type="checkbox" checked={item.showLabel || false} onChange={event => update(item.id, { showLabel: event.target.checked })}/> Show name</label>{item.showLabel && <input aria-label={`Printed name for ${option.label}`} value={item.fieldLabel ?? option.label} onChange={event => update(item.id, { fieldLabel: event.target.value })}/>}<div className="fieldEmphasis">{item.showLabel && <label><input type="checkbox" checked={item.labelBold ?? true} onChange={event => update(item.id, { labelBold: event.target.checked })}/> Name bold</label>}<label><input type="checkbox" checked={item.valueBold || false} onChange={event => update(item.id, { valueBold: event.target.checked })}/> Value bold</label></div></>}</div>; })}</div><p className="purposeBoundary">{purpose === "inventory" ? "Inventory labels never trigger customer communication." : purpose === "packing" && sourceMode === "order" ? "This whole-order label is scannable evidence of the package contents—not a delivery challan." : purpose === "production" && sourceMode === "person_product" ? "This garment identity remains the same through production, delivery and payment." : ""}</p></section>
 <section className="labelSetup panel">
  <label><span>Label represents</span><select value={sourceMode} disabled={!order} onChange={e => setSourceMode(e.target.value as SourceMode)}><option value="person_product">Each physical item</option><option value="person">Each person / package</option><option value="group">Grouped package / group</option><option value="product">Each product / stock group</option><option value="order">Whole order</option></select></label>
  <label><span>Label type</span><select value={outputMode} onChange={e => setOutputMode(e.target.value as OutputMode)}><option value="combined">Code + information</option><option value="code">Code only</option><option value="information">Information only</option><option value="custom">Custom selection</option></select><small className="labelTypeHelp">Choose this only when you want to manually control which information and codes appear.</small></label>
  <div className="managedSizeControl"><span>Label size</span><button type="button" className="managedSizeTrigger" aria-haspopup="listbox" aria-expanded={sizeMenuOpen} onClick={() => setSizeMenuOpen(open => !open)}><span>{preset.name}</span><i aria-hidden="true"/></button>{sizeMenuOpen && <div className="managedSizeMenu" role="listbox" aria-label="Label sizes">{presets.map(option => <div className={`managedSizeOptionRow ${option.id === presetId ? "selected" : ""}`} key={option.id}><button type="button" role="option" aria-selected={option.id === presetId} onClick={() => { setPresetId(option.id); setSizeMenuOpen(false); }}>{option.name}</button>{canManageSizes && !option.locked && <button type="button" className="managedRemove" aria-label={`Remove ${option.name}`} onClick={() => { savePresets(presets.filter(item => item.id !== option.id)); if (presetId === option.id) setPresetId(roll.id); }}>×</button>}</div>)}{canManageSizes && <button type="button" className="managedAdd" onClick={() => { setShowSizes(true); setSizeMenuOpen(false); }}>+ New size</button>}</div>}</div>
  <div className="rollSummary"><b>{preset.labelW} × {preset.labelH} mm · {preset.columns} across</b><small>{preset.outer} + {preset.labelW} + {preset.gapX} + {preset.labelW} + {preset.outer} = {preset.rollW} mm roll</small></div>
 </section>

 </div>
 {purpose === "packing" && sourceMode === "person" && order && <section className="personPackageSetup panel"><div><p className="eyebrow">PERSON PACKAGE PLAN</p><h3>Choose what goes into each person’s package</h3><small>Products come directly from this order. Quantities are read from each person’s saved entries.</small></div><label><span>How should packages be made?</span><select value={personPackagePlan} onChange={event => { setPersonPackagePlan(event.target.value as PersonPackagePlan); setSelectedRows([]); }}><option value="together">One package with all selected products</option><option value="sets">One package for each complete set / pair</option><option value="products">Separate package for each product</option></select></label><fieldset><legend>Products included</legend>{order.products.filter(product => product.name.trim()).map(product => <label key={product.id}><input type="checkbox" checked={includedProducts.includes(product.id)} onChange={event => { setIncludedProducts(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id)); setSelectedRows([]); }}/>{product.name}</label>)}</fieldset><p>{personPackagePlan === "sets" ? "Example: two T-shirts and two track pants create two complete-set packages. Extra unmatched products remain in an additional package." : personPackagePlan === "products" ? "Every selected product gets its own package label for each person." : "All selected products and their saved quantities are listed on one package label per person."}</p></section>}
 {purpose === "packing" && sourceMode === "group" && order && <section className="packageGrouping panel"><div><p className="eyebrow">OUTER PACKAGE GROUPING</p><h3>Create grouped package labels</h3><small>Group completed person packages by a saved person detail or product, then set how many outer packages each group needs.</small></div><label><span>Group packages by</span><select value={packageGroupBy} onChange={event => { setPackageGroupBy(event.target.value); setPackageCounts({}); setSelectedRows([]); }}>{order.fields.filter(field => field.name.trim()).map(field => <option key={field.id} value={`field:${field.id}`}>{field.name}</option>)}<option value="product">Product</option></select></label><div className="packageGroupCounts">{packageGroups.map(group => <label key={group.key}><span>{group.label}</span><input aria-label={`Packages for ${group.label}`} type="number" min="1" max="999" value={packageCounts[group.key] || 1} onChange={event => setPackageCounts(current => ({ ...current, [group.key]: Math.max(1, Math.floor(Number(event.target.value) || 1)) }))}/></label>)}</div></section>}
 {showSizes && canManageSizes && <section className="customSize panel" role="dialog" aria-label="New label size"><div><h3>New label size</h3><p>All measurements are millimetres.</p></div>{Object.entries(newSize).map(([k, v]) => <label key={k}><span>{({ name: "Name", labelW: "Label width", labelH: "Label height", rollW: "Roll width", columns: "Across", outer: "Outer margin", gapX: "Horizontal gap", gapY: "Vertical gap" } as Record<string, string>)[k]}</span><input type={k === "name" ? "text" : "number"} min={k === "name" ? undefined : "0"} value={v} onChange={e => setNewSize(n => ({ ...n, [k]: e.target.value }))}/></label>)}<div className="customSizeActions"><button className="secondary" onClick={() => setShowSizes(false)}>Cancel</button><button className="primary" onClick={createSize}>Save size</button></div></section>}
 <div className="labelDesignerGrid"><aside className="labelSidebar panel">
  <div className="panelHead"><div><p className="eyebrow">LABELS TO PRINT</p><h3>{printRecords.length} {printRecords.length === 1 ? "label" : "labels"} selected</h3><small>{sourceMode === "person_product" ? `${selectedRecords.length} of ${records.length} garments` : `${selectedRecords.length} of ${records.length} records`}</small></div><button className="textButton" disabled={!shownRecords.length} onClick={() => setSelectedRows(allShownSelected ? selectedRows.filter(id => !shownRecords.some(record => record.id === id)) : [...new Set([...selectedRows, ...shownRecords.map(record => record.id)])])}>{allShownSelected ? `Clear all${recordQuery ? " matching" : ""}` : `Select all${recordQuery ? " matching" : ""}`}</button></div>
  <input className="recordSearch" aria-label="Find label records" placeholder="Find person, product, class, group or any order field" value={recordQuery} onChange={event => setRecordQuery(event.target.value)}/>
  <div className="recordList" role="list" aria-label="Available label records">{shownRecords.map(record => <button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} key={record.id} onClick={() => { setPreviewId(record.id); setSelectedRows(currentRows => currentRows.includes(record.id) ? currentRows.filter(id => id !== record.id) : [...currentRows, record.id]); }}><span className="check">{selectedRows.includes(record.id) ? "✓" : ""}</span><span><b>{sourceMode === "person" ? record.name : `${record.name}${record.product ? ` — ${record.product}` : ""}`}</b><small>{sourceMode === "person" ? [record.group, record.values.product_summary, record.qty && `Total ${record.qty}`].filter(Boolean).join(" · ") : [record.group, record.size && `Size ${record.size}`, record.qty && `Qty ${record.qty}`].filter(Boolean).join(" · ") || "Order package"}</small></span></button>)}</div>
  {advanced && <div className="elementTools"><p className="eyebrow">ADD LAYOUT ELEMENT</p>{(["text", "barcode", "qr", "sequence"] as Kind[]).map(kind => <button key={kind} onClick={() => add(kind)}>{({ text: "Fixed text", field: "Saved detail", barcode: "Barcode", qr: "QR code", sequence: "Sequence" } as Record<Kind, string>)[kind]}</button>)}</div>}
 </aside>
 <main className="labelCanvasPanel panel"><div className="canvasToolbar"><div><b>{preset.labelW} × {preset.labelH} mm label</b><span>Select text or code, then use the wheel to resize it</span></div><label className="labelPreviewSample"><span>Preview sample</span><select value={current.id} onChange={event => setPreviewId(event.target.value)}>{records.map(record => <option key={record.id} value={record.id}>{record.name}{record.product ? ` — ${record.product}` : ""}</option>)}</select></label><button className="canvasSizeButton" onClick={() => setShowSizes(value => !value)}>Label sizes</button></div><div className="labelStageV2" onPointerDown={() => setSelectedId("")}><div className="labelCanvas" style={{ width: `${preset.labelW * 8}px`, height: `${preset.labelH * 8}px` }}>{snap && <div className="labelGrid"/>}{activeGuides.x && <i className="guideX"/>}{activeGuides.y && <i className="guideY"/>}{previewItems.map(item => <div key={item.id} data-item-id={item.id} data-font-pt={["text", "field", "sequence"].includes(item.kind) ? item.font : undefined} data-size-readout={sizeReadout(item)} className={`canvasElement element-${item.kind} ${selectedId === item.id ? "selected" : ""}`} style={{ left: `${item.x / preset.labelW * 100}%`, top: `${item.y / preset.labelH * 100}%`, width: `${item.w / preset.labelW * 100}%`, height: `${item.h / preset.labelH * 100}%`, fontSize: `${item.font * 1.333}px`, fontWeight: item.bold ? 700 : 400 }} onPointerDown={e => down(e, item)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>{render(item, current, selectedRows.indexOf(current.id) + 1)}</div>)}</div></div>{selected && <div className="labelPrecisionControls" aria-label="Selected element size controls"><button type="button" onClick={() => resizeElement(selected.id, -1)}>− Shrink</button><output>{sizeReadout(selected)}</output><button type="button" onClick={() => resizeElement(selected.id, 1)}>Stretch +</button><small>Fine step. Hold Shift while using the desktop wheel for the larger step.</small></div>}</main>
 <aside className="labelProperties panel"><div className="panelHead"><div><p className="eyebrow">PROPERTIES</p><h3>{selected ? selected.kind : "Select an element"}</h3></div>{selected && <button className="iconButton" aria-label="Remove selected element" onClick={() => { setItems(a => a.filter(i => i.id !== selected.id)); setSelectedId(""); }}>×</button>}</div>{selected ? <div className="propertyFields">{selected.kind === "text" && <label><span>Text</span><input value={selected.value} onChange={e => update(selected.id, { value: e.target.value })}/></label>}{selected.kind === "field" && <><p className="selectedDetailName">{fieldOptions.find(option => option.key === selected.field)?.label || selected.fieldLabel}</p>{selected.showLabel && <label className="inlineProperty"><input type="checkbox" checked={selected.labelBold ?? true} onChange={e => update(selected.id, { labelBold: e.target.checked })}/> Field name bold</label>}<label className="inlineProperty"><input type="checkbox" checked={selected.valueBold || false} onChange={e => update(selected.id, { valueBold: e.target.checked })}/> Value bold</label></>}{selected.kind === "sequence" && <label><span>Restart numbering</span><select value={selected.reset} onChange={e => update(selected.id, { reset: e.target.value as Item["reset"] })}><option value="order">Each order</option><option value="day">Each day</option><option value="print">Each print run</option><option value="never">Never</option></select></label>}{["text", "field", "sequence"].includes(selected.kind) && <><label><span>Font size</span><input type="number" min="4" max="40" step=".5" value={selected.font} onChange={e => update(selected.id, { font: Number(e.target.value) })}/></label>{selected.kind !== "field" && <label className="inlineProperty"><input type="checkbox" checked={selected.bold || false} onChange={e => update(selected.id, { bold: e.target.checked })}/> Bold</label>}</>}</div> : <p>Click an element to edit it.</p>}<div className="templateBox"><p className="eyebrow">SAVE TEMPLATE</p><input placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)}/><input placeholder="Client type (optional)" value={clientType} onChange={e => setClientType(e.target.value)}/><select value={productScope} onChange={e => setProductScope(e.target.value)}><option value="">Any product</option>{products.map(p => <option key={p}>{p}</option>)}</select><button className="secondary" onClick={saveTemplate}>Save template</button>{templates.map(t => <button className="savedTemplate" key={t.id} onClick={() => { setItems(t.items); setPresetId(t.presetId); }}>{t.name}<small>{[t.clientType, t.product].filter(Boolean).join(" · ") || "Business-wide"}</small></button>)}</div></aside></div>
 <section className="printSheet" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${preset.columns},${preset.labelW}mm)` }}>{printRecords.map((r, index) => { const rowItems = advanced ? items : arrangeLabelItemsForRow(items, preset, r); return <div className="printedLabel" key={r.id}>{rowItems.map(item => <div className={`printedElement element-${item.kind}`} key={item.id} style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm`, fontSize: `${item.font}pt`, fontWeight: item.bold ? 700 : 400 }}>{render(item, r, index + 1)}</div>)}</div>; })}</section></div>;
}
function resolveLabelRows(order: SeikoOrder, source: SourceMode, packageGroupBy = "product", packageCounts: Record<string, number> = {}, personPackagePlan: PersonPackagePlan = "together", includedProducts: string[] = order.products.map(product => product.id)): RecordRow[] { const base = orderLabelRows(order, "person_product"); if (source === "person_product")
    return productionUnitRows(base); if (source === "person")
    return personPackageRows(base, personPackagePlan, includedProducts); if (source === "group")
    return groupedPackageRows(base, order, packageGroupBy, packageCounts); if (source === "product")
    return productSummaryRows(base); return orderPackageRows(base, order); }
function productionUnitRows(rows: RecordRow[]): RecordRow[] { return rows.flatMap(row => { const total = Math.max(0, Number(row.qty) || 0), orderId = row.token.split(":")[0], recordId = row.values.record_id, productId = row.values.product_id; return Array.from({ length: total }, (_, index) => { const unit = index + 1, token = garmentScanToken(orderId, recordId, productId, unit); return { ...row, id: `${orderId}:${recordId}:${productId}:${unit}`, token, name: row.name, group: `Garment ${unit} of ${total}`, qty: "1", values: { ...row.values, token, name: row.name, group: `Garment ${unit} of ${total}`, unit: String(unit), unit_count: String(total), unit_position: `${unit} of ${total}`, resolved_quantity: "1" } }; }); }); }
function cuttingBundleRows(rows: RecordRow[], groupBy: GroupCriterion[]): RecordRow[] { const groups = new Map<string, RecordRow[]>(); for (const row of rows) {
    if ((Number(row.qty) || 0) <= 0)
        continue;
    const productId = row.values.product_id || row.product, parts: [
        string,
        string
    ][] = [];
    if (groupBy.includes("order"))
        parts.push(["order", row.order]);
    if (groupBy.includes("product"))
        parts.push(["product", row.product.trim().toLowerCase()]);
    if (groupBy.includes("size"))
        parts.push(["size", row.size.trim().toLowerCase()]);
    if (groupBy.includes("specifications"))
        parts.push(...Object.entries(row.values).filter(([key, value]) => value && key.startsWith("spec:")).map(([, value]) => ["specification", value.trim().toLowerCase()] as [
            string,
            string
        ]));
    if (groupBy.includes("measurements"))
        parts.push(...Object.entries(row.values).filter(([key, value]) => value && key.startsWith("measurement:") && key.endsWith(`product:${productId}`)).map(([, value]) => ["measurement", value.trim().toLowerCase()] as [
            string,
            string
        ]));
    parts.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const groupKey = JSON.stringify(parts);
    groups.set(groupKey, [...(groups.get(groupKey) || []), row]);
} return [...groups.values()].sort((a, b) => a[0].product.localeCompare(b[0].product) || a[0].size.localeCompare(b[0].size)).map((items, index) => { const first = items[0], qty = String(items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)), people = String(new Set(items.map(item => item.values.record_id).filter(Boolean)).size), criteriaValues = [...new Set(items.flatMap(item => { const productId = item.values.product_id || item.product, values: string[] = []; if (groupBy.includes("order"))
        values.push(item.order); if (groupBy.includes("product"))
        values.push(item.product); if (groupBy.includes("size") && item.size)
        values.push(`Size ${item.size}`); if (groupBy.includes("specifications"))
        values.push(...Object.entries(item.values).filter(([key, value]) => value && key.startsWith("spec:")).map(([, value]) => value)); if (groupBy.includes("measurements"))
        values.push(...Object.entries(item.values).filter(([key, value]) => value && key.startsWith("measurement:") && key.endsWith(`product:${productId}`)).map(([, value]) => value)); return values; }))].join(" · "), displayName = [first.product, first.size && `Size ${first.size}`].filter(Boolean).join(" · "); return { ...first, id: `run:${index + 1}`, name: displayName || `Cutting batch ${index + 1}`, product: "", group: `${people} people`, qty, token: `${first.order}:run:${index + 1}`, values: { ...first.values, name: displayName || `Cutting batch ${index + 1}`, group: `${people} people`, qty, resolved_quantity: qty, people_count: people, bundle_summary: [criteriaValues, `Qty ${qty}`].filter(Boolean).join(" · "), _units: JSON.stringify(items) } }; }); }
function expandProductionRows(groups: RecordRow[]): RecordRow[] { return groups.flatMap(group => { let rows: RecordRow[] = []; try {
    rows = JSON.parse(group.values._units || "[]") as RecordRow[];
}
catch {
    return [];
} return productionUnitRows(rows); }); }
function personPackageRows(rows: RecordRow[], plan: PersonPackagePlan = "together", includedProducts: string[] = []): RecordRow[] { const grouped = new Map<string, RecordRow[]>(); for (const row of rows) {
    if (!includedProducts.includes(row.values.product_id))
        continue;
    const recordId = row.id.split(":")[0];
    grouped.set(recordId, [...(grouped.get(recordId) || []), row]);
} return [...grouped.entries()].flatMap(([recordId, items]) => { const first = items[0], make = (packageItems: RecordRow[], suffix: string, position: string) => { const contents = packageItems.map(item => `${item.product} × ${item.qty}`).join(", "), qty = String(packageItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)), quantityBreakdown = `${contents} · Total ${qty}`; return { ...first, id: `person:${recordId}:${suffix}`, group: position, product: packageItems.map(item => item.product).join(", "), qty, token: `${first.token.split(":").slice(0, 2).join(":")}:package:${suffix}`, values: { ...Object.assign({}, ...packageItems.map(item => item.values)), product: packageItems.map(item => item.product).join(", "), product_summary: contents, qty, resolved_quantity: quantityBreakdown, quantity_total: qty, package_position: position } }; }; if (plan === "products")
    return items.filter(item => (Number(item.qty) || 0) > 0).map(item => make([item], item.values.product_id, `${item.product} package`)); if (plan === "sets") {
    const count = Math.max(0, ...items.map(item => Number(item.qty) || 0));
    return Array.from({ length: count }, (_, index) => { const packageItems = items.filter(item => (Number(item.qty) || 0) > index).map(item => ({ ...item, qty: "1", values: { ...item.values, qty: "1" } })); return make(packageItems, `set-${index + 1}`, `Set ${index + 1} of ${count}`); });
} return [make(items.filter(item => (Number(item.qty) || 0) > 0), "all", "Complete person package")]; }); }
type PackingGroup = {
    key: string;
    label: string;
};
function packingGroupOptions(order: SeikoOrder, groupBy: string): PackingGroup[] { if (groupBy === "product")
    return order.products.filter(product => product.name.trim()).map(product => ({ key: `product:${product.id}`, label: product.name })); const fieldId = groupBy.replace(/^field:/, ""), field = order.fields.find(item => item.id === fieldId); return [...new Set(order.records.filter(record => !record.held).map(record => String(record.values[`field:${fieldId}`] || "").trim()).filter(Boolean))].map(value => ({ key: `field:${fieldId}:${value}`, label: `${field?.name || "Group"}: ${value}` })); }
function groupedPackageRows(rows: RecordRow[], order: SeikoOrder, groupBy: string, packageCounts: Record<string, number>): RecordRow[] { const grouped = new Map<string, RecordRow[]>(), labels = new Map<string, string>(); if (groupBy === "product") {
    for (const row of rows) {
        const key = `product:${row.values.product_id}`;
        grouped.set(key, [...(grouped.get(key) || []), row]);
        labels.set(key, row.product);
    }
}
else {
    const fieldId = groupBy.replace(/^field:/, ""), field = order.fields.find(item => item.id === fieldId);
    for (const row of rows) {
        const value = String(row.values[`field:${fieldId}`] || "").trim() || "Not set", key = `field:${fieldId}:${value}`;
        grouped.set(key, [...(grouped.get(key) || []), row]);
        labels.set(key, `${field?.name || "Group"}: ${value}`);
    }
} return [...grouped.entries()].flatMap(([key, items]) => { const first = items[0], label = labels.get(key) || "Package group", count = Math.max(1, Math.floor(packageCounts[key] || 1)), qty = String(items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)), people = String(new Set(items.map(item => item.values.record_id).filter(Boolean)).size), products = [...new Set(items.map(item => item.product).filter(Boolean))].join(", "); return Array.from({ length: count }, (_, index) => { const position = index + 1; return { ...first, id: `package-group:${order.orderId}:${encodeURIComponent(key)}:${position}`, name: label, group: `Outer package ${position} of ${count}`, product: products, qty, token: `${order.orderId}:package:${encodeURIComponent(key)}:${position}`, values: { ...first.values, name: label, group: `Outer package ${position} of ${count}`, product: products, product_summary: products, qty, resolved_quantity: qty, people_count: people, package_count: String(count), package_position: `${position} of ${count}`, order: order.details.orderNo, client: order.details.clientName } }; }); }); }
function productSummaryRows(rows: RecordRow[]): RecordRow[] { const groups = new Map<string, RecordRow[]>(); for (const row of rows) {
    const groupKey = row.values.product_id || row.product;
    groups.set(groupKey, [...(groups.get(groupKey) || []), row]);
} return [...groups.entries()].map(([productId, items]) => { const first = items[0], qty = String(items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)), people = String(new Set(items.map(item => item.values.record_id).filter(Boolean)).size), sizes = [...new Set(items.map(item => item.size).filter(Boolean))], variations = String(new Set(items.map(item => JSON.stringify(Object.entries(item.values).filter(([key]) => key.startsWith("spec:") || key === "size")))).size), sizeSummary = sizes.length === 1 ? sizes[0] : sizes.length ? `${sizes.length} sizes` : ""; return { ...first, id: `product:${productId}`, name: first.product, group: "Product total", size: sizeSummary, qty, token: `${first.order}:product:${productId}`, values: { ...first.values, name: first.product, group: "Product total", size: sizeSummary, qty, resolved_quantity: qty, people_count: people, variation_count: variations, product_summary: `${first.product} · ${people} people · Qty ${qty}` } }; }); }
function orderPackageRows(rows: RecordRow[], order: SeikoOrder): RecordRow[] { const products = productSummaryRows(rows), qty = String(products.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)), summary = products.map(item => `${item.product} × ${item.qty}`).join(", "), people = String(new Set(rows.map(item => item.values.record_id).filter(Boolean)).size); return [{ id: `order:${order.orderId}`, name: order.details.clientName, group: "Outer package", product: summary, size: "", qty, token: `order:${order.orderId}`, order: order.details.orderNo, client: order.details.clientName, values: { name: order.details.clientName, group: "Outer package", product: summary, product_summary: summary, qty, resolved_quantity: qty, people_count: people, order: order.details.orderNo, client: order.details.clientName, token: `order:${order.orderId}` } }]; }
function hasLabelValue(value: unknown) { return value !== undefined && value !== null && String(value).trim() !== ""; }
function labelValue(row: RecordRow, field = "name") { const direct = row.values[field]; if (field === "resolved_quantity" && row.values.product_summary && !String(direct || "").includes("Total"))
    return `${row.values.product_summary} · Total ${direct || row.qty}`; if (hasLabelValue(direct))
    return direct; if (field.startsWith("measurement:")) {
    const productId = field.split(":product:")[1], candidate = Object.entries(row.values).find(([key, value]) => key.startsWith("measurement:") && hasLabelValue(value) && (!productId || key.endsWith(`product:${productId}`)));
    if (candidate)
        return candidate[1];
} return String((row as unknown as Record<string, string>)[field] || ""); }
function render(item: Item, row: RecordRow, index: number) { if (item.kind === "text")
    return item.value; if (item.kind === "field") {
    const value = labelValue(row, item.field);
    return item.showLabel ? <><span className="fieldName" style={{ fontWeight: (item.labelBold ?? true) ? 700 : 400 }}>{item.fieldLabel || item.value}: </span><span style={{ fontWeight: item.valueBold ? 700 : 400 }}>{value}</span></> : <span style={{ fontWeight: item.valueBold ? 700 : 400 }}>{value}</span>;
} if (item.kind === "sequence")
    return String(index).padStart(3, "0"); if (item.kind === "qr")
    return <span className="fakeQr" aria-label={`QR ${row.token}`}>▦</span>; return <span className="fakeBarcode" aria-label={`Barcode ${row.token}`}><i></i><small>{row.token.slice(-8)}</small></span>; }
function purposeLabel(purpose: LabelPurpose | null) { return purpose === "production" ? "Production" : purpose === "packing" ? "Packing" : purpose === "inventory" ? "Inventory" : "Choose label purpose"; }
function uniqueSavedName(base: string, names: string[]) { if (!names.includes(base))
    return base; let number = 2; while (names.includes(`${base} (${number})`))
    number += 1; return `${base} (${number})`; }
function flashSaveNotice(message: string) { document.querySelector(".labelSaveNotice")?.remove(); const notice = document.createElement("div"); notice.className = "labelSaveNotice"; notice.setAttribute("role", "status"); notice.textContent = `✓ ${message}`; document.body.appendChild(notice); setTimeout(() => notice.remove(), 2200); }
function labelFieldOptions(order?: SeikoOrder | null) { const base = [{ key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" }, { key: "product", label: "Product" }, { key: "product_summary", label: "Product and quantity summary" }, { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" }, { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" }, { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece number / total" }, { key: "order", label: "Order number" }, { key: "client", label: "Client" }, { key: "token", label: "Trace code" }], people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], measurements = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}` }))) || [], specifications = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)` }))) || [], values = [...base, ...people, ...measurements, ...specifications]; return [...values, ...values.map(option => ({ key: `field_name:${option.key}`, label: `Field name · ${option.label.replace(/ \(resolved\)$/, "")}` }))]; }
function normalizedMeasurementValues(order: SeikoOrder, values: Record<string, string | number>) {
    const measurementColumns = workspaceColumns(order).filter(column => column.id.startsWith("measurement:"));
    const rawEntries = Object.entries(values).filter(([key, value]) => key.startsWith("measurement:") && hasLabelValue(value));
    const normalized: Record<string, string> = {};
    const used = new Set<string>();
    for (const column of measurementColumns) {
        const exact = values[column.id];
        if (hasLabelValue(exact)) {
            normalized[column.id] = String(exact);
            used.add(column.id);
        }
    }
    for (const column of measurementColumns.filter(item => !hasLabelValue(normalized[item.id]))) {
        const [measurementPart, productId = ""] = column.id.split(":product:");
        const measurementId = measurementPart.replace(/^measurement:/, "");
        const candidates = rawEntries.filter(([key]) => !used.has(key)).map(([key, value]) => ({
            key,
            value: String(value),
            score: (key.startsWith(`measurement:${measurementId}`) ? 4 : 0) + (productId && key.endsWith(`product:${productId}`) ? 2 : 0),
        })).sort((a, b) => b.score - a.score);
        const candidate = candidates.find(item => item.score > 0) || candidates[0];
        if (candidate) {
            normalized[column.id] = candidate.value;
            used.add(candidate.key);
        }
    }
    return normalized;
}
function orderLabelRows(order: SeikoOrder, source: SourceMode): RecordRow[] {
    const products = order.products.filter(product => product.name.trim());
    const activeRecords = order.records.filter(record => !record.held);
    const common = { name: "", group: "", size: "", qty: "1", order: order.details.orderNo, client: order.details.clientName };
    const commonValues = { order: common.order, client: common.client };
    const workspace = workspaceColumns(order);
    const productKeys = new Map<string, Set<string>>();
    const allProductKeys = new Set<string>();
    for (const product of products) {
        const keys = new Set(workspace.filter(column => column.groupId === `product:${product.id}`).map(column => column.id));
        keys.add(`product:${product.id}:qty`);
        keys.add(`product:${product.id}:qty_override`);
        for (const spec of product.specifications) {
            keys.add(`spec:${spec.id}`);
            keys.add(`spec:${spec.id}:override`);
        }
        productKeys.set(product.id, keys);
        keys.forEach(item => allProductKeys.add(item));
    }
    const productValues = (product: SeikoOrder["products"][number], record?: SeikoOrder["records"][number]) => Object.fromEntries(product.specifications.filter(spec => spec.name.trim()).map(spec => { let value = spec.defaultValue; if (spec.role === "asset")
        value = (spec.attachments || []).map(file => file.name).join(", "); if (record && spec.mode === "per_person")
        value = String(record.values[`spec:${spec.id}`] || ""); if (record && spec.mode === "default_with_exceptions")
        value = String(record.values[`spec:${spec.id}:override`] || spec.defaultValue || ""); if (record && spec.mode === "by_group") {
        const groupValue = String(record.values[`field:${spec.groupFieldId}`] || "");
        value = spec.groupRules.find(rule => rule.match === groupValue)?.value || spec.defaultValue || "";
    } return [`spec:${spec.id}`, value]; })); if (source === "order")
        return [{ ...common, id: `order:${order.orderId}`, product: products.map(product => product.name).join(", "), token: `order:${order.orderId}`, values: { ...commonValues, product: products.map(product => product.name).join(", ") } }]; if (source === "product")
        return products.map(product => { const qty = String(product.quantityMode === "order_total" ? product.orderTotal : product.defaultQuantity); return { ...common, id: `product:${product.id}`, product: product.name, qty, token: `${order.orderId}:product:${product.id}`, values: { ...commonValues, product: product.name, qty, ...productValues(product) } }; }); const firstField = order.fields[0], secondField = order.fields[1]; return activeRecords.flatMap((record, recordIndex) => { const normalizedMeasurements = normalizedMeasurementValues(order, record.values); return (products.length ? products : [undefined]).map(product => { const prefix = product ? `product:${product.id}` : ""; const combinedValues = { ...Object.fromEntries(Object.entries(record.values).map(([key, value]) => [key, String(value)])), ...normalizedMeasurements }; const scopedValues = product ? Object.fromEntries(Object.entries(combinedValues).filter(([key]) => !allProductKeys.has(key) || productKeys.get(product.id)?.has(key))) : combinedValues; const sizeEntry = Object.entries(scopedValues).find(([key, value]) => key.startsWith("measurement:") && hasLabelValue(value) && (!product || key.endsWith(`product:${product.id}`))); const qty = product?.quantityMode === "per_person" ? record.values[`${prefix}:qty`] : product?.quantityMode === "order_total" ? (recordIndex === 0 ? product.orderTotal : 0) : record.values[`${prefix}:qty_override`] || product?.defaultQuantity || 1; const name = String(record.values[`field:${firstField?.id}`] || record.personId), group = String(record.values[`field:${secondField?.id}`] || ""); return { ...common, id: `${record.recordId}:${product?.id || "order"}`, name, group, product: product?.name || "Order", size: String(sizeEntry?.[1] || ""), qty: String(qty), token: `${order.orderId}:${record.recordId}:${product?.id || "order"}`, values: { ...commonValues, ...scopedValues, name, group, product: product?.name || "Order", product_id: product?.id || "", record_id: record.recordId, quantity_mode: product?.quantityMode || "", size: String(sizeEntry?.[1] || ""), qty: String(qty), ...(product ? productValues(product, record) : {}) } }; }); }); }

