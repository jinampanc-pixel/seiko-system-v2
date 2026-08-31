from pathlib import Path


def read(path): return Path(path).read_text(encoding='utf-8')
def write(path, text): Path(path).write_text(text, encoding='utf-8')
def replace_once(text, old, new): return text.replace(old, new, 1) if old in text else text
def replace_between(text, start, end, replacement):
    a = text.find(start)
    if a < 0: return text
    b = text.find(end, a + len(start))
    if b < 0: return text
    return text[:a] + replacement + text[b:]
def require(text, marker, label):
    if marker not in text: raise RuntimeError(f'missing final marker: {label}')

# Workspace menu + shortcuts.
p='app/orders.tsx'; t=read(p)
t=replace_once(t,'<button type="button" className="secondary workspaceLabelsButton" onClick={onOpenLabelBatches}>Labels</button><button type="button" className="primary workspaceQuickSave" onClick={()=>onSave(false)}>Save</button>','<button type="button" className="primary workspaceQuickSave" onClick={()=>onSave(false)}>Save</button>')
t=replace_once(t,'<div className="orderActionMenu"><button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button>','<div className="orderActionMenu"><button onClick={()=>{setOrderMenuOpen(false);onOpenLabelBatches();}}>Labels</button><button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button>')
require(t,'onOpenLabelBatches();}}>Labels</button>','workspace Labels menu')
write(p,t)

p='app/workspace-shortcuts.tsx'; t=read(p)
t=replace_once(t,'page.querySelector<HTMLButtonElement>(".workspaceLabelsButton")?.click();','clickMenuAction(page, "Labels");')
require(t,'clickMenuAction(page, "Labels")','Ctrl/Cmd+P Labels shortcut')
write(p,t)

p='app/label-designer.tsx'; t=read(p)
# state
t=replace_once(t,'[openLibrary, setOpenLibrary] = useState<"layouts" | "tasks" | null>(null);','[openLibrary, setOpenLibrary] = useState<"layouts" | "tasks" | null>(null), [labelWorkspaceMoreOpen, setLabelWorkspaceMoreOpen] = useState(false);')

# resize function
start='    const resizeElement = useCallback'
end='    const sizeReadout ='
replacement='''    const resizeElement = useCallback((id: string, direction: 1 | -1, coarse = false) => {
        if (!advanced) setAdvanced(true);
        setItems(all => {
            const source = advanced ? all : arrangeLabelItems(all, preset);
            return source.map(item => {
                if (item.id !== id) return item;
                if (["text", "field", "sequence"].includes(item.kind)) {
                    const step = coarse ? 1 : .25;
                    return { ...item, font: Math.round(clamp(item.font + direction * step, 4, 40) * 4) / 4 };
                }
                if (item.kind === "qr") {
                    const step = coarse ? 1 : .25, maxSize = Math.min(preset.labelW - item.x, preset.labelH - item.y);
                    const size = Math.round(clamp(item.w + direction * step, 5, maxSize) * 4) / 4;
                    return { ...item, w: size, h: size };
                }
                if (item.kind === "barcode") {
                    const widthStep = coarse ? 2 : .5, heightStep = coarse ? 1 : .25;
                    return { ...item, w: Math.round(clamp(item.w + direction * widthStep, 8, preset.labelW - item.x) * 4) / 4, h: Math.round(clamp(item.h + direction * heightStep, 4, preset.labelH - item.y) * 4) / 4 };
                }
                return item;
            });
        });
    }, [advanced, preset]);
'''
t=replace_between(t,start,end,replacement)

# drag starts manual layout from visible arrangement
t=replace_once(t,'    const down = (e: ReactPointerEvent, item: Item) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setSelectedId(item.id); dragging.current = { id: item.id, startX: e.clientX, startY: e.clientY, x: item.x, y: item.y }; };','    const down = (e: ReactPointerEvent, item: Item) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); const arranged = advanced ? items : arrangeLabelItems(items, preset); const sourceItem = arranged.find(entry => entry.id === item.id) || item; if (!advanced) { setItems(arranged); setAdvanced(true); } setSelectedId(item.id); dragging.current = { id: item.id, startX: e.clientX, startY: e.clientY, x: sourceItem.x, y: sourceItem.y }; };')

