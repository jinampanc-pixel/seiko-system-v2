from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one marker, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Order Workspace: collapse the failed full-width toolbar into one compact Tools control.
p = Path("app/orders.tsx")
text = p.read_text()
start = text.index('    <div className="workspaceSheetBar" role="toolbar" aria-label="Spreadsheet tools">')
end = text.index('    <div className="workspaceTools">', start)
text = text[:start] + text[end:]
old = '    <div className="workspaceTools"><div className="workspaceAddTools">'
new = '''    <div className="workspaceTools"><details className="workspaceCompactTools"><summary aria-label="Workspace tools">Tools</summary><div className="workspaceCompactToolsPanel">
      <section><b>Edit</b><button type="button" data-sheet-action="undo" disabled={!undoStack.length} onClick={undo}>Undo <kbd>Ctrl/Cmd+Z</kbd></button><button type="button" data-sheet-action="redo" disabled={!redoStack.length} onClick={redo}>Redo <kbd>Ctrl/Cmd+Y</kbd></button><button type="button" disabled={!selectedBounds} onClick={()=>void copySelection()}>Copy selection</button><button type="button" disabled={!selectedBounds} onClick={clearSelection}>Clear selection</button><button type="button" disabled={!selectedBounds || selectedBounds.bottom<=selectedBounds.top} onClick={fillDown}>Fill down</button></section>
      <section><b>Insert</b><button type="button" onClick={()=>insertRecordsAt(selectedBounds ? selectedBounds.top : order.records.length, rowsToAdd)}>Insert {rowsToAdd} row{rowsToAdd===1?"":"s"} above</button><button type="button" onClick={()=>insertRecordsAt(selectedBounds ? selectedBounds.bottom + 1 : order.records.length, rowsToAdd)}>Insert {rowsToAdd} row{rowsToAdd===1?"":"s"} below</button></section>
      <section><b>Columns</b><div className="columnControl workspaceSheetColumns" ref={columnControlRef}><button type="button" className="workspaceSheetMenuButton" aria-expanded={columnMenuOpen} onClick={()=>setColumnMenuOpen(value=>!value)}>Choose columns</button>{columnMenuOpen&&<div className="columnMenu"><button type="button" className="columnMenuShowAll" onClick={showAllColumns}>Show all columns</button><label><input type="checkbox" checked={!hiddenColumns.has("personId")} onChange={()=>toggleColumn("personId")}/>Person ID</label>{columns.map(column=><label key={column.id}><input type="checkbox" checked={!hiddenColumns.has(column.id)} onChange={()=>toggleColumn(column.id)}/>{column.groupLabel} · {column.label}</label>)}</div>}</div></section>
      <section><b>Format</b><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("left")}>Align left</button><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("center")}>Align centre</button><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("right")}>Align right</button></section>
      <section><b>Data</b><button type="button" disabled={!selectedBounds} onClick={()=>sortBySelectedColumn(1)}>Sort A → Z</button><button type="button" disabled={!selectedBounds} onClick={()=>sortBySelectedColumn(-1)}>Sort Z → A</button></section>
      <small>Tip: right-click a row number or column header for actions on that row or column.</small>
    </div></details><div className="workspaceAddTools">'''
if text.count(old) != 1:
    raise SystemExit("app/orders.tsx: workspaceTools marker missing")
text = text.replace(old, new, 1)

