from pathlib import Path
import re


def fail(message: str):
    raise SystemExit(message)


def replace_once(path: str, old: str, new: str):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        fail(f"{path}: expected one occurrence, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


# Home: Clear filters must be a real reset, not a visually enabled dead end.
replace_once(
    "app/seiko-phase1.tsx",
    '<button type="button" className="textButton" disabled={!activeFilterCount} onClick={clearFilters}>Clear filters</button>',
    '<button type="button" className="textButton" aria-label="Clear all order filters" onClick={()=>{clearFilters();setFiltersOpen(false);}}>Clear filters</button>',
)
replace_once(
    "app/seiko-phase1.tsx",
    '        if (text === "Back" && button.closest(".labelCreateApp,.labelDesigner")) button.textContent = "← Back to Labels";\n',
    '        if (text === "Back" && button.closest(".labelCreateApp,.labelDesigner")) button.textContent = "← Back to Labels";\n        if (button.textContent?.trim().startsWith("← Back")) button.classList.add("contextBackButton");\n',
)

# Workspace layout preferences belong to order workspace state.
replace_once(
    "app/lib/order-domain.ts",
    'workspace?: { columnOrder?: string[] }',
    'workspace?: { columnOrder?: string[]; hiddenColumns?: string[]; columnWidths?: Record<string, number>; columnAlignments?: Record<string, "left" | "center" | "right"> }',
)

orders_path = Path("app/orders.tsx")
orders = orders_path.read_text()
old = 'import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";'
new = 'import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";'
if orders.count(old) != 1:
    fail("orders import marker missing")
orders = orders.replace(old, new, 1)

# Navigational exits use the same contextual Back language/style.
old = '<button className="secondary" onClick={onCancel}>Cancel</button>'
if orders.count(old) != 2:
    fail(f"Order Setup Cancel expected twice, found {orders.count(old)}")
orders = orders.replace(old, '<button className="secondary contextBackButton" onClick={onCancel}>{order.revisions.length ? "← Back to Workspace" : "← Back to Orders"}</button>')
orders = orders.replace('className="textButton workspaceBackButton"', 'className="textButton workspaceBackButton contextBackButton"', 1)

# Order menu is order-level. Hold is already represented by Status; undo/redo are sheet actions.
menu_pattern = re.compile(
    r'<button onClick=\{\(\)=>\{setOrderMenuOpen\(false\);onEditSetup\(\);\}\}>Edit setup</button>'
    r'<button onClick=\{\(\)=>onChange\(\{ \.\.\.order, status: order\.status === "On Hold" \? "Active" : "On Hold" \}\)\}>'
    r'\{order\.status === "On Hold" \? "Resume order" : "Put order on hold"\}</button>'
    r'<div className="orderMenuDivider"/>'
    r'<button disabled=\{!undoStack\.length\} onClick=\{\(\)=>\{setOrderMenuOpen\(false\);undo\(\);\}\}>Undo last change</button>'
    r'<button disabled=\{!redoStack\.length\} onClick=\{\(\)=>\{setOrderMenuOpen\(false\);redo\(\);\}\}>Redo last change</button>'
    r'<div className="orderMenuDivider"/>'
)
orders, count = menu_pattern.subn('<button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><div className="orderMenuDivider"/>', orders, count=1)
if count != 1:
    fail(f"workspace redundant menu block replacement count {count}")

old = '  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());\n  const [columnMenuOpen, setColumnMenuOpen] = useState(false);\n  const columnControlRef = useRef<HTMLDivElement>(null);'
new = '  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(order.workspace?.hiddenColumns || []));\n  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({ ...(order.workspace?.columnWidths || {}) }));\n  const [columnAlignments, setColumnAlignments] = useState<Record<string, "left" | "center" | "right">>(() => ({ ...(order.workspace?.columnAlignments || {}) }));\n  const [columnMenuOpen, setColumnMenuOpen] = useState(false);\n  const columnControlRef = useRef<HTMLDivElement>(null);'
if orders.count(old) != 1:
    fail("workspace column-state marker missing")
orders = orders.replace(old, new, 1)

old = '  const toggleColumn = (id: string) => setHiddenColumns(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });'
new = '''  const persistWorkspace = (patch: Partial<NonNullable<SeikoOrder["workspace"]>>) => onChange({ ...order, workspace: { ...order.workspace, ...patch } });
  const toggleColumn = (id: string) => setHiddenColumns(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); persistWorkspace({ hiddenColumns: [...next] }); return next; });
  const showAllColumns = () => { setHiddenColumns(new Set()); persistWorkspace({ hiddenColumns: [] }); };
  const columnWidth = (id: string) => Math.max(72, Math.min(520, Math.round(columnWidths[id] || (id === "personId" ? 105 : 155))));
  const startColumnResize = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX, startWidth = columnWidth(id); let latest = startWidth;
    const move = (nativeEvent: PointerEvent) => { latest = Math.max(72, Math.min(520, Math.round(startWidth + nativeEvent.clientX - startX))); setColumnWidths(current => ({ ...current, [id]: latest })); };
    const stop = () => { window.removeEventListener("pointermove", move); const next = { ...(order.workspace?.columnWidths || {}), [id]: latest }; setColumnWidths(next); persistWorkspace({ columnWidths: next }); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const setSelectedAlignment = (alignment: "left" | "center" | "right") => {
    if (!selectedBounds) return;
    const ids = gridColumns.slice(selectedBounds.left, selectedBounds.right + 1).map(column => column.id);
    const next = { ...columnAlignments }; ids.forEach(id => { next[id] = alignment; }); setColumnAlignments(next); persistWorkspace({ columnAlignments: next });
  };
  const sortBySelectedColumn = (direction: 1 | -1) => {
    if (!selectedBounds) return;
    const column = gridColumns[selectedBounds.left]; if (!column) return;
    const next = [...order.records].sort((a, b) => direction * String(a.values[column.id] ?? "").localeCompare(String(b.values[column.id] ?? ""), undefined, { numeric: true, sensitivity: "base" }));
    commitRecords(next);
  };
  const insertRecordsAt = (index: number, count: number) => {
    let number = nextNumber();
    const inserted: OrderRecord[] = Array.from({ length: Math.max(1, count) }, () => ({ recordId: crypto.randomUUID(), personId: `P-${String(number++).padStart(4, "0")}`, values: {} }));
    commitRecords([...order.records.slice(0, index), ...inserted, ...order.records.slice(index)]);
  };'''
if orders.count(old) != 1:
    fail("workspace toggle-column marker missing")
orders = orders.replace(old, new, 1)

old = '    <div className="workspaceTools"><div className="workspaceAddTools"><label className="rowCountControl"><input aria-label="Number of rows to add" type="text" inputMode="numeric" value={rowCount} onFocus={event=>event.currentTarget.select()} onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>+ Add {rowsToAdd===1?"row":"rows"}</button></label><div className="columnControl" ref={columnControlRef}><button className="secondary" aria-expanded={columnMenuOpen} onClick={()=>setColumnMenuOpen(value=>!value)}>Columns</button>{columnMenuOpen&&<div className="columnMenu"><label><input type="checkbox" checked={!hiddenColumns.has("personId")} onChange={()=>toggleColumn("personId")}/>Person ID</label>{columns.map(column=><label key={column.id}><input type="checkbox" checked={!hiddenColumns.has(column.id)} onChange={()=>toggleColumn(column.id)}/>{column.label}</label>)}</div>}</div></div><span>{order.records.length} rows</span><input aria-label="Search rows" placeholder="Search rows" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></div>'
new = '''    <div className="workspaceSheetBar" role="toolbar" aria-label="Spreadsheet tools">
      <details className="workspaceSheetMenu"><summary>Edit</summary><div><button type="button" data-sheet-action="undo" disabled={!undoStack.length} onClick={undo}>Undo <kbd>Ctrl/Cmd+Z</kbd></button><button type="button" data-sheet-action="redo" disabled={!redoStack.length} onClick={redo}>Redo <kbd>Ctrl/Cmd+Y</kbd></button><button type="button" disabled={!selectedBounds} onClick={()=>void copySelection()}>Copy selection</button><button type="button" disabled={!selectedBounds} onClick={clearSelection}>Clear selection</button><button type="button" disabled={!selectedBounds || selectedBounds.bottom<=selectedBounds.top} onClick={fillDown}>Fill down</button></div></details>
      <details className="workspaceSheetMenu"><summary>Insert</summary><div><button type="button" onClick={()=>insertRecordsAt(selectedBounds ? selectedBounds.top : order.records.length, rowsToAdd)}>Insert {rowsToAdd} row{rowsToAdd===1?"":"s"} above</button><button type="button" onClick={()=>insertRecordsAt(selectedBounds ? selectedBounds.bottom + 1 : order.records.length, rowsToAdd)}>Insert {rowsToAdd} row{rowsToAdd===1?"":"s"} below</button></div></details>
      <div className="columnControl workspaceSheetColumns" ref={columnControlRef}><button type="button" className="workspaceSheetMenuButton" aria-expanded={columnMenuOpen} onClick={()=>setColumnMenuOpen(value=>!value)}>Columns</button>{columnMenuOpen&&<div className="columnMenu"><button type="button" className="columnMenuShowAll" onClick={showAllColumns}>Show all columns</button><label><input type="checkbox" checked={!hiddenColumns.has("personId")} onChange={()=>toggleColumn("personId")}/>Person ID</label>{columns.map(column=><label key={column.id}><input type="checkbox" checked={!hiddenColumns.has(column.id)} onChange={()=>toggleColumn(column.id)}/>{column.groupLabel} · {column.label}</label>)}</div>}</div>
      <details className="workspaceSheetMenu"><summary>Format</summary><div><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("left")}>Align left</button><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("center")}>Align centre</button><button type="button" disabled={!selectedBounds} onClick={()=>setSelectedAlignment("right")}>Align right</button></div></details>
      <details className="workspaceSheetMenu"><summary>Data</summary><div><button type="button" disabled={!selectedBounds} onClick={()=>sortBySelectedColumn(1)}>Sort A → Z</button><button type="button" disabled={!selectedBounds} onClick={()=>sortBySelectedColumn(-1)}>Sort Z → A</button></div></details>
      <span className="workspaceSheetHint">Drag column headers to move · drag the right edge to resize</span>
    </div>
    <div className="workspaceTools"><div className="workspaceAddTools"><label className="rowCountControl"><input aria-label="Number of rows to add" type="text" inputMode="numeric" value={rowCount} onFocus={event=>event.currentTarget.select()} onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>+ Add {rowsToAdd===1?"row":"rows"}</button></label></div><span>{order.records.length} rows</span><input aria-label="Search rows" placeholder="Search rows" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></div>'''
if orders.count(old) != 1:
    fail("workspace tools marker missing")
orders = orders.replace(old, new, 1)

old = '<div className="workspaceTableHelp">Drag to select cells. Drag the small square on the selection corner to copy. Backspace or Delete clears cells; Ctrl+C, Ctrl+V, Ctrl+Z and Ctrl+Y work normally.</div><div className="workspaceTableWrap"><table className="workspaceTable groupedWorkspace"><thead>'
new = '<div className="workspaceTableHelp">Drag to select cells. Drag the small square on the selection corner to copy. Backspace or Delete clears cells; Ctrl+C, Ctrl+V, Ctrl+Z and Ctrl+Y work normally.</div><div className="workspaceTableWrap"><table className="workspaceTable groupedWorkspace"><colgroup><col className="workspaceRowNumberCol"/>{!hiddenColumns.has("personId")&&<col style={{width:`${columnWidth("personId")}px`}}/>}{gridColumns.map(column=><col key={column.id} style={{width:`${columnWidth(column.id)}px`}}/>)}<col className="workspaceActionsCol"/></colgroup><thead>'
if orders.count(old) != 1:
    fail("workspace table marker missing")
orders = orders.replace(old, new, 1)

old = '{!hiddenColumns.has("personId")&&<th className="stickyId" rowSpan={2}>Person ID</th>}'
new = '{!hiddenColumns.has("personId")&&<th className="stickyId workspaceResizableHeader" rowSpan={2} style={{width:`${columnWidth("personId")}px`}}>Person ID<span className="columnResizeHandle" role="separator" aria-label="Resize Person ID column" onPointerDown={event=>startColumnResize(event,"personId")}/></th>}'
if orders.count(old) != 1:
    fail("Person ID header marker missing")
orders = orders.replace(old, new, 1)

old = '{groups.flatMap(group => group.columns.map(column => <th key={column.id} data-column-id={column.id} className="workspaceMovableColumnHeader">{column.label}{column.required && <small className="requiredLabel">required</small>}</th>))}'
new = '{groups.flatMap(group => group.columns.map(column => <th key={column.id} data-column-id={column.id} className="workspaceMovableColumnHeader workspaceResizableHeader" style={{width:`${columnWidth(column.id)}px`}}><span className="columnHeaderText">{column.label}{column.required && <small className="requiredLabel">required</small>}</span><span className="columnResizeHandle" role="separator" aria-label={`Resize ${column.label} column`} onPointerDown={event=>startColumnResize(event,column.id)}/></th>))}'
if orders.count(old) != 1:
    fail("movable header marker missing")
orders = orders.replace(old, new, 1)

old = '<td className={selected?"gridSelected":undefined} key={column.id} onMouseDown={event=>selectCell(event,rowIndex,columnIndex)}'
new = '<td className={selected?"gridSelected":undefined} key={column.id} data-align={columnAlignments[column.id] || "left"} style={{width:`${columnWidth(column.id)}px`}} onMouseDown={event=>selectCell(event,rowIndex,columnIndex)}'
if orders.count(old) != 1:
    fail("workspace data-cell marker missing")
orders = orders.replace(old, new, 1)
orders_path.write_text(orders)

# Shortcuts now invoke spreadsheet actions instead of the order menu.
replace_once(
    "app/workspace-shortcuts.tsx",
    '        clickMenuAction(page, event.shiftKey ? "Redo last change" : "Undo last change");',
    '        page.querySelector<HTMLButtonElement>(`[data-sheet-action="${event.shiftKey ? "redo" : "undo"}"]`)?.click();',
)
replace_once(
    "app/workspace-shortcuts.tsx",
    '        clickMenuAction(page, "Redo last change");',
    '        page.querySelector<HTMLButtonElement>(\'[data-sheet-action="redo"]\')?.click();',
)

# Locked Back style and spreadsheet ergonomics.
style_path = Path("app/order-enhancements.css")
styles = style_path.read_text()
styles += '''

/* Locked contextual Back navigation and spreadsheet workspace controls. */
.contextBackButton,.workspaceBackButton{display:inline-flex!important;align-items:center!important;width:max-content!important;min-height:30px!important;margin:0 0 5px!important;padding:4px 2px!important;border:0!important;background:transparent!important;box-shadow:none!important;color:var(--navy)!important;font-size:10px!important;font-weight:800!important;text-decoration:none!important;cursor:pointer!important}
.contextBackButton:hover,.workspaceBackButton:hover{text-decoration:underline!important;background:transparent!important}
.workspaceSheetBar{display:flex;align-items:center;gap:4px;min-height:36px;margin:6px 0 8px;padding:3px 5px;border:1px solid var(--line);border-radius:9px;background:var(--paper);position:relative;z-index:18}
.workspaceSheetMenu,.workspaceSheetColumns{position:relative}
.workspaceSheetMenu>summary,.workspaceSheetMenuButton{list-style:none;display:flex;align-items:center;min-height:28px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--navy);font-size:11px;font-weight:700;cursor:pointer}
.workspaceSheetMenu>summary::-webkit-details-marker{display:none}.workspaceSheetMenu[open]>summary,.workspaceSheetMenu>summary:hover,.workspaceSheetMenuButton:hover,.workspaceSheetMenuButton[aria-expanded="true"]{background:var(--pale)}
.workspaceSheetMenu>div,.workspaceSheetColumns>.columnMenu{position:absolute;z-index:60;top:calc(100% + 4px);left:0;min-width:210px;max-height:320px;overflow:auto;padding:5px;border:1px solid var(--line);border-radius:9px;background:var(--paper);box-shadow:0 14px 34px rgba(12,40,64,.14)}
.workspaceSheetMenu>div>button,.columnMenuShowAll{display:flex!important;justify-content:space-between;gap:14px;width:100%!important;min-height:31px;padding:6px 8px!important;border:0!important;border-radius:6px!important;background:transparent!important;color:var(--ink)!important;text-align:left!important;font-size:11px!important;cursor:pointer!important}
.workspaceSheetMenu>div>button:hover,.columnMenuShowAll:hover{background:var(--pale)!important}.workspaceSheetMenu>div>button:disabled{opacity:.42;cursor:default!important}.workspaceSheetMenu kbd{font:9px monospace;color:var(--muted)}
.workspaceSheetHint{margin-left:auto!important;padding-right:6px;font-size:9px!important;color:var(--muted)!important;white-space:nowrap}
.workspaceSheetColumns>.columnMenu{display:grid;gap:2px;min-width:265px}.workspaceSheetColumns>.columnMenu label{display:flex;align-items:center;gap:7px;min-height:28px;padding:4px 7px;border-radius:5px;font-size:10px}.workspaceSheetColumns>.columnMenu label:hover{background:var(--pale)}
.workspaceTable{table-layout:fixed!important}.workspaceTable th,.workspaceTable td{min-width:0!important;box-sizing:border-box!important}.workspaceRowNumberCol{width:44px!important}.workspaceActionsCol{width:72px!important}
.workspaceTable .workspaceRowHeaderCorner,.workspaceTable .workspaceRowHeader{width:44px!important;min-width:44px!important;max-width:44px!important;padding:6px 3px!important;text-align:center!important}
.workspaceResizableHeader{position:sticky!important}.columnHeaderText{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:7px}.workspaceMovableColumnHeader{cursor:grab}.workspaceMovableColumnHeader:active{cursor:grabbing}
.columnResizeHandle{position:absolute;z-index:8;top:0;right:-4px;width:8px;height:100%;cursor:col-resize;touch-action:none}.columnResizeHandle::after{content:"";position:absolute;top:20%;bottom:20%;left:3px;width:1px;background:rgba(255,255,255,.38)}
.workspaceTable td[data-align="left"] input,.workspaceTable td[data-align="left"] select{text-align:left}.workspaceTable td[data-align="center"] input,.workspaceTable td[data-align="center"] select{text-align:center}.workspaceTable td[data-align="right"] input,.workspaceTable td[data-align="right"] select{text-align:right}
@media(max-width:800px){.workspaceSheetBar{overflow-x:auto;align-items:flex-start}.workspaceSheetHint{display:none}.workspaceSheetMenu>div,.workspaceSheetColumns>.columnMenu{position:fixed;left:12px;right:12px;top:auto;width:auto;min-width:0}}
'''
style_path.write_text(styles)

# Labels: Value is a searchable text filter and person/package layouts are record-resolved.
label_path = Path("app/label-designer.tsx")
labels = label_path.read_text()
old = '        const matchesFilter = !recordFilterField || !recordFilterValue || (recordFilterField === "contains_product" ? packageProducts(record).includes(recordFilterValue) : recordFilterValueFor(record, recordFilterField) === recordFilterValue);'
new = '        const filterNeedle = recordFilterValue.trim().toLowerCase();\n        const matchesFilter = !recordFilterField || !filterNeedle || (recordFilterField === "contains_product" ? packageProducts(record).some(value => value.toLowerCase().includes(filterNeedle)) : recordFilterValueFor(record, recordFilterField).toLowerCase().includes(filterNeedle));'
if labels.count(old) != 1:
    fail("label filter matcher marker missing")
labels = labels.replace(old, new, 1)

old = '<label><span>Value</span><select value={recordFilterValue} disabled={!recordFilterField} onChange={event => setRecordFilterValue(event.target.value)}><option value="">All values</option>{recordFilterValues.map(value => <option key={value} value={value}>{value}</option>)}</select></label>'
new = '<label><span>Value</span><input type="search" list="label-record-filter-values" value={recordFilterValue} disabled={!recordFilterField} placeholder={recordFilterField ? "Type to filter values" : "Choose a field first"} onChange={event => setRecordFilterValue(event.target.value)}/><datalist id="label-record-filter-values">{recordFilterValues.map(value => <option key={value} value={value}/>)}</datalist></label>'
if labels.count(old) != 1:
    fail("label Value-select marker missing")
labels = labels.replace(old, new, 1)

old = '</div>{order && personDetailFields.length > 0 && sourceMode !== "product" && sourceMode !== "order" && <div className="classificationInformation">'
new = '</div>{purpose === "packing" && sourceMode === "person" && <p className="labelDynamicProductHint">Use <b>Applicable product</b> slots for mixed orders. The same layout position resolves the product, quantity and details from the current preview/print record; exact inapplicable product fields are not offered here.</p>}{order && personDetailFields.length > 0 && sourceMode !== "product" && sourceMode !== "order" && <div className="classificationInformation">'
if labels.count(old) != 1:
    fail("dynamic product hint marker missing")
labels = labels.replace(old, new, 1)

labels = labels.replace('className="secondary" onClick={onBack}>← Back to order</button>', 'className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>')
labels = labels.replace('className="secondary" onClick={onBack}>← Back</button>', 'className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>')

old = '''    const actualPersonField = key.startsWith("field:") || key.startsWith("trace_field:");
    const genericWorkpiece = key === "name";
    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position";
    const productionOnly = key === "bundle_summary" || key === "unit_position";
    if (purpose === "inventory") return !actualPersonField && !genericWorkpiece && !packingOnly && !productionOnly;
    if (purpose === "packing") return !genericWorkpiece && !productionOnly && key !== "variation_count" && !(source === "person" && key === "product");'''
new = '''    const actualPersonField = key.startsWith("field:") || key.startsWith("trace_field:");
    const genericWorkpiece = key === "name";
    const packageSlot = key.startsWith("package_product:");
    const exactProductField = key.startsWith("product_name:") || key.startsWith("product_quantity:") || key.startsWith("measurement:") || key.startsWith("spec:");
    const packingOnly = key === "product_summary" || key === "people_count" || key === "package_position" || packageSlot;
    const productionOnly = key === "bundle_summary" || key === "unit_position";
    if (packageSlot) return purpose === "packing" && source === "person";
    if (purpose === "inventory") return !actualPersonField && !genericWorkpiece && !packingOnly && !productionOnly;
    if (purpose === "packing") return !genericWorkpiece && !productionOnly && key !== "variation_count" && !(source === "person" && (key === "product" || exactProductField));'''
if labels.count(old) != 1:
    fail("field relevance marker missing")
labels = labels.replace(old, new, 1)

old = 'people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], traceGroups = order?.fields.filter(field => field.name.trim()).map(field => ({ key: `trace_field:${field.id}`, label: `Number within ${field.name}` })) || [], productBasics = order?.products.filter(product => product.name.trim()).flatMap(product => [{ key: `product_name:${product.id}`, label: `${product.name} · Product` }, { key: `product_quantity:${product.id}`, label: `${product.name} · Quantity` }]) || [], measurements ='
new = 'people = order?.fields.map(field => ({ key: `field:${field.id}`, label: `Person detail · ${field.name}` })) || [], traceGroups = order?.fields.filter(field => field.name.trim()).map(field => ({ key: `trace_field:${field.id}`, label: `Number within ${field.name}` })) || [], packageSlots = order?.products.filter(product => product.name.trim()).flatMap((_, index) => { const slot = index + 1; return [{ key: `package_product:${slot}:name`, label: `Applicable product ${slot} · Product` }, { key: `package_product:${slot}:quantity`, label: `Applicable product ${slot} · Quantity` }, { key: `package_product:${slot}:details`, label: `Applicable product ${slot} · Details` }]; }) || [], productBasics = order?.products.filter(product => product.name.trim()).flatMap(product => [{ key: `product_name:${product.id}`, label: `${product.name} · Product` }, { key: `product_quantity:${product.id}`, label: `${product.name} · Quantity` }]) || [], measurements ='
if labels.count(old) != 1:
    fail("label-field registry package-slot marker missing")
labels = labels.replace(old, new, 1)

old = 'values = [...base, ...people, ...traceGroups, ...productBasics, ...measurements, ...specifications];'
new = 'values = [...base, ...people, ...traceGroups, ...packageSlots, ...productBasics, ...measurements, ...specifications];'
if labels.count(old) != 1:
    fail("label-field registry values marker missing")
labels = labels.replace(old, new, 1)

marker = 'function orderLabelRows(order: SeikoOrder, source: SourceMode) {'
helper = '''function labelQuantityForRecord(order: SeikoOrder, product: SeikoOrder["products"][number], record: SeikoOrder["records"][number], recordIndex: number) {
    const quantity = quantityForRecord(product, record, recordIndex === 0);
    if (quantity <= 0) return 0;
    const explicitQuantity = [`product:${product.id}:qty`, `product:${product.id}:qty_override`].some(key => hasLabelValue(record.values[key]));
    if (explicitQuantity) return quantity;
    if (product.quantityMode === "by_group" && product.quantityGroupFieldId) {
        const sourceValue = String(record.values[`field:${product.quantityGroupFieldId}`] || "");
        if ((product.quantityGroupRules || []).some(rule => groupRuleMatches(rule.match, sourceValue))) return quantity;
    }
    const evidenceColumns = workspaceColumns(order).filter(column => column.groupId === `product:${product.id}` && (column.id.startsWith("measurement:") || column.id.startsWith("spec:")));
    if (!evidenceColumns.length) return quantity;
    const orderUsesProductEvidence = order.records.some(candidate => evidenceColumns.some(column => hasLabelValue(candidate.values[column.id])));
    if (!orderUsesProductEvidence) return quantity;
    return evidenceColumns.some(column => hasLabelValue(record.values[column.id])) ? quantity : 0;
}
function orderLabelRows(order: SeikoOrder, source: SourceMode) {'''
if labels.count(marker) != 1:
    fail("orderLabelRows marker missing")
labels = labels.replace(marker, helper, 1)

old = 'const qty = product ? quantityForRecord(product, record, recordIndex === 0) : 1;'
new = 'const qty = product ? labelQuantityForRecord(order, product, record, recordIndex) : 1;'
if labels.count(old) != 1:
    fail("label quantity call marker missing")
labels = labels.replace(old, new, 1)

old = 'source === "person" ? personPackageRows(base, personPackagePlan, includedProducts)'
new = 'source === "person" ? personPackageRows(base, order, personPackagePlan, includedProducts)'
if labels.count(old) != 1:
    fail("personPackageRows call marker missing")
labels = labels.replace(old, new, 1)

old = 'function personPackageRows(rows: RecordRow[], plan: PersonPackagePlan = "together", includedProducts: string[] = [])'
new = 'function personPackageRows(rows: RecordRow[], order: SeikoOrder, plan: PersonPackagePlan = "together", includedProducts: string[] = [])'
if labels.count(old) != 1:
    fail("personPackageRows signature marker missing")
labels = labels.replace(old, new, 1)

marker = 'function personPackageRows(rows: RecordRow[], order: SeikoOrder, plan: PersonPackagePlan = "together", includedProducts: string[] = [])'
helper = '''function packageItemDetails(order: SeikoOrder, row: RecordRow) {
    const productId = row.values.product_id;
    const product = order.products.find(item => item.id === productId);
    if (!product) return "";
    const details: string[] = [];
    for (const measurement of order.measurements.filter(item => item.appliesTo.includes(productId) && item.name.trim())) {
        const value = row.values[`measurement:${measurement.id}:product:${productId}`];
        if (hasLabelValue(value)) details.push(`${measurement.name}: ${value}`);
    }
    for (const specification of product.specifications.filter(item => item.name.trim())) {
        const value = row.values[`spec:${specification.id}`];
        if (hasLabelValue(value)) details.push(`${specification.name}: ${value}`);
    }
    return details.join(" · ");
}
'''
if labels.count(marker) != 1:
    fail("packageItemDetails insertion marker missing")
labels = labels.replace(marker, helper + marker, 1)

old = 'packageProductNames = packageItems.map(item => item.product); return { ...first, id: `person:${recordId}:${suffix}`, group: position, product: packageProductNames.join(", "), qty, token: `${first.token.split(":").slice(0, 2).join(":")}:package:${suffix}`, values: { ...Object.assign({}, ...packageItems.map(item => item.values)), product: packageProductNames.join(", "), product_summary: contents, package_products: JSON.stringify(packageProductNames), qty, resolved_quantity: quantityBreakdown, quantity_total: qty, package_position: position } };'
new = 'packageProductNames = packageItems.map(item => item.product), packageProductIds = packageItems.map(item => item.values.product_id), slotValues = Object.fromEntries(packageItems.flatMap((item, index) => { const slot = index + 1; return [[`package_product:${slot}:name`, item.product], [`package_product:${slot}:quantity`, item.qty], [`package_product:${slot}:details`, packageItemDetails(order, item)]]; })); return { ...first, id: `person:${recordId}:${suffix}`, group: position, product: packageProductNames.join(", "), qty, token: `${first.token.split(":").slice(0, 2).join(":")}:package:${suffix}`, values: { ...Object.assign({}, ...packageItems.map(item => item.values)), ...slotValues, product: packageProductNames.join(", "), product_summary: contents, package_products: JSON.stringify(packageProductNames), package_product_ids: JSON.stringify(packageProductIds), qty, resolved_quantity: quantityBreakdown, quantity_total: qty, package_position: position } };'
if labels.count(old) != 1:
    fail("person-package slot-value marker missing")
labels = labels.replace(old, new, 1)
label_path.write_text(labels)

# Filter input + mixed-order explanation styling.
label_style_path = Path("app/label-designer.css")
label_styles = label_style_path.read_text()
label_styles += '''

/* Accurate record filtering and mixed-order product slots. */
.recordFilterBar input[type="search"]{box-sizing:border-box;width:100%;height:36px;border:1px solid var(--line);border-radius:8px;padding:0 9px;background:var(--paper);color:var(--ink);font-size:10px}.recordFilterBar input[type="search"]:disabled{background:color-mix(in srgb,var(--app-background) 68%,var(--paper));color:var(--muted)}
.labelDynamicProductHint{margin:8px 0 0;padding:8px 10px;border:1px solid color-mix(in srgb,var(--gold) 55%,var(--line));border-radius:8px;background:color-mix(in srgb,var(--pale) 32%,var(--paper));color:var(--muted);font-size:10px;line-height:1.4}.labelDynamicProductHint b{color:var(--navy)}
'''
label_style_path.write_text(label_styles)

# Lock the corrected behavior in the acceptance spec.
acceptance_path = Path("SEIKO_STAGE2_ACCEPTANCE.md")
acceptance = acceptance_path.read_text()
changes = [
    (
        '- The source-owned three-dot workspace menu contains the shared Status control, Save now, Labels, Edit setup, Put on hold/Resume, Undo/Redo, Save & close, Archive order, Delete order and Close without saving. An enhancement layer must not create a competing second menu.',
        '- The source-owned three-dot workspace menu is order-level only: shared Status, Save now, Labels, Edit setup, Save & close, Archive order, Delete order and Close without saving. Hold/resume exists only through Status, while Undo/Redo and spreadsheet operations live in the workspace spreadsheet toolbar.',
    ),
    (
        '- Column headers use the same click/Shift/Ctrl-or-Cmd selection model. Selected rows and selected columns can be dragged to a new position; the reorder is persisted in order data rather than merely moving DOM elements.',
        '- Column headers use the same click/Shift/Ctrl-or-Cmd selection model. Selected rows and selected columns can be dragged to a new position; column widths can be resized from the header edge; order, hidden columns, widths and alignment are persisted in order data rather than merely moving DOM elements.',
    ),
    (
        '- Each configured product can expose its own Product and Quantity fields plus its configured measurements/specifications, so operators can independently select information for Shirt, Ijar, Kurti, etc.',
        '- Product-specific fields remain available where a label genuinely identifies that product. Person/package labels instead expose reusable Applicable product slots (name, quantity and details), so one layout position resolves the actual Shirt, Kurti or other applicable product for each record and never displays an inapplicable product merely because it exists on the order.',
    ),
    (
        '- Record search covers all order data. Filter controls are derived from actual representation and order data; visible records must be derived from those filters and sort choices, not merely display controls that do nothing.',
        '- Record search covers all order data. Filter controls are derived from actual representation and order data; the Value control is writable/searchable with order-derived suggestions, and visible records are derived from those filters and sort choices rather than merely display controls that do nothing.',
    ),
]
for old, new in changes:
    if old not in acceptance:
        fail(f"acceptance marker missing: {old[:70]}")
    acceptance = acceptance.replace(old, new, 1)
acceptance_path.write_text(acceptance)

# Existing audit contract must not force retired order-menu sheet controls back.
audit_path = Path("tests/seiko-stage2-audit-contract.test.mjs")
audit = audit_path.read_text()
old = '  assert.match(orders, /Put order on hold/);\n'
if old not in audit:
    fail("audit hold assertion marker missing")
audit = audit.replace(old, '  assert.doesNotMatch(orders, />Put order on hold<\\/button>/);\n', 1)
marker = '  assert.match(orders, /workspaceBackButton/);\n'
if marker not in audit:
    fail("audit workspace Back assertion marker missing")
audit = audit.replace(marker, marker + '  assert.match(orders, /workspaceSheetBar/);\n  assert.match(orders, /columnResizeHandle/);\n  assert.match(orders, /data-sheet-action="undo"/);\n  assert.doesNotMatch(orders, />Undo last change<\\/button>/);\n  assert.doesNotMatch(orders, />Redo last change<\\/button>/);\n', 1)
audit_path.write_text(audit)

# Focused regression coverage for this review pass.
Path("tests/seiko-workspace-label-accuracy-contract.test.mjs").write_text('''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("app/seiko-phase1.tsx");
const orders = read("app/orders.tsx");
const domain = read("app/lib/order-domain.ts");
const shortcuts = read("app/workspace-shortcuts.tsx");
const labels = read("app/label-designer.tsx");

test("Home clear filters is always a working reset", () => {
  assert.match(home, /aria-label="Clear all order filters"/);
  assert.match(home, /clearFilters\\(\\);setFiltersOpen\\(false\\)/);
  assert.doesNotMatch(home, /disabled=\\{!activeFilterCount\\} onClick=\\{clearFilters\\}/);
});

test("workspace separates order actions from spreadsheet actions", () => {
  assert.match(orders, /workspaceSheetBar/);
  assert.match(orders, /data-sheet-action="undo"/);
  assert.match(orders, /data-sheet-action="redo"/);
  assert.doesNotMatch(orders, />Put order on hold<\\/button>/);
  assert.doesNotMatch(orders, />Undo last change<\\/button>/);
  assert.match(shortcuts, /data-sheet-action/);
});

test("workspace column widths and display preferences are persisted", () => {
  assert.match(domain, /columnWidths\\?: Record<string, number>/);
  assert.match(domain, /hiddenColumns\\?: string\\[\\]/);
  assert.match(domain, /columnAlignments\\?: Record<string/);
  assert.match(orders, /columnResizeHandle/);
  assert.match(orders, /startColumnResize/);
  assert.match(orders, /persistWorkspace\\(\\{ columnWidths:/);
  assert.match(orders, /workspaceRowNumberCol/);
});

test("label Value filter is writable and fuzzy-searches resolved values", () => {
  assert.match(labels, /type="search" list="label-record-filter-values"/);
  assert.match(labels, /Type to filter values/);
  assert.match(labels, /\\.toLowerCase\\(\\)\\.includes\\(filterNeedle\\)/);
});

test("person package layouts use record-resolved applicable product slots", () => {
  assert.match(labels, /package_product:\\$\\{slot\\}:name/);
  assert.match(labels, /package_product:\\$\\{slot\\}:quantity/);
  assert.match(labels, /package_product:\\$\\{slot\\}:details/);
  assert.match(labels, /labelQuantityForRecord/);
  assert.match(labels, /orderUsesProductEvidence/);
  assert.match(labels, /Applicable product/);
  assert.match(labels, /source === "person" && \\(key === "product" \\|\\| exactProductField\\)/);
});
''')