# field helpers
old='''    const toggleField = (field: string, label: string) => { const existing = items.find(item => item.kind === "field" && item.field === field); if (existing) {
        setItems(all => all.filter(item => item.id !== existing.id));
        return;
    } setItems(all => [...all, { id: crypto.randomUUID(), kind: "field", field, value: label, fieldLabel: label, showLabel: false, x: 2, y: 2, w: 20, h: 4, font: 7 }]); };'''
new='''    const toggleField = (field: string, label: string) => { const existing = items.find(item => item.kind === "field" && item.field === field); if (existing) {
        setItems(all => all.filter(item => item.id !== existing.id));
        if (selectedId === existing.id) setSelectedId("");
        return;
    } setItems(all => [...all, { id: crypto.randomUUID(), kind: "field", field, value: label, fieldLabel: label, showLabel: false, x: 2, y: 2, w: 20, h: 4, font: 7 }]); };
    const moveFieldItem = (id: string, direction: -1 | 1) => setItems(all => {
        const fieldIndexes = all.map((item, index) => item.kind === "field" ? index : -1).filter(index => index >= 0);
        const currentIndex = all.findIndex(item => item.id === id), position = fieldIndexes.indexOf(currentIndex), nextPosition = position + direction;
        if (position < 0 || nextPosition < 0 || nextPosition >= fieldIndexes.length) return all;
        const targetIndex = fieldIndexes[nextPosition], next = [...all], moved = next.splice(currentIndex, 1)[0];
        next.splice(targetIndex, 0, moved); return next;
    });'''
t=replace_once(t,old,new)

# save bar
nav_start='<nav className="labelSaveBar" aria-label="Label saving">'
nav_end='</nav>'
a=t.find(nav_start)
if a >= 0:
    b=t.find(nav_end,a)
    if b >= 0:
        b += len(nav_end)
        t=t[:a]+'''<nav className="labelSaveBar" aria-label="Label saving"><button className="secondary" onClick={saveTemplate}>{activeTemplateId ? "Update layout" : "Save layout"}</button><button className="primary labelSetSave" disabled={!selectedRows.length} onClick={saveLabelTask}>{activeTaskId ? "Update label set" : "Save label set"}</button><div className="labelWorkspaceMore"><button type="button" className="secondary labelWorkspaceMoreButton" aria-label="More label actions" aria-expanded={labelWorkspaceMoreOpen} onClick={() => setLabelWorkspaceMoreOpen(value => !value)}>•••</button>{labelWorkspaceMoreOpen && <div className="labelWorkspaceMoreMenu"><button type="button" onClick={() => { setOpenLibrary("layouts"); setLabelWorkspaceMoreOpen(false); }}>Saved layouts</button><button type="button" onClick={() => { setOpenLibrary("tasks"); setLabelWorkspaceMoreOpen(false); }}>Saved label sets</button></div>}</div></nav>'''+t[b:]

t=t.replace('<small className="labelSetupHelp">Physical size and roll geometry drive preview and printing in millimetres.</small>','')

# React state-owned chips and manual/automatic layout action.
old='<section className="simpleDesigner panel"><div className="simpleDesignerHead"><div><h3>Information on the label</h3><small>Choose what people should see. The preview uses the selected real record.</small></div><button className="secondary" onClick={() => setAdvanced(value => !value)}>{advanced ? "Use simple setup" : "Advanced layout"}</button></div>'
new='''<section className="simpleDesigner panel"><div className="simpleDesignerHead"><div><h3>Information on the label</h3><small>Choose what people should see. The preview uses the selected real record.</small></div><button className="secondary" onClick={() => { if (advanced) setAdvanced(false); else { setItems(arrangeLabelItems(items, preset)); setAdvanced(true); } }}>{advanced ? "Automatic layout" : "Manual layout"}</button></div><div className="labelInfoSelectedStrip labelInfoSelectedStripReact">{items.filter(item => item.kind === "field").map(item => { const label = fieldOptions.find(option => option.key === item.field)?.label?.replace(/ \(resolved\)$/, "") || item.fieldLabel || item.value; return <button type="button" className="labelInfoChip" key={item.id} onClick={() => toggleField(item.field || "", label)}><span>{label}</span><b aria-hidden="true">×</b><span className="srOnly">Remove {label}</span></button>; })}</div>'''
t=replace_once(t,old,new)