# 2) State-backed right-click commands for row/column context menus.
marker = '    window.addEventListener("seiko:workspace-reorder-rows", reorderRows);\n'
insert = '''    const rowCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command: string; ids?: string[]; targetId?: string }>).detail;
      const ids = detail?.ids?.length ? detail.ids : detail?.targetId ? [detail.targetId] : [];
      if (!detail?.command || !ids.length) return;
      const targetId = detail.targetId || ids[0];
      const targetIndex = order.records.findIndex(record => record.recordId === targetId);
      if (detail.command === "insert-above" || detail.command === "insert-below") {
        const at = Math.max(0, targetIndex + (detail.command === "insert-below" ? 1 : 0));
        insertRecordsAt(at, 1);
        return;
      }
      if (detail.command === "delete") {
        if (!confirm(`Delete ${ids.length} selected row${ids.length === 1 ? "" : "s"}?`)) return;
        const selected = new Set(ids);
        commitRecords(order.records.filter(record => !selected.has(record.recordId)));
        return;
      }
      if (detail.command === "toggle-hold") {
        const selected = new Set(ids);
        const shouldHold = order.records.some(record => selected.has(record.recordId) && !record.held);
        commitRecords(order.records.map(record => selected.has(record.recordId) ? { ...record, held: shouldHold } : record));
      }
    };
    const columnCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ command: string; ids?: string[] }>).detail;
      const ids = detail?.ids?.filter(Boolean) || [];
      if (!detail?.command || !ids.length) return;
      if (detail.command === "hide") {
        setHiddenColumns(current => { const next = new Set(current); ids.forEach(id => next.add(id)); persistWorkspace({ hiddenColumns: [...next] }); return next; });
        return;
      }
      if (detail.command === "reset-width") {
        setColumnWidths(current => { const next = { ...current }; ids.forEach(id => delete next[id]); persistWorkspace({ columnWidths: next }); return next; });
        return;
      }
      if (detail.command.startsWith("align-")) {
        const align = detail.command.slice(6) as "left" | "center" | "right";
        setColumnAlignments(current => { const next = { ...current }; ids.forEach(id => { next[id] = align; }); persistWorkspace({ columnAlignments: next }); return next; });
        return;
      }
      if (detail.command === "sort-asc" || detail.command === "sort-desc") {
        const id = ids[0], direction = detail.command === "sort-asc" ? 1 : -1;
        const valueFor = (record: OrderRecord) => id === "personId" ? record.personId : String(record.values[id] ?? "");
        commitRecords([...order.records].sort((a, b) => valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true }) * direction));
      }
    };
    window.addEventListener("seiko:workspace-row-command", rowCommand);
    window.addEventListener("seiko:workspace-column-command", columnCommand);
'''
if text.count(marker) != 1:
    raise SystemExit("app/orders.tsx: reorder listener marker missing")
text = text.replace(marker, insert + marker, 1)
cleanup = '    return () => { window.removeEventListener("seiko:workspace-reorder-rows", reorderRows); window.removeEventListener("seiko:workspace-reorder-columns", reorderColumns); };\n'
cleanup_new = '    return () => { window.removeEventListener("seiko:workspace-row-command", rowCommand); window.removeEventListener("seiko:workspace-column-command", columnCommand); window.removeEventListener("seiko:workspace-reorder-rows", reorderRows); window.removeEventListener("seiko:workspace-reorder-columns", reorderColumns); };\n'
if text.count(cleanup) != 1:
    raise SystemExit("app/orders.tsx: listener cleanup marker missing")
text = text.replace(cleanup, cleanup_new, 1)
p.write_text(text)