# classification block
start='<div className="classificationInformation"><b>Classification / group</b>'
end='<div className="fieldChecklist">'
replacement='''{order && personDetailFields.length > 0 && sourceMode !== "product" && sourceMode !== "order" && <div className="classificationInformation"><b>{classificationFieldId ? `${personDetailFields.find(field => field.id === classificationFieldId)?.name || "Grouping"} / group` : "Grouping field"}</b><select aria-label="Order field used to group labels" value={classificationFieldId} onChange={event => chooseClassification(event.target.value)}><option value="">No grouping</option>{personDetailFields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select><small>Uses a field defined in this order setup.</small></div>}'''+end
t=replace_between(t,start,end,replacement)

# field ordering controls
t=replace_once(t,'{item && <><label className="showName"><input type="checkbox" checked={item.showLabel || false}','{item && <><div className="fieldOrderControls" aria-label={`Order ${option.label}`}><button type="button" aria-label={`Move ${option.label} up`} onClick={() => moveFieldItem(item.id, -1)}>↑</button><button type="button" aria-label={`Move ${option.label} down`} onClick={() => moveFieldItem(item.id, 1)}>↓</button></div><label className="showName"><input type="checkbox" checked={item.showLabel || false}')

# hover data
t=replace_once(t,'<button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} key={record.id} onClick={() => { setPreviewId(record.id);','<button className={`record ${selectedRows.includes(record.id) ? "selected" : ""}`} data-record-preview={[record.name, record.group, record.values.product_summary || record.product, ...Object.values(record.values).filter(value => value && !String(value).startsWith("{")).slice(0, 8)].filter(Boolean).join(" · ")} key={record.id} onClick={() => { setPreviewId(record.id);')

# property field replacement
t=replace_once(t,'{selected.kind === "field" && <><p className="selectedDetailName">{fieldOptions.find(option => option.key === selected.field)?.label || selected.fieldLabel}</p>','{selected.kind === "field" && <><label><span>Information</span><select value={selected.field || ""} onChange={event => { const option = fieldOptions.find(entry => entry.key === event.target.value); update(selected.id, { field: event.target.value, value: option?.label || event.target.value, fieldLabel: option?.label || event.target.value }); }}>{fieldOptions.filter(option => !option.key.startsWith("field_name:")).map(option => <option key={option.key} value={option.key}>{option.label.replace(/ \(resolved\)$/, "")}</option>)}</select></label><p className="selectedDetailName">{fieldOptions.find(option => option.key === selected.field)?.label || selected.fieldLabel}</p>')
old='''{["text", "field", "sequence"].includes(selected.kind) && <><label><span>Font size</span><input type="number" min="4" max="40" step=".5" value={selected.font} onChange={e => update(selected.id, { font: Number(e.target.value) })}/></label>{selected.kind !== "field" && <label className="inlineProperty"><input type="checkbox" checked={selected.bold || false} onChange={e => update(selected.id, { bold: e.target.checked })}/> Bold</label>}</>}</div>'''
new='''{["text", "field", "sequence"].includes(selected.kind) && <><label><span>Font size</span><input type="number" min="4" max="40" step=".25" value={selected.font} onChange={e => { if (!advanced) { setItems(arrangeLabelItems(items, preset)); setAdvanced(true); } update(selected.id, { font: Number(e.target.value) }); }}/></label>{selected.kind !== "field" && <label className="inlineProperty"><input type="checkbox" checked={selected.bold || false} onChange={e => update(selected.id, { bold: e.target.checked })}/> Bold</label>}</>}<div className="labelGeometryFields"><label><span>X mm</span><input type="number" step=".25" value={selected.x} onChange={e => { setAdvanced(true); update(selected.id, { x: clamp(Number(e.target.value), 0, Math.max(0, preset.labelW - selected.w)) }); }}/></label><label><span>Y mm</span><input type="number" step=".25" value={selected.y} onChange={e => { setAdvanced(true); update(selected.id, { y: clamp(Number(e.target.value), 0, Math.max(0, preset.labelH - selected.h)) }); }}/></label><label><span>Width mm</span><input type="number" min="1" step=".25" value={selected.w} onChange={e => { setAdvanced(true); update(selected.id, { w: clamp(Number(e.target.value), 1, preset.labelW - selected.x) }); }}/></label><label><span>Height mm</span><input type="number" min="1" step=".25" value={selected.h} onChange={e => { setAdvanced(true); update(selected.id, { h: clamp(Number(e.target.value), 1, preset.labelH - selected.y) }); }}/></label></div></div>'''
t=replace_once(t,old,new)