# 3) Workspace row/column selection now owns right-click context actions too.
Path("app/workspace-structure-interactions.tsx").write_text('''"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

let rowAnchor = "", columnAnchor = "";
const selectedRows = new Set<string>(), selectedColumns = new Set<string>();
function ordered<T extends HTMLElement>(selector: string) { return Array.from(document.querySelectorAll<T>(selector)); }
function paint() {
  ordered<HTMLElement>(".workspaceTable tbody tr[data-record-id]").forEach(row => row.classList.toggle("workspaceStructureSelected", selectedRows.has(row.dataset.recordId || "")));
  ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]").forEach(cell => cell.classList.toggle("workspaceStructureSelected", selectedColumns.has(cell.dataset.columnId || "")));
}
function selectRange(ids: string[], from: string, to: string, target: Set<string>) { const a=ids.indexOf(from), b=ids.indexOf(to); if(a<0||b<0)return; target.clear(); for(let i=Math.min(a,b);i<=Math.max(a,b);i++) target.add(ids[i]); }
function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}
function contextMenu(x:number,y:number,items:Array<{label:string;command:string;disabled?:boolean}>,dispatch:(command:string)=>void){
  closeContextMenu();
  const menu=document.createElement("div");menu.className="workspaceContextMenu";menu.setAttribute("role","menu");
  items.forEach(item=>{const button=document.createElement("button");button.type="button";button.textContent=item.label;button.disabled=!!item.disabled;button.addEventListener("click",()=>{dispatch(item.command);closeContextMenu();});menu.appendChild(button);});
  document.body.appendChild(menu);const box=menu.getBoundingClientRect();menu.style.left=`${Math.max(6,Math.min(window.innerWidth-box.width-6,x))}px`;menu.style.top=`${Math.max(6,Math.min(window.innerHeight-box.height-6,y))}px`;
  window.setTimeout(()=>document.addEventListener("pointerdown",closeContextMenu,{once:true,capture:true}),0);
}
function configureRows() {
  const rows = ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]");
  rows.forEach(row => {
    const id=row.dataset.recordId||"", handle=row.querySelector<HTMLElement>(".workspaceRowHeader"); if(!id||!handle||handle.dataset.structureReady)return;
    handle.dataset.structureReady="true"; handle.draggable=true; handle.title="Click to select row; Shift selects a range; Ctrl/Cmd adds rows; drag to move; right-click for row actions";
    handle.addEventListener("click", event => { const ids=rows.map(item=>item.dataset.recordId||""); if(event.shiftKey&&rowAnchor) selectRange(ids,rowAnchor,id,selectedRows); else if(event.ctrlKey||event.metaKey){if(selectedRows.has(id)) selectedRows.delete(id); else selectedRows.add(id); rowAnchor=id;} else {selectedRows.clear();selectedRows.add(id);rowAnchor=id;} paint(); });
    handle.addEventListener("contextmenu",event=>{event.preventDefault();if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();}const ids=[...selectedRows];const allHeld=ids.every(recordId=>document.querySelector<HTMLTableRowElement>(`.workspaceTable tbody tr[data-record-id="${CSS.escape(recordId)}"]`)?.classList.contains("recordHeld"));contextMenu(event.clientX,event.clientY,[{label:"Insert row above",command:"insert-above"},{label:"Insert row below",command:"insert-below"},{label:allHeld?"Resume selected rows":"Put selected rows on hold",command:"toggle-hold"},{label:`Delete selected row${ids.length===1?"":"s"}`,command:"delete"}],command=>window.dispatchEvent(new CustomEvent("seiko:workspace-row-command",{detail:{command,ids,targetId:id}})));});
    handle.addEventListener("dragstart", event => { if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();} event.dataTransfer?.setData("text/plain","seiko-rows"); event.dataTransfer!.effectAllowed="move"; });
    handle.addEventListener("dragover", event => { event.preventDefault(); row.classList.add("workspaceStructureDropTarget"); });
    handle.addEventListener("dragleave",()=>row.classList.remove("workspaceStructureDropTarget"));
    handle.addEventListener("drop", event => { event.preventDefault(); row.classList.remove("workspaceStructureDropTarget"); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id}})); });
  });
  const corner=document.querySelector<HTMLElement>(".workspaceRowHeaderCorner"); if(corner&&!corner.dataset.structureReady){corner.dataset.structureReady="true";corner.addEventListener("click",()=>{selectedRows.clear();rows.forEach(row=>selectedRows.add(row.dataset.recordId||""));paint();});}
}
function configureColumns() {
  const cells=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]");
  cells.forEach(cell=>{const id=cell.dataset.columnId||""; if(!id||cell.dataset.structureReady)return; cell.dataset.structureReady="true";cell.draggable=true;cell.title="Click to select column; Shift selects a range; Ctrl/Cmd adds columns; drag to move; right-click for column actions";
    cell.addEventListener("click",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;const ids=cells.map(item=>item.dataset.columnId||"");if(event.shiftKey&&columnAnchor)selectRange(ids,columnAnchor,id,selectedColumns);else if(event.ctrlKey||event.metaKey){if(selectedColumns.has(id))selectedColumns.delete(id);else selectedColumns.add(id);columnAnchor=id;}else{selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;}paint();});
    cell.addEventListener("contextmenu",event=>{if((event.target as Element)?.closest?.(".columnResizeHandle"))return;event.preventDefault();if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}const ids=[...selectedColumns];contextMenu(event.clientX,event.clientY,[{label:`Hide selected column${ids.length===1?"":"s"}`,command:"hide"},{label:"Reset column width",command:"reset-width"},{label:"Align left",command:"align-left"},{label:"Align centre",command:"align-center"},{label:"Align right",command:"align-right"},{label:"Sort A → Z",command:"sort-asc"},{label:"Sort Z → A",command:"sort-desc"}],command=>window.dispatchEvent(new CustomEvent("seiko:workspace-column-command",{detail:{command,ids}})));});
    cell.addEventListener("dragstart",event=>{if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}event.dataTransfer?.setData("text/plain","seiko-columns");event.dataTransfer!.effectAllowed="move";});
    cell.addEventListener("dragover",event=>{event.preventDefault();cell.classList.add("workspaceStructureDropTarget");});cell.addEventListener("dragleave",()=>cell.classList.remove("workspaceStructureDropTarget"));
    cell.addEventListener("drop",event=>{event.preventDefault();cell.classList.remove("workspaceStructureDropTarget");window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id}}));});
  });
}
function enhance(){configureRows();configureColumns();paint();}
export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});return()=>{closeContextMenu();controller.stop();};},[]);return null;}
''')

# 4) Labels: workspace row data is authoritative; never copy another product's measurement into an empty product.
p = Path("app/label-designer.tsx")
text = p.read_text()
start = text.index('function normalizedMeasurementValues(order: SeikoOrder, values: Record<string, string | number>) {')
end = text.index('function labelQuantityForRecord(', start)
safe_normalizer = '''function normalizedMeasurementValues(order: SeikoOrder, values: Record<string, string | number>) {
    const measurementColumns = workspaceColumns(order).filter(column => column.id.startsWith("measurement:"));
    const normalized: Record<string, string> = {};
    for (const column of measurementColumns) {
        const exact = values[column.id];
        if (hasLabelValue(exact)) normalized[column.id] = String(exact);
    }
    // Legacy unscoped measurement values are migrated only when there is one unambiguous target.
    for (const [key, value] of Object.entries(values)) {
        if (!key.startsWith("measurement:") || key.includes(":product:") || !hasLabelValue(value)) continue;
        const measurementId = key.replace(/^measurement:/, "");
        const targets = measurementColumns.filter(column => column.id.startsWith(`measurement:${measurementId}:product:`) && !hasLabelValue(normalized[column.id]));
        if (targets.length === 1) normalized[targets[0].id] = String(value);
    }
    return normalized;
}
'''
text = text[:start] + safe_normalizer + text[end:]

# Person/package rows retain person/order data plus explicit package slots only; product-specific values do not bleed across the package.
helper_marker = 'function personPackageRows(rows: RecordRow[], order: SeikoOrder, plan: PersonPackagePlan = "together", includedProducts: string[] = []): RecordRow[] {'
helper = '''function packageBaseValues(values: Record<string, string>) {
    const common = new Set(["order","order_date","delivery_date","client","client_type","contact_person","phone","delivery_address","billing_address","remarks","record_id","name","group"]);
    return Object.fromEntries(Object.entries(values).filter(([key]) => common.has(key) || key.startsWith("field:") || key.startsWith("field_name:field:") || key.startsWith("trace_field:")));
}
'''
if text.count(helper_marker) != 1:
    raise SystemExit("app/label-designer.tsx: personPackageRows marker missing")
text = text.replace(helper_marker, helper + helper_marker, 1)
old_values = 'values: { ...Object.assign({}, ...packageItems.map(item => item.values)), ...slotValues, product: packageProductNames.join(", "), product_summary: contents, package_products: JSON.stringify(packageProductNames), package_product_ids: JSON.stringify(packageProductIds), qty, resolved_quantity: quantityBreakdown, quantity_total: qty, package_position: position }'
new_values = 'values: { ...packageBaseValues(first.values), ...slotValues, product: packageProductNames.join(", "), product_summary: contents, package_products: JSON.stringify(packageProductNames), package_product_ids: JSON.stringify(packageProductIds), qty, resolved_quantity: quantityBreakdown, quantity_total: qty, package_position: position }'
if text.count(old_values) != 1:
    raise SystemExit("app/label-designer.tsx: package merged values marker missing")