# purpose relevance function
start='function fieldRelevantForPurpose'
end='function uniqueSavedName'
replacement='''function fieldRelevantForPurpose(key: string, purpose: LabelPurpose | null, source: SourceMode) {
    if (!purpose) return true;
    if (key === "group") return false;
    const actualPersonField = key.startsWith("field:") || key.startsWith("trace_field:");
    const genericWorkpiece = key === "name";
    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position";
    const productionOnly = key === "bundle_summary" || key === "unit_position";
    if (purpose === "inventory") return !actualPersonField && !genericWorkpiece && !packingOnly && !productionOnly;
    if (purpose === "packing") return !genericWorkpiece && !productionOnly && key !== "variation_count";
    if (purpose === "production") return (!packingOnly || source === "order") && (!genericWorkpiece || source === "person_product");
    return true;
}
'''+end
t=replace_between(t,start,end,replacement)

# field options function
start='function labelFieldOptions'
end='function normalizedMeasurementValues'
replacement='''function labelFieldOptions(order?: SeikoOrder | null) { const base = [{ key: "name", label: "Person / workpiece" }, { key: "group", label: "Group / label type" }, { key: "product", label: "Product" }, { key: "product_summary", label: "Package contents" }, { key: "bundle_summary", label: "Cutting bundle summary" }, { key: "size", label: "Resolved size" }, { key: "resolved_quantity", label: "Calculated quantity" }, { key: "people_count", label: "Number of people" }, { key: "variation_count", label: "Number of variations" }, { key: "unit_position", label: "Piece / pair number / total" }, { key: "package_position", label: "Package / set number / total" }, { key: "trace_order_position", label: "Label number / order total" }, { key: "trace_person_position", label: "Person number / total" }, { key: "trace_product_position", label: "Product number / total" }, { key: "order", label: "Order number" }, { key: "order_date", label: "Order date" }, { key: "delivery_date", label: "Delivery date" }, { key: "client", label: "Client name" }, { key: "client_type", label: "Client type" }, { key: "contact_person", label: "Contact person / Attn" }, { key: "phone", label: "Phone number" }, { key: "delivery_address", label: "Delivery address" }, { key: "billing_address", label: "Billing address" }, { key: "remarks", label: "Remarks" }, { key: "token", label: "Trace code" }], people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], traceGroups = order?.fields.filter(field => field.name.trim()).map(field => ({ key: `trace_field:${field.id}`, label: `Number within ${field.name}` })) || [], productBasics = order?.products.filter(product => product.name.trim()).flatMap(product => [{ key: `product_name:${product.id}`, label: `${product.name} · Product` }, { key: `product_quantity:${product.id}`, label: `${product.name} · Quantity` }]) || [], measurements = order?.measurements.flatMap(measurement => order.products.filter(product => measurement.appliesTo.includes(product.id)).map(product => ({ key: `measurement:${measurement.id}:product:${product.id}`, label: `${product.name} · ${measurement.name}` }))) || [], specifications = order?.products.flatMap(product => product.specifications.filter(spec => spec.name.trim()).map(spec => ({ key: `spec:${spec.id}`, label: `${product.name} · ${spec.name} (resolved)` }))) || [], values = [...base, ...people, ...traceGroups, ...productBasics, ...measurements, ...specifications]; return [...values, ...values.map(option => ({ key: `field_name:${option.key}`, label: `Field name · ${option.label.replace(/ \(resolved\)$/, "")}` }))]; }
'''+end
t=replace_between(t,start,end,replacement)