text = text.replace(old_values, new_values, 1)
text = text.replace('label: `Applicable product ${slot} · Product`', 'label: `Package product ${slot} · Product`')
text = text.replace('label: `Applicable product ${slot} · Quantity`', 'label: `Package product ${slot} · Quantity`')
text = text.replace('label: `Applicable product ${slot} · Details`', 'label: `Package product ${slot} · Details`')
hint = '{purpose === "packing" && sourceMode === "person" && <p className="labelDynamicProductHint">Use <b>Applicable product</b> slots for mixed orders. The same layout position resolves the product, quantity and details from the current preview/print record; exact inapplicable product fields are not offered here.</p>}'
if text.count(hint) != 1:
    raise SystemExit("app/label-designer.tsx: dynamic product hint marker missing")
text = text.replace(hint, '', 1)

# Remove stale product-specific fields whenever the representation changes to one where they are not valid.
field_options_marker = '    const fieldOptions = useMemo(() => labelFieldOptions(order).map(option => option.key === "product_summary" ? { ...option, label: "Package contents" } : option).filter(option => fieldRelevantForPurpose(option.key, purpose, sourceMode)), [order, purpose, sourceMode]);\n'
field_options_insert = field_options_marker + '    useEffect(() => { const allowed = new Set(fieldOptions.map(option => option.key)); setItems(all => { const next = all.filter(item => item.kind !== "field" || !item.field || allowed.has(item.field)); return next.length === all.length ? all : next; }); }, [fieldOptions]);\n'
if text.count(field_options_marker) != 1:
    raise SystemExit("app/label-designer.tsx: fieldOptions marker missing")
text = text.replace(field_options_marker, field_options_insert, 1)

# Preview selector identifies the record cleanly instead of dumping every package product into the option label.
old_preview = '{records.map(record => <option key={record.id} value={record.id}>{record.name}{record.product ? ` — ${record.product}` : ""}</option>)}'
new_preview = '{records.map(record => <option key={record.id} value={record.id}>{record.name}{sourceMode === "person" && record.values.group ? ` · ${record.values.group}` : sourceMode !== "person" && record.group ? ` · ${record.group}` : ""}</option>)}'
if text.count(old_preview) != 1:
    raise SystemExit("app/label-designer.tsx: preview option marker missing")
text = text.replace(old_preview, new_preview, 1)
p.write_text(text)

# 5) Label creation route gets the same contextual Back treatment before entering the designer.
replace_once(
    "app/labels/create/page.tsx",
    '<section className="labelCreateRouteHead"><div><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order, choose why the label is needed, then decide what one label represents.</p></div></section>',
    '<section className="labelCreateRouteHead"><div><button type="button" className="secondary contextBackButton" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = `/?business=${businessId}`; }}>← Back</button><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order, choose why the label is needed, then decide what one label represents.</p></div></section>',
)

# 6) Late CSS locks the compact workspace controls and context menu without disturbing the restored Stage-1 visual system.
p = Path("app/seiko-workspace-label-final.css")
css = p.read_text()
css += '''\n\n/* 2026-09-01 accuracy pass: compact spreadsheet tools + precise row/column controls */
.workspacePage .workspaceSheetBar{display:none!important}
.workspacePage>.workspaceTools{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important}
.workspaceCompactTools{position:relative;flex:0 0 auto;z-index:42}
.workspaceCompactTools>summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;height:34px;min-width:58px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--navy);font-size:10px;font-weight:850;cursor:pointer}
.workspaceCompactTools>summary::-webkit-details-marker{display:none}
.workspaceCompactTools[open]>summary{background:var(--pale)}
.workspaceCompactToolsPanel{position:absolute;z-index:95;top:calc(100% + 5px);left:0;display:grid;grid-template-columns:repeat(2,minmax(170px,1fr));gap:8px;width:min(430px,calc(100vw - 30px));padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--paper);box-shadow:0 16px 38px rgba(14,42,61,.18)}
.workspaceCompactToolsPanel section{display:grid;gap:3px;align-content:start}
.workspaceCompactToolsPanel section>b{padding:3px 5px;color:var(--muted);font-size:9px;letter-spacing:.05em;text-transform:uppercase}
.workspaceCompactToolsPanel button{min-height:30px;border:0;border-radius:6px;padding:5px 7px;background:transparent;color:var(--ink);font-size:10px;font-weight:700;text-align:left}
.workspaceCompactToolsPanel button:hover:not(:disabled){background:var(--pale)}
.workspaceCompactToolsPanel button:disabled{opacity:.4}
.workspaceCompactToolsPanel kbd{float:right;color:var(--muted);font-size:8px}
.workspaceCompactToolsPanel>small{grid-column:1/-1;padding:4px 5px 0;color:var(--muted);font-size:9px}
.workspaceCompactToolsPanel .columnControl{position:relative}
.workspaceCompactToolsPanel .columnMenu{top:calc(100% + 3px)!important;left:0!important;right:auto!important;max-height:300px!important}
.workspaceTable col.workspaceRowNumberCol{width:40px!important;min-width:40px!important;max-width:40px!important}
.workspaceTable .workspaceRowHeaderCorner,.workspaceTable .workspaceRowHeader{box-sizing:border-box!important;width:40px!important;min-width:40px!important;max-width:40px!important;padding:0!important;text-align:center!important}
.workspaceResizableHeader{position:relative!important}
.workspaceResizableHeader .columnResizeHandle{position:absolute!important;top:0!important;right:-3px!important;bottom:0!important;width:7px!important;cursor:col-resize!important;opacity:0!important;z-index:8!important}
.workspaceResizableHeader:hover .columnResizeHandle,.workspaceResizableHeader .columnResizeHandle:focus{opacity:1!important;background:color-mix(in srgb,var(--brand) 20%,transparent)!important}
.workspaceContextMenu{position:fixed;z-index:1000;display:grid;min-width:190px;padding:6px;border:1px solid var(--line);border-radius:9px;background:var(--paper);box-shadow:0 18px 42px rgba(14,42,61,.22)}
.workspaceContextMenu button{min-height:32px;border:0;border-radius:6px;padding:6px 9px;background:transparent;color:var(--ink);font:700 10px/1.2 var(--ui-font);text-align:left}
.workspaceContextMenu button:hover:not(:disabled){background:var(--pale)}
.workspaceContextMenu button:disabled{opacity:.4}
.labelCreateRouteHead .contextBackButton{margin:0 0 8px!important;padding-left:0!important;border:0!important;background:transparent!important}
@media(max-width:700px){.workspaceCompactToolsPanel{grid-template-columns:1fr;max-height:70vh;overflow:auto}}
'''
p.write_text(css)

# 7) Regression contract now rejects the exact failure modes reported in preview.
p = Path("tests/seiko-workspace-label-accuracy-contract.test.mjs")
test_text = p.read_text()
test_text = test_text.replace('  assert.match(orders, /workspaceSheetBar/);', '  assert.doesNotMatch(orders, /className="workspaceSheetBar"/);\n  assert.match(orders, /workspaceCompactTools/);')
test_text = test_text.replace('  assert.match(labels, /Applicable product/);', '  assert.doesNotMatch(labels, /Use <b>Applicable product<\\/b> slots/);\n  assert.match(labels, /Package product \\$\\{slot\\}/);')
test_text += '''\n
test("workspace row and column headers expose state-backed context actions", () => {
  const structure = read("app/workspace-structure-interactions.tsx");
  assert.match(structure, /contextmenu/);
  assert.match(structure, /seiko:workspace-row-command/);
  assert.match(structure, /seiko:workspace-column-command/);
  assert.match(orders, /seiko:workspace-row-command/);
  assert.match(orders, /seiko:workspace-column-command/);
});

test("label measurement normalization never borrows another product value", () => {
  assert.doesNotMatch(labels, /candidates\\[0\\]/);
  assert.match(labels, /targets\\.length === 1/);
  assert.match(labels, /packageBaseValues\\(first\\.values\\)/);
  assert.doesNotMatch(labels, /Object\\.assign\\(\\{\\}, \\.\\.\\.packageItems\\.map/);
});

test("packing preview keeps only relevant fields and uses concise record identity", () => {
  assert.match(labels, /allowed = new Set\\(fieldOptions\\.map/);
  assert.match(labels, /sourceMode === "person" && record\\.values\\.group/);
  assert.doesNotMatch(labels, /record\\.name\\}\\{record\\.product \\?/);
});
'''
p.write_text(test_text)