# per-product values flow through shared packing/person/product rows.
t=replace_once(t,'values: { ...commonValues, product: product.name, qty, ...productValues(product) }','values: { ...commonValues, product: product.name, qty, [`product_name:${product.id}`]: product.name, [`product_quantity:${product.id}`]: qty, ...productValues(product) }')
t=replace_once(t,'values: { ...commonValues, ...scopedValues, name, group, product: product?.name || "Order", product_id: product?.id || "", record_id: record.recordId, quantity_mode: product?.quantityMode || "", size: String(sizeEntry?.[1] || ""), qty: String(qty), ...(product ? productValues(product, record) : {}) }','values: { ...commonValues, ...scopedValues, name, group, product: product?.name || "Order", product_id: product?.id || "", record_id: record.recordId, quantity_mode: product?.quantityMode || "", size: String(sizeEntry?.[1] || ""), qty: String(qty), ...(product ? { [`product_name:${product.id}`]: product.name, [`product_quantity:${product.id}`]: String(qty), ...productValues(product, record) } : {}) }')

for marker,label in [('labelWorkspaceMoreOpen','label overflow menu'),('labelInfoSelectedStripReact','state owned chips'),('moveFieldItem','field ordering'),('data-record-preview','record hover'),('labelGeometryFields','geometry'),('product_name:','product-specific details'),('if (purpose === "packing") return !genericWorkpiece','purpose awareness')]: require(t,marker,label)
write(p,t)

# polish stops manufacturing its own state-less chip strip.
p='app/label-designer-polish.tsx'; t=read(p)
t=t.replace('    const selectedStrip = document.createElement("div");\n    selectedStrip.className = "labelInfoSelectedStrip";\n    section.querySelector(".simpleDesignerHead")?.insertAdjacentElement("afterend", selectedStrip);\n','')
t=t.replace('  if (selectedStrip) {','  if (selectedStrip && !selectedStrip.classList.contains("labelInfoSelectedStripReact")) {',1)
write(p,t)

# print copies only after Print.
p='app/label-finalization.tsx'; t=read(p)
start='function syncPrintCopies()'
end='function labelOnlyPrint()'
replacement='''function askPrintCopies(selected: number, onConfirm: (copies: number) => void) {
  document.querySelector(".labelPrintCopiesDialog")?.remove();
  const storageKey = `jinam:${activeBusiness()}:labels:print-copies`;
  const layer = document.createElement("div");
  layer.className = "seikoConfirmLayer labelPrintCopiesDialog";
  layer.innerHTML = '<section class="seikoConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="label-copies-title"><h3 id="label-copies-title">Print labels</h3><p class="labelCopiesSummary"></p><label class="labelCopiesField"><span>Copies of each selected label</span><input type="number" min="1" max="50" step="1"></label><div><button type="button" class="secondary cancel">Cancel</button><button type="button" class="primary confirm">Continue to print</button></div></section>';
  const input = layer.querySelector<HTMLInputElement>("input")!; input.value = localStorage.getItem(storageKey) || "1";
  const sync = () => { const copies = Math.max(1, Math.min(50, Math.floor(Number(input.value) || 1))); input.value = String(copies); const summary = layer.querySelector<HTMLElement>(".labelCopiesSummary"); if (summary) summary.textContent = `${selected} selected · ${selected * copies} total print${selected * copies === 1 ? "" : "s"}`; };
  sync(); input.addEventListener("input", sync);
  const close = () => layer.remove(); layer.querySelector<HTMLButtonElement>(".cancel")!.addEventListener("click", close);
  layer.querySelector<HTMLButtonElement>(".confirm")!.addEventListener("click", () => { const copies = Math.max(1, Math.min(50, Math.floor(Number(input.value) || 1))); localStorage.setItem(storageKey, String(copies)); close(); onConfirm(copies); });
  layer.addEventListener("click", event => { if (event.target === layer) close(); }); document.body.appendChild(layer); input.focus(); input.select();
}

function labelOnlyPrint(copies = 1)'''
t=replace_between(t,start,end,replacement)
t=t.replace('    const copies = Math.max(1, Math.min(50, Math.floor(Number(document.querySelector<HTMLInputElement>(".labelPrintCopies input")?.value) || 1)));\n','')
t=t.replace('      syncPrintCopies();\n','')
t=replace_once(t,'      labelOnlyPrint();','      const selected = document.querySelectorAll(".labelDesignerPage .recordList .record.selected").length; askPrintCopies(selected, copies => labelOnlyPrint(copies));')
require(t,'askPrintCopies','print copies dialog'); require(t,'labelOnlyPrint(copies = 1)','print copy parameter')
write(p,t)

print('SEIKO general label refinement applied')
