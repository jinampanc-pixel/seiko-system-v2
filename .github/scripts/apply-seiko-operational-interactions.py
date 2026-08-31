from pathlib import Path
import re


def read(path): return Path(path).read_text(encoding='utf-8').replace('\r\n','\n')
def write(path, text): Path(path).write_text(text, encoding='utf-8')
def rep(text, old, new, label):
    if old not in text: raise RuntimeError(f'missing target: {label}')
    return text.replace(old, new, 1)
def sub(text, pattern, new, label):
    out, n = re.subn(pattern, lambda m: new, text, count=1, flags=re.S)
    if n != 1: raise RuntimeError(f'missing regex target: {label}')
    return out

# Shared order status vocabulary + persisted workspace column order.
p='app/lib/order-domain.ts'; t=read(p)
t=rep(t,
'''export type OrderStatus = "Draft" | "Active" | "On Hold" | "Completed" | "Cancelled";''',
'''export const ORDER_STATUSES = ["Draft", "Active", "Production", "QC 1", "Packing", "QC 2", "On Hold", "Completed", "Cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];''','order statuses')
t=rep(t,
'''export type SeikoOrder = { orderId: string; status: OrderStatus; archived: boolean; details: OrderDetails; fields: OrderField[]; products: ProductPolicy[]; measurements: MeasurementPolicy[]; records: OrderRecord[]; revisions: OrderRevision[]; updatedAt: string };''',
'''export type SeikoOrder = { orderId: string; status: OrderStatus; archived: boolean; details: OrderDetails; fields: OrderField[]; products: ProductPolicy[]; measurements: MeasurementPolicy[]; records: OrderRecord[]; revisions: OrderRevision[]; updatedAt: string; workspace?: { columnOrder?: string[] } };''','workspace metadata')
t=rep(t,
'''  return columns;
}''',
'''  const savedOrder = order.workspace?.columnOrder || [];
  if (!savedOrder.length) return columns;
  const rank = new Map(savedOrder.map((id, index) => [id, index]));
  return [...columns].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}''','workspace column sort')
write(p,t)

# Order source: shared statuses, real workspace menu, editable row/page counts, state-backed reorder events.
p='app/orders.tsx'; t=read(p)
t=rep(t,
'''import { blankMeasurement, blankProduct, blankSpecification, CLIENT_TYPE_PRESETS, field, orderStoreKey, readinessIssues, saveRevision, validateOrder, workspaceColumns, type ArtworkAttachment, type OrderField, type OrderRecord, type OrderStatus, type SeikoOrder } from "./lib/order-domain";''',
'''import { blankMeasurement, blankProduct, blankSpecification, CLIENT_TYPE_PRESETS, field, ORDER_STATUSES, orderStoreKey, readinessIssues, saveRevision, validateOrder, workspaceColumns, type ArtworkAttachment, type OrderField, type OrderRecord, type OrderStatus, type SeikoOrder } from "./lib/order-domain";''','orders status import')
t=rep(t,
'''if (view === "workspace" && current) return <OrderWorkspace businessId={businessId} canManageSuggestions={canManageSuggestions} order={current} onOpenLabelBatches={()=>onOpenLabelBatches?.(current)} onChange={setCurrent} onEditSetup={() => setView("setup")} onSave={(close) => save(current, "Order saved", close)} onClose={() => { if (confirm("Close without saving the latest changes? The last saved revision remains safe.")) { setView("center"); setCurrent(null); } }}/>''',
'''if (view === "workspace" && current) return <OrderWorkspace businessId={businessId} canManageSuggestions={canManageSuggestions} order={current} onOpenLabelBatches={()=>onOpenLabelBatches?.(current)} onChange={setCurrent} onEditSetup={() => setView("setup")} onSave={(close) => save(current, "Order saved", close)} onArchive={() => { persist(orders.map(item => item.orderId === current.orderId ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item)); setView("center"); setCurrent(null); }} onDelete={() => { if (!confirm(`Delete order ${current.details.orderNo}? This permanently removes the order from this business.`)) return; persist(orders.filter(item => item.orderId !== current.orderId)); setView("center"); setCurrent(null); }} onClose={() => { if (confirm("Close without saving the latest changes? The last saved revision remains safe.")) { setView("center"); setCurrent(null); } }}/>''','workspace callbacks')
t=t.replace('''{(["Draft","Active","On Hold","Completed","Cancelled"] as OrderStatus[]).map(status=><option key={status}>{status}</option>)}''','''{ORDER_STATUSES.map(status=><option key={status}>{status}</option>)}''')
t=rep(t,
'''function OrderWorkspace({ businessId, canManageSuggestions, order, onChange, onEditSetup, onOpenLabelBatches, onSave, onClose }: { businessId: string; canManageSuggestions: boolean; order: SeikoOrder; onChange: (order: SeikoOrder) => void; onEditSetup: () => void; onOpenLabelBatches: () => void; onSave: (close: boolean) => void; onClose: () => void }) {''',
'''function OrderWorkspace({ businessId, canManageSuggestions, order, onChange, onEditSetup, onOpenLabelBatches, onSave, onArchive, onDelete, onClose }: { businessId: string; canManageSuggestions: boolean; order: SeikoOrder; onChange: (order: SeikoOrder) => void; onEditSetup: () => void; onOpenLabelBatches: () => void; onSave: (close: boolean) => void; onArchive: () => void; onDelete: () => void; onClose: () => void }) {''','workspace signature')
t=rep(t,
'''  const [pageSize, setPageSize] = useState(50);
  const [rowCount, setRowCount] = useState(1);''',
'''  const [pageSize, setPageSize] = useState(50);
  const [pageSizeDraft, setPageSizeDraft] = useState("50");
  const [rowCount, setRowCount] = useState("1");''','editable counts state')
t=rep(t,
'''  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnControlRef = useRef<HTMLDivElement>(null);''',
'''  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnControlRef = useRef<HTMLDivElement>(null);
  const rowsToAdd = Math.max(1, Math.min(5000, Math.floor(Number(rowCount) || 1)));
  const commitPageSize = () => { const next = Math.max(1, Math.min(5000, Math.floor(Number(pageSizeDraft) || 1))); setPageSize(next); setPageSizeDraft(String(next)); setPage(1); };''','editable count helpers')
t=rep(t,
'''  const gridColumns = columns.filter(column => !hiddenColumns.has(column.id));
  const groups = gridColumns.reduce<Array<{ id: string; label: string; columns: typeof columns }>>((result, column) => {''',
'''  const visibleColumns = columns.filter(column => !hiddenColumns.has(column.id));
  const groups = visibleColumns.reduce<Array<{ id: string; label: string; columns: typeof columns }>>((result, column) => {''','visible column grouping')
t=rep(t,
'''  }, []);
  const filtered = order.records.filter''',
'''  }, []);
  const gridColumns = groups.flatMap(group => group.columns);
  const filtered = order.records.filter''','grouped grid columns')
# Add state-backed reorder listeners before selection logic.
t=rep(t,
'''  const updateRecord = (recordId: string, columnId: string, value: string) => commitRecords(order.records.map(record => record.recordId === recordId ? { ...record, values: { ...record.values, [columnId]: value } } : record));
  const selectCell =''',
'''  const updateRecord = (recordId: string, columnId: string, value: string) => commitRecords(order.records.map(record => record.recordId === recordId ? { ...record, values: { ...record.values, [columnId]: value } } : record));
  useEffect(() => {
    const reorderRows = (event: Event) => {
      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;
      if (!detail?.ids?.length || !detail.targetId) return;
      const ids = new Set(detail.ids);
      const moving = order.records.filter(record => ids.has(record.recordId));
      const rest = order.records.filter(record => !ids.has(record.recordId));
      const target = rest.findIndex(record => record.recordId === detail.targetId);
      const at = target < 0 ? rest.length : target;
      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
      commitRecords(next);
    };
    const reorderColumns = (event: Event) => {
      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;
      if (!detail?.ids?.length || !detail.targetId) return;
      const all = columns.map(column => column.id);
      const ids = new Set(detail.ids);
      const moving = all.filter(id => ids.has(id));
      const rest = all.filter(id => !ids.has(id));
      const target = rest.indexOf(detail.targetId);
      const at = target < 0 ? rest.length : target;
      const columnOrder = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
      onChange({ ...order, workspace: { ...order.workspace, columnOrder } });
    };
    window.addEventListener("seiko:workspace-reorder-rows", reorderRows);
    window.addEventListener("seiko:workspace-reorder-columns", reorderColumns);
    return () => { window.removeEventListener("seiko:workspace-reorder-rows", reorderRows); window.removeEventListener("seiko:workspace-reorder-columns", reorderColumns); };
  }, [columns, order]);
  const selectCell =''','workspace reorder listeners')
# replace header/menu area
old='''<div className="orderPageHead workspaceHead"><div><p className="eyebrow">ORDER WORKSPACE · {order.status}</p><h2>{order.details.orderNo} · {order.details.clientName}</h2><p>{order.details.clientType} · {order.products.map(item => item.name).filter(Boolean).join(", ")}</p></div><div className="workspaceHeadActions"><label className="workspaceStatusControl"><span>Status</span><select value={order.status} onChange={event => onChange({ ...order, status: event.target.value as OrderStatus })}>{(["Draft", "Active", "On Hold", "Completed", "Cancelled"] as OrderStatus[]).map(status => <option key={status}>{status}</option>)}</select></label><button type="button" className="primary workspaceQuickSave" onClick={()=>onSave(false)}>Save</button><div ref={orderMenuRef}><button type="button" className="orderActionMenuButton" aria-label="More order actions" aria-expanded={orderMenuOpen} onClick={()=>{setLabelMenuOpen(false);setOrderMenuOpen(value=>!value)}}><span/><span/><span/></button>{orderMenuOpen&&<div className="orderActionMenu"><button onClick={()=>{setOrderMenuOpen(false);onOpenLabelBatches();}}>Labels</button><button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><div className="orderMenuDivider"/><button disabled={!undoStack.length} onClick={()=>{setOrderMenuOpen(false);undo();}}>Undo last change</button><button disabled={!redoStack.length} onClick={()=>{setOrderMenuOpen(false);redo();}}>Redo last change</button><div className="orderMenuDivider"/><button className="orderMenuPrimary" onClick={()=>{setOrderMenuOpen(false);onSave(true);}}>Save & close</button><button className="orderMenuDanger" onClick={()=>{setOrderMenuOpen(false);onClose();}}>Close without saving</button></div>}</div></div></div>'''
new='''<div className="orderPageHead workspaceHead"><div><p className="eyebrow">ORDER WORKSPACE · {order.status}</p><h2>{order.details.orderNo} · {order.details.clientName}</h2><p>{order.details.clientType} · {order.products.map(item => item.name).filter(Boolean).join(", ")}</p></div><div className="workspaceHeadActions"><label className="workspaceStatusControl workspaceHeaderSecondaryAction"><span>Status</span><select value={order.status} onChange={event => onChange({ ...order, status: event.target.value as OrderStatus })}>{ORDER_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label><button type="button" className="primary workspaceQuickSave workspaceHeaderSecondaryAction" onClick={()=>onSave(false)}>Save</button><div ref={orderMenuRef}><button type="button" className="orderActionMenuButton" aria-label="More order actions" aria-expanded={orderMenuOpen} onClick={()=>{setLabelMenuOpen(false);setOrderMenuOpen(value=>!value)}}><span/><span/><span/></button>{orderMenuOpen&&<div className="orderActionMenu"><label className="workspaceNativeMenuStatus"><span>Status</span><select value={order.status} onChange={event => onChange({ ...order, status: event.target.value as OrderStatus })}>{ORDER_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label><button className="orderMenuPrimary workspaceMenuSaveNow" onClick={()=>onSave(false)}>Save now</button><button onClick={()=>{setOrderMenuOpen(false);onOpenLabelBatches();}}>Labels</button><button onClick={()=>{setOrderMenuOpen(false);onEditSetup();}}>Edit setup</button><button onClick={()=>onChange({ ...order, status: order.status === "On Hold" ? "Active" : "On Hold" })}>{order.status === "On Hold" ? "Resume order" : "Put order on hold"}</button><div className="orderMenuDivider"/><button disabled={!undoStack.length} onClick={()=>{setOrderMenuOpen(false);undo();}}>Undo last change</button><button disabled={!redoStack.length} onClick={()=>{setOrderMenuOpen(false);redo();}}>Redo last change</button><div className="orderMenuDivider"/><button className="orderMenuPrimary" onClick={()=>{setOrderMenuOpen(false);onSave(true);}}>Save & close</button><button onClick={()=>{setOrderMenuOpen(false);onArchive();}}>Archive order</button><button className="orderMenuDanger" onClick={()=>{setOrderMenuOpen(false);onDelete();}}>Delete order</button><button className="orderMenuDanger" onClick={()=>{setOrderMenuOpen(false);onClose();}}>Close without saving</button></div>}</div></div></div>'''
t=rep(t,old,new,'native workspace menu')
# editable add rows
t=rep(t,
'''<label className="rowCountControl"><input aria-label="Number of rows to add" type="number" min="1" max="5000" value={rowCount} onFocus={event=>event.currentTarget.select()} onClick={event=>event.currentTarget.select()} onChange={event => setRowCount(Math.max(1, Number(event.target.value) || 1))}/><button className="primary" onClick={() => addRecords(rowCount)}>+ Add {rowCount===1?"row":"rows"}</button></label>''',
'''<label className="rowCountControl"><input aria-label="Number of rows to add" type="text" inputMode="numeric" value={rowCount} onFocus={event=>event.currentTarget.select()} onChange={event => setRowCount(event.target.value.replace(/[^0-9]/g, ""))} onBlur={()=>setRowCount(String(rowsToAdd))}/><button className="primary" onClick={() => { addRecords(rowsToAdd); setRowCount(String(rowsToAdd)); }}>+ Add {rowsToAdd===1?"row":"rows"}</button></label>''','add rows editor')
# data hooks for DnD structure
t=rep(t,
'''<table className="workspaceTable groupedWorkspace"><thead><tr>{!hiddenColumns.has("personId")&&<th className="stickyId" rowSpan={2}>Person ID</th>}''',
'''<table className="workspaceTable groupedWorkspace"><thead><tr><th className="workspaceRowHeaderCorner" rowSpan={2} aria-label="Select all rows">#</th>{!hiddenColumns.has("personId")&&<th className="stickyId" rowSpan={2}>Person ID</th>}''','row selector corner')
t=rep(t,
'''{groups.flatMap(group => group.columns.map(column => <th key={column.id}>{column.label}{column.required && <small className="requiredLabel">required</small>}</th>))}''',
'''{groups.flatMap(group => group.columns.map(column => <th key={column.id} data-column-id={column.id} className="workspaceMovableColumnHeader">{column.label}{column.required && <small className="requiredLabel">required</small>}</th>))}''','column header hooks')
t=rep(t,
'''return <tr className={record.held?"recordHeld":undefined} key={record.recordId}>{!hiddenColumns.has("personId")&&<td className="personId stickyId">{record.personId}</td>}''',
'''return <tr className={record.held?"recordHeld":undefined} data-record-id={record.recordId} key={record.recordId}><th className="workspaceRowHeader" scope="row">{rowIndex + 1}</th>{!hiddenColumns.has("personId")&&<td className="personId stickyId">{record.personId}</td>}''','row header hooks')
# native editable page size
t=rep(t,
'''<div className="workspacePager"><span>Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span><label>Rows <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option>25</option><option>50</option><option>100</option></select></label>''',
'''<div className="workspacePager"><span>Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span><label>Rows <input aria-label="Rows per page" type="text" inputMode="numeric" value={pageSizeDraft} onChange={event=>setPageSizeDraft(event.target.value.replace(/[^0-9]/g, ""))} onBlur={commitPageSize} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();commitPageSize();event.currentTarget.blur();}}}/></label>''','native page size input')
write(p,t)

# Replace top pager enhancement so it proxies native editable inputs instead of mutating a React select.
p='app/workspace-top-pager.tsx'
write(p,'''"use client";

import { useEffect } from "react";
import { startDomEnhancement } from "./lib/dom-enhancement";

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enhanceRowCount(page: HTMLElement) {
  const input = page.querySelector<HTMLInputElement>('.rowCountControl input[aria-label="Number of rows to add"]');
  if (!input || input.dataset.replaceOnFocus === "true") return;
  input.dataset.replaceOnFocus = "true";
  input.addEventListener("focus", () => requestAnimationFrame(() => input.select()));
}

function realPager(page: HTMLElement) { return page.querySelector<HTMLElement>(":scope > .workspacePager:not(.workspacePagerTop)"); }
function clickReal(page: HTMLElement, label: string) {
  Array.from(realPager(page)?.querySelectorAll<HTMLButtonElement>("button") || []).find(item => item.textContent?.trim() === label)?.click();
}

function buildTopPager(page: HTMLElement) {
  const bottom = realPager(page), tools = page.querySelector<HTMLElement>(":scope > .workspaceTools");
  if (!bottom || !tools) return;
  let top = tools.querySelector<HTMLElement>(":scope > .workspacePagerTop");
  if (!top) { top = document.createElement("div"); top.className = "workspacePager workspacePagerTop"; top.setAttribute("aria-label", "Workspace pagination"); tools.appendChild(top); }
  if (top.matches(":focus-within")) return;
  const children = Array.from(bottom.children);
  const range = children.find(child => child instanceof HTMLSpanElement && /^Showing\s/i.test(child.textContent || ""));
  const pageStatus = children.find(child => child instanceof HTMLSpanElement && /^Page\s/i.test(child.textContent || ""));
  const native = bottom.querySelector<HTMLInputElement>('input[aria-label="Rows per page"]');
  const previous = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Previous");
  const next = Array.from(bottom.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "Next");
  top.replaceChildren();
  if (range) top.appendChild(range.cloneNode(true));
  const label = document.createElement("label"); label.append("Rows ");
  const input = document.createElement("input"); input.type = "text"; input.inputMode = "numeric"; input.className = "workspacePageSizeInput"; input.setAttribute("aria-label", "Rows per page"); input.value = native?.value || "50";
  const commit = () => { if (!native) return; const value = String(Math.max(1, Math.min(5000, Math.floor(Number(input.value) || 1)))); input.value = value; setInputValue(native, value); native.dispatchEvent(new Event("blur", { bubbles: true })); };
  input.addEventListener("change", commit); input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); commit(); input.blur(); } });
  label.appendChild(input); top.appendChild(label);
  const proxy = (source: HTMLButtonElement | undefined, text: string) => { const button=document.createElement("button"); button.type="button"; button.className=source?.className||"secondary"; button.textContent=text; button.disabled=Boolean(source?.disabled); button.addEventListener("click",()=>clickReal(page,text)); top!.appendChild(button); };
  proxy(previous,"Previous"); if (pageStatus) top.appendChild(pageStatus.cloneNode(true)); proxy(next,"Next");
}

function sync() { document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => { enhanceRowCount(page); buildTopPager(page); }); }
export function WorkspaceTopPager() {
  useEffect(() => {
    const controller = startDomEnhancement(sync, { observer: { childList:true, subtree:true, characterData:true }, shouldSchedule: mutations => mutations.some(mutation => !(mutation.target as HTMLElement).closest?.(".workspacePagerTop")) });
    return () => controller.stop();
  }, []);
  return null;
}
''')

# New Excel-like row/column selector and drag reorder enhancer; actual reorder goes back to React via custom events.
p='app/workspace-structure-interactions.tsx'
write(p,'''"use client";

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
function configureRows() {
  const rows = ordered<HTMLTableRowElement>(".workspaceTable tbody tr[data-record-id]");
  rows.forEach(row => {
    const id=row.dataset.recordId||"", handle=row.querySelector<HTMLElement>(".workspaceRowHeader"); if(!id||!handle||handle.dataset.structureReady)return;
    handle.dataset.structureReady="true"; handle.draggable=true; handle.title="Click to select row; Shift selects a range; Ctrl/Cmd adds rows; drag to move selected rows";
    handle.addEventListener("click", event => { const ids=rows.map(item=>item.dataset.recordId||""); if(event.shiftKey&&rowAnchor) selectRange(ids,rowAnchor,id,selectedRows); else if(event.ctrlKey||event.metaKey){selectedRows.has(id)?selectedRows.delete(id):selectedRows.add(id); rowAnchor=id;} else {selectedRows.clear();selectedRows.add(id);rowAnchor=id;} paint(); });
    handle.addEventListener("dragstart", event => { if(!selectedRows.has(id)){selectedRows.clear();selectedRows.add(id);rowAnchor=id;paint();} event.dataTransfer?.setData("text/plain","seiko-rows"); event.dataTransfer!.effectAllowed="move"; });
    handle.addEventListener("dragover", event => { event.preventDefault(); row.classList.add("workspaceStructureDropTarget"); });
    handle.addEventListener("dragleave",()=>row.classList.remove("workspaceStructureDropTarget"));
    handle.addEventListener("drop", event => { event.preventDefault(); row.classList.remove("workspaceStructureDropTarget"); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id}})); });
  });
  const corner=document.querySelector<HTMLElement>(".workspaceRowHeaderCorner"); if(corner&&!corner.dataset.structureReady){corner.dataset.structureReady="true";corner.addEventListener("click",()=>{selectedRows.clear();rows.forEach(row=>selectedRows.add(row.dataset.recordId||""));paint();});}
}
function configureColumns() {
  const cells=ordered<HTMLElement>(".workspaceMovableColumnHeader[data-column-id]");
  cells.forEach(cell=>{const id=cell.dataset.columnId||""; if(!id||cell.dataset.structureReady)return; cell.dataset.structureReady="true";cell.draggable=true;cell.title="Click to select column; Shift selects a range; Ctrl/Cmd adds columns; drag to move selected columns";
    cell.addEventListener("click",event=>{const ids=cells.map(item=>item.dataset.columnId||"");if(event.shiftKey&&columnAnchor)selectRange(ids,columnAnchor,id,selectedColumns);else if(event.ctrlKey||event.metaKey){selectedColumns.has(id)?selectedColumns.delete(id):selectedColumns.add(id);columnAnchor=id;}else{selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;}paint();});
    cell.addEventListener("dragstart",event=>{if(!selectedColumns.has(id)){selectedColumns.clear();selectedColumns.add(id);columnAnchor=id;paint();}event.dataTransfer?.setData("text/plain","seiko-columns");event.dataTransfer!.effectAllowed="move";});
    cell.addEventListener("dragover",event=>{event.preventDefault();cell.classList.add("workspaceStructureDropTarget");});cell.addEventListener("dragleave",()=>cell.classList.remove("workspaceStructureDropTarget"));
    cell.addEventListener("drop",event=>{event.preventDefault();cell.classList.remove("workspaceStructureDropTarget");window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id}}));});
  });
}
function enhance(){configureRows();configureColumns();paint();}
export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});return()=>controller.stop();},[]);return null;}
''')

# Mount new interaction enhancer.
p='app/app-enhancements.tsx'; t=read(p)
t=rep(t,'import { WorkspaceRowMenu } from "./workspace-row-menu";','import { WorkspaceRowMenu } from "./workspace-row-menu";\nimport { WorkspaceStructureInteractions } from "./workspace-structure-interactions";','structure import')
t=rep(t,'    <WorkspaceRowMenu />','    <WorkspaceRowMenu />\n    <WorkspaceStructureInteractions />','structure mount')
write(p,t)

# List center: richer statuses and archive inside filter panel.
p='app/seiko-list-center-enhancements.tsx'; t=read(p)
t=rep(t,'import type { SeikoOrder } from "./lib/order-domain";','import { ORDER_STATUSES, type SeikoOrder } from "./lib/order-domain";','list status import')
t=sub(t,r'const status = buildSelect\("Status", "status", \[\["", "All statuses"\].*?\], value => \{ filterState.status = value; applyOrderFilters\(page\); \}\);',
'''const status = buildSelect("Status", "status", [["", "All statuses"], ...ORDER_STATUSES.map(value => [value, value] as [string, string])], value => { filterState.status = value; applyOrderFilters(page); });''','status filter options')
t=rep(t,
'''  grid.append(status, type, product, delivery);
  bar.append(head, grid);''',
'''  const archivedNative = tools.querySelector<HTMLInputElement>('label input[type="checkbox"]');
  const archivedWrap = document.createElement("label"); archivedWrap.className = "orderAdvancedFilter archived";
  const archivedTitle = document.createElement("span"); archivedTitle.textContent = "Orders";
  const archivedToggle = document.createElement("label"); archivedToggle.className = "orderArchivedFilterToggle";
  const archivedProxy = document.createElement("input"); archivedProxy.type = "checkbox"; archivedProxy.checked = Boolean(archivedNative?.checked);
  archivedToggle.append(archivedProxy, document.createTextNode(" Archived only")); archivedWrap.append(archivedTitle, archivedToggle);
  archivedProxy.addEventListener("change", () => { if (!archivedNative || archivedNative.checked === archivedProxy.checked) return; archivedNative.click(); });
  if (archivedNative) archivedNative.closest("label")!.classList.add("orderArchivedNativeHidden");
  grid.append(status, type, product, delivery, archivedWrap);
  bar.append(head, grid);''','archive filter proxy')
write(p,t)

# Label engine: accurate hover details + quarter-mm free drag + edge/centre alignment + top blue Save label set.
p='app/label-designer.tsx'; t=read(p)
t=rep(t,
'''function recordPreviewText(record: RecordRow, sourceMode: SourceMode) {
    return [record.name, record.group, sourceMode === "person" ? record.values.product_summary : record.product, record.qty && `Total ${record.qty}`, record.order, record.client].filter(Boolean).join(" · ");
}''',
'''function recordPreviewText(record: RecordRow, sourceMode: SourceMode) {
    const personDetails = Object.entries(record.values).filter(([key, value]) => key.startsWith("field:") && String(value).trim()).map(([key, value]) => {
        const label = record.values[`field_name:${key}`] || key.replace(/^field:/, "Detail ");
        return `${label}: ${value}`;
    });
    const productDetail = sourceMode === "person" ? (record.values.product_summary ? `Products: ${record.values.product_summary}` : "") : [record.product && `Product: ${record.product}`, record.size && `Size: ${record.size}`, record.qty && `Qty: ${record.qty}`].filter(Boolean).join(" · ");
    return [productDetail, ...personDetails].filter(Boolean).join(" · ");
}''','accurate label hover')
old='''    const move = (e: ReactPointerEvent) => { const d = dragging.current, box = e.currentTarget.parentElement?.getBoundingClientRect(); if (!d || !box || !e.currentTarget.hasPointerCapture(e.pointerId))
        return; const item = items.find(i => i.id === d.id); if (!item)
        return; let x = d.x + (e.clientX - d.startX) * preset.labelW / box.width, y = d.y + (e.clientY - d.startY) * preset.labelH / box.height; if (snap) {
        x = Math.round(x);
        y = Math.round(y);
    } x = clamp(x, 0, preset.labelW - item.w); y = clamp(y, 0, preset.labelH - item.h); setActiveGuides({ x: guides && Math.abs(x + item.w / 2 - preset.labelW / 2) < .7, y: guides && Math.abs(y + item.h / 2 - preset.labelH / 2) < .7 }); update(item.id, { x, y }); };'''
new='''    const move = (e: ReactPointerEvent) => { const d = dragging.current, box = e.currentTarget.parentElement?.getBoundingClientRect(); if (!d || !box || !e.currentTarget.hasPointerCapture(e.pointerId)) return; const item = items.find(i => i.id === d.id); if (!item) return;
        const dx = (e.clientX - d.startX) * preset.labelW / box.width, dy = (e.clientY - d.startY) * preset.labelH / box.height;
        let x = d.x + dx, y = d.y + dy;
        if (e.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) y = d.y; else x = d.x; }
        if (snap && !e.altKey) { x = Math.round(x * 4) / 4; y = Math.round(y * 4) / 4; }
        let guideX = false, guideY = false;
        if (guides && !e.altKey) {
            const others = items.filter(other => other.id !== item.id);
            const xPoints = [x, x + item.w / 2, x + item.w], yPoints = [y, y + item.h / 2, y + item.h];
            const targetXs = [0, preset.labelW / 2, preset.labelW, ...others.flatMap(other => [other.x, other.x + other.w / 2, other.x + other.w])];
            const targetYs = [0, preset.labelH / 2, preset.labelH, ...others.flatMap(other => [other.y, other.y + other.h / 2, other.y + other.h])];
            let bestX = .36, adjustX = 0; xPoints.forEach(point => targetXs.forEach(target => { const delta = target - point; if (Math.abs(delta) < bestX) { bestX = Math.abs(delta); adjustX = delta; } }));
            let bestY = .36, adjustY = 0; yPoints.forEach(point => targetYs.forEach(target => { const delta = target - point; if (Math.abs(delta) < bestY) { bestY = Math.abs(delta); adjustY = delta; } }));
            if (bestX < .36) { x += adjustX; guideX = true; } if (bestY < .36) { y += adjustY; guideY = true; }
        }
        x = clamp(x, 0, preset.labelW - item.w); y = clamp(y, 0, preset.labelH - item.h); setActiveGuides({ x: guideX, y: guideY }); update(item.id, { x, y }); };'''
t=rep(t,old,new,'precise label drag')
# Header: add primary Save label set and remove duplicate from more menu.
t=rep(t,
'''{order && purpose && <details className="labelHeaderMore" open={labelWorkspaceMoreOpen}''',
'''{order && purpose && <button type="button" className="primary labelHeaderSaveSet" disabled={!selectedRows.length} onClick={saveLabelTask}>{activeTaskId ? "Update label set" : "Save label set"}</button>}{order && purpose && <details className="labelHeaderMore" open={labelWorkspaceMoreOpen}''','top save label set')
t=rep(t,
'''<button type="button" disabled={!selectedRows.length} onClick={() => { saveLabelTask(); setLabelWorkspaceMoreOpen(false); }}>{activeTaskId ? "Update label set" : "Save label set"}</button>''','', 'remove duplicate save set')
write(p,t)

# Label Ctrl+S choice modal that invokes true React save actions.
p='app/label-workspace-refinement.tsx'; t=read(p)
insert='''
function openLabelSaveChoice(page: HTMLElement) {
  document.querySelector(".labelSaveChoiceLayer")?.remove();
  const layer = document.createElement("div"); layer.className = "labelSaveChoiceLayer";
  layer.innerHTML = '<section class="labelSaveChoiceDialog" role="dialog" aria-modal="true" aria-labelledby="label-save-choice-title"><h3 id="label-save-choice-title">Save label work</h3><p>Choose what Ctrl/Cmd + S should save.</p><div><button type="button" class="primary saveSet">Save label set</button><button type="button" class="secondary saveLayout">Save layout</button><button type="button" class="textButton cancel">Cancel</button></div></section>';
  const close = () => layer.remove();
  layer.querySelector<HTMLButtonElement>(".cancel")?.addEventListener("click", close);
  layer.addEventListener("click", event => { if (event.target === layer) close(); });
  layer.querySelector<HTMLButtonElement>(".saveSet")?.addEventListener("click", () => { page.querySelector<HTMLButtonElement>(".labelHeaderSaveSet")?.click(); close(); });
  layer.querySelector<HTMLButtonElement>(".saveLayout")?.addEventListener("click", () => { const details=page.querySelector<HTMLDetailsElement>(".labelHeaderMore"); if(details) details.open=true; requestAnimationFrame(()=>{Array.from(page.querySelectorAll<HTMLButtonElement>(".labelHeaderMoreMenu button")).find(button=>/^(Save|Update) layout$/.test(button.textContent?.trim()||""))?.click(); close();}); });
  document.body.appendChild(layer); layer.querySelector<HTMLButtonElement>(".saveSet")?.focus();
}
'''
t=rep(t,'function enhancePage(page: HTMLElement) {',insert+'\nfunction enhancePage(page: HTMLElement) {','label save chooser helper')
t=rep(t,
'''    document.addEventListener("click", removeChip, true);''',
'''    const saveShortcut = (event: KeyboardEvent) => { if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "s") return; const page=document.querySelector<HTMLElement>(".labelDesignerPage"); if(!page) return; event.preventDefault(); event.stopImmediatePropagation(); openLabelSaveChoice(page); };
    document.addEventListener("keydown", saveShortcut, true);
    document.addEventListener("click", removeChip, true);''','label save shortcut')
t=rep(t,
'''      document.removeEventListener("click", removeChip, true);''',
'''      document.removeEventListener("keydown", saveShortcut, true);
      document.removeEventListener("click", removeChip, true);''','label save shortcut cleanup')
write(p,t)

# Operational UX: remove injected workspace menu, put status in Order Center meta, and add accurate product hover.
p='app/seiko-operational-ux.tsx'; t=read(p)
t=rep(t,'import type { SeikoOrder } from "./lib/order-domain";','import { groupRuleMatches, quantityForRecord, type SeikoOrder } from "./lib/order-domain";','operational quantity import')
# simplify home enhancer because Home React now owns the operational rows.
t=sub(t,r'function enhanceHome\(\) \{.*?\n\}\n\nfunction enhanceOrderCenter',
'''function enhanceHome() {
  document.querySelectorAll<HTMLElement>(".overview .moduleGrid .moduleCard").forEach(card => { if (card.querySelector("h3")?.textContent?.trim() === "Orders") card.hidden = true; });
}

function resolvedSpecification(order: SeikoOrder, product: SeikoOrder["products"][number], spec: SeikoOrder["products"][number]["specifications"][number]) {
  const values = new Set<string>();
  order.records.forEach((record, index) => {
    if (record.held || quantityForRecord(product, record, index === 0) <= 0) return;
    let value = spec.defaultValue || "";
    if (spec.mode === "per_person") value = String(record.values[`spec:${spec.id}`] || "");
    if (spec.mode === "default_with_exceptions") value = String(record.values[`spec:${spec.id}:override`] ?? spec.defaultValue ?? "");
    if (spec.mode === "by_group") { const source=spec.groupFieldId ? String(record.values[`field:${spec.groupFieldId}`] || "") : ""; value=(spec.groupRules||[]).find(rule=>groupRuleMatches(rule.match,source))?.value || spec.defaultValue || ""; }
    if (value.trim()) values.add(value.trim());
  });
  return [...values].join(", ");
}
function orderProductSummary(order: SeikoOrder) {
  return order.products.filter(product=>product.name.trim()).map(product=>{
    const total=order.records.reduce((sum,record,index)=>sum+(record.held?0:quantityForRecord(product,record,index===0)),0);
    const specs=product.specifications.filter(spec=>spec.role==="colour"||spec.role==="pattern"||/colou?r|pattern/i.test(spec.name)).map(spec=>{const value=resolvedSpecification(order,product,spec);return value?`${spec.name}: ${value}`:"";}).filter(Boolean);
    return `${product.name} · Qty ${total}${specs.length?` · ${specs.join(" · ")}`:""}`;
  });
}
function removeProductHover(){document.querySelector(".orderProductHoverCard")?.remove();}
function showProductHover(target: HTMLElement, order: SeikoOrder){removeProductHover();const card=document.createElement("div");card.className="orderProductHoverCard";const title=document.createElement("b");title.textContent=`${order.details.orderNo} products`;const body=document.createElement("div");orderProductSummary(order).forEach(line=>{const row=document.createElement("span");row.textContent=line;body.appendChild(row);});card.append(title,body);document.body.appendChild(card);const box=target.getBoundingClientRect(),measured=card.getBoundingClientRect();card.style.left=`${Math.max(8,Math.min(window.innerWidth-measured.width-8,box.left))}px`;card.style.top=`${Math.max(8,Math.min(window.innerHeight-measured.height-8,box.bottom+6))}px`;}

function enhanceOrderCenter''','replace home and product helpers')
# remove status badge creation if present and add status meta after delivery; use regex tolerant.
t=re.sub(r'\s*let badge = row\.querySelector<HTMLElement>\("\.orderCenterStatusBadge"\);.*?badge\.textContent = order\.status;','',t,flags=re.S)
t=rep(t,
'''      appendMetaItem(meta, "Client type", order.details.clientType || "—");
      appendMetaItem(meta, "Records", String(order.records.length));
      appendMetaItem(meta, "Products", String(order.products.filter(product => product.name.trim()).length));
      appendMetaItem(meta, "Delivery", deliveryState(order));''',
'''      appendMetaItem(meta, "Client type", order.details.clientType || "—");
      appendMetaItem(meta, "Records", String(order.records.length));
      const productMeta = appendMetaItem(meta, "Products", String(order.products.filter(product => product.name.trim()).length));
      productMeta.classList.add("orderProductMeta"); productMeta.tabIndex = 0;
      if (productMeta.dataset.productHoverReady !== "true") { productMeta.dataset.productHoverReady="true"; productMeta.addEventListener("pointerenter",()=>showProductHover(productMeta,order)); productMeta.addEventListener("pointerleave",removeProductHover); productMeta.addEventListener("focus",()=>showProductHover(productMeta,order)); productMeta.addEventListener("blur",removeProductHover); }
      appendMetaItem(meta, "Delivery", deliveryState(order));
      appendMetaItem(meta, "Status", order.status);''','order center operational meta')
# appendMetaItem currently void; make return node.
t=rep(t,'meta.appendChild(item);\n}', 'meta.appendChild(item);\n  return item;\n}', 'append meta return')
# simplify workspace enhancer, remove injected menu clone.
t=sub(t,r'function enhanceWorkspace\(\) \{.*?\n\}\n\nfunction enhanceSettings',
'''function enhanceWorkspace() {
  document.querySelectorAll<HTMLElement>(".workspacePage").forEach(page => {
    page.querySelector<HTMLElement>(".workspaceStatusControl")?.classList.add("workspaceHeaderSecondaryAction");
    page.querySelector<HTMLElement>(".workspaceQuickSave")?.classList.add("workspaceHeaderSecondaryAction");
    page.querySelector(".workspaceMenuOperational")?.remove();
  });
}

function enhanceSettings''','workspace enhancer ownership')
write(p,t)

# Home React dashboard: metric cards switch the one operational list between Active/Completed/Queue, status changes inline.
p='app/seiko-phase1.tsx'; t=read(p)
t=rep(t,'import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";','import { ORDER_STATUSES, orderStoreKey, type OrderStatus, type SeikoOrder } from "./lib/order-domain";','home status import')
start=t.index('function SeikoDashboard()')
prefix=t[:start]
func=r'''function SeikoDashboard() {
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [scanQueue, setScanQueue] = useState<Array<Record<string, unknown>>>([]);
  const [config, setConfig] = useState<HomeConfig>(() => readHomeConfig());
  const [customizing, setCustomizing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workMode, setWorkMode] = useState<MetricKey>("active");
  const [query, setQuery] = useState(""), [clientType, setClientType] = useState(""), [product, setProduct] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  useEffect(() => { const load=()=>{try{setOrders(JSON.parse(localStorage.getItem(orderStoreKey("seiko"))||"[]") as SeikoOrder[]);}catch{setOrders([]);}try{setScanQueue(JSON.parse(localStorage.getItem("jinam:seiko:scan-queue")||"[]") as Array<Record<string,unknown>>);}catch{setScanQueue([]);}};queueMicrotask(load);window.addEventListener("storage",load);window.addEventListener("seiko:orders-cache-updated",load as EventListener);const timer=window.setInterval(load,3000);return()=>{window.removeEventListener("storage",load);window.removeEventListener("seiko:orders-cache-updated",load as EventListener);window.clearInterval(timer);};},[]);
  useEffect(()=>{localStorage.setItem(HOME_KEY,JSON.stringify(config));document.querySelectorAll<HTMLButtonElement>(".overview .moduleGrid .moduleCard").forEach(card=>{const title=card.querySelector("h3")?.textContent?.trim();if(title==="Orders"){card.hidden=true;return;}if(title&&title in config.quickAccess)card.hidden=!config.quickAccess[title as QuickAccessKey];});},[config]);
  const activeOrders=useMemo(()=>orders.filter(order=>!order.archived&&!["Completed","Cancelled"].includes(order.status)),[orders]);
  const completedOrders=useMemo(()=>orders.filter(order=>!order.archived&&order.status==="Completed"),[orders]);
  const orderScope=workMode==="completed"?completedOrders:activeOrders;
  const clientTypes=useMemo(()=>[...new Set(orderScope.map(order=>order.details.clientType).filter(Boolean))].sort(),[orderScope]);
  const products=useMemo(()=>[...new Set(orderScope.filter(order=>!clientType||order.details.clientType===clientType).flatMap(order=>order.products.map(item=>item.name).filter(Boolean)))].sort(),[clientType,orderScope]);
  const filtered=useMemo(()=>orderScope.filter(order=>{if(clientType&&order.details.clientType!==clientType)return false;if(product&&!order.products.some(item=>item.name===product))return false;if(status&&order.status!==status)return false;const haystack=`${order.details.orderNo} ${order.details.clientName} ${order.details.clientType} ${order.status} ${order.products.map(item=>item.name).join(" ")}`.toLowerCase();return !query.trim()||haystack.includes(query.trim().toLowerCase());}),[clientType,orderScope,product,query,status]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/config.activeOrderPageSize)),safePage=Math.min(page,pageCount),visible=filtered.slice((safePage-1)*config.activeOrderPageSize,safePage*config.activeOrderPageSize),activeFilterCount=[query.trim(),status,clientType,product].filter(Boolean).length;
  useEffect(()=>setPage(1),[clientType,product,query,status,config.activeOrderPageSize,workMode]);
  const clearFilters=()=>{setQuery("");setStatus("");setClientType("");setProduct("");setPage(1);};
  const changeStatus=(orderId:string,next:OrderStatus)=>{const updated=orders.map(order=>order.orderId===orderId?{...order,status:next,updatedAt:new Date().toISOString()}:order);setOrders(updated);localStorage.setItem(orderStoreKey("seiko"),JSON.stringify(updated));window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated",{detail:{businessId:"seiko"}}));};
  const metrics=[{key:"active" as MetricKey,label:"ACTIVE ORDERS",value:activeOrders.length,note:"Currently open work"},{key:"completed" as MetricKey,label:"COMPLETED ORDERS",value:completedOrders.length,note:"Completed work"},{key:"sync" as MetricKey,label:"SCAN SYNC QUEUE",value:scanQueue.length,note:scanQueue.length?"Waiting to sync":"All scans synced"}];
  const queueTitle=(item:Record<string,unknown>,index:number)=>String(item.token||item.labelToken||item.id||`Queued scan ${index+1}`),queueTime=(item:Record<string,unknown>)=>String(item.createdAt||item.at||item.timestamp||"");
  return <section className="seikoOperationalDashboard"><div className="seikoDashboardHead"><div><small>SEIKO</small><h1>Home</h1><p>Configurable operational dashboard and quick access to working modules.</p></div><div className="seikoDashboardHeadActions"><button type="button" className="secondary" onClick={()=>setCustomizing(value=>!value)}>{customizing?"Done":"Customize dashboard"}</button></div></div>
    {customizing&&<section className="seikoHomeCustomizer panel" aria-label="Customize Home"><div><b>Dashboard</b><p>Choose the live operational views shown on Home. More business metrics can be registered here as Sales, Payments and Production data mature.</p></div><div className="seikoHomeOptionGrid">{metrics.map(metric=><label key={metric.key}><input type="checkbox" checked={config.metrics[metric.key]} onChange={event=>setConfig(current=>({...current,metrics:{...current.metrics,[metric.key]:event.target.checked}}))}/>{metric.label}</label>)}<label><input type="checkbox" checked={config.showActiveOrders} onChange={event=>setConfig(current=>({...current,showActiveOrders:event.target.checked}))}/>Operational list</label></div><div><b>Quick access</b><p>Choose implemented module shortcuts.</p></div><div className="seikoHomeOptionGrid">{(Object.keys(config.quickAccess) as QuickAccessKey[]).map(item=><label key={item}><input type="checkbox" checked={config.quickAccess[item]} onChange={event=>setConfig(current=>({...current,quickAccess:{...current.quickAccess,[item]:event.target.checked}}))}/>{item}</label>)}</div></section>}
    <div className="seikoDashboardMetrics">{metrics.filter(metric=>config.metrics[metric.key]).map(metric=><button type="button" className={`seikoMetricCard seikoMetricReadout ${workMode===metric.key?"active":""} ${metric.key==="sync"&&!metric.value?"positive":""}`} key={metric.key} onClick={()=>{setWorkMode(metric.key);setFiltersOpen(false);clearFilters();}}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></button>)}</div>
    {config.showActiveOrders&&<section className="seikoDashboardActivity"><div className="seikoDashboardActivityHead"><div><b>{workMode==="active"?"Active orders":workMode==="completed"?"Completed orders":"Scan sync queue"}</b><p>{workMode==="sync"?`${scanQueue.length} scan${scanQueue.length===1?"":"s"} waiting or syncing.`:`${filtered.length} of ${orderScope.length} order${orderScope.length===1?"":"s"} shown.`}</p></div>{workMode!=="sync"&&<button type="button" className={`homeWorkFilterToggle ${activeFilterCount?"active":""}`} aria-label="Filter orders" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><span className="homeFilterGlyph" aria-hidden="true"><i/><i/><i/></span>{activeFilterCount>0&&<em>{activeFilterCount}</em>}</button>}</div>
      {workMode!=="sync"&&filtersOpen&&<div className="seikoDashboardActivityFilters"><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find order or client" aria-label="Filter orders"/><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select><select value={clientType} onChange={event=>{setClientType(event.target.value);setProduct("");}}><option value="">All client types</option>{clientTypes.map(value=><option key={value}>{value}</option>)}</select><select value={product} onChange={event=>setProduct(event.target.value)}><option value="">All products</option>{products.map(value=><option key={value}>{value}</option>)}</select><button type="button" className="textButton" disabled={!activeFilterCount} onClick={clearFilters}>Clear filters</button></div>}
      {workMode==="sync"?<div className="seikoDashboardQueueList">{scanQueue.length?scanQueue.slice(0,config.activeOrderPageSize).map((item,index)=><article key={`${queueTitle(item,index)}-${index}`}><b>{queueTitle(item,index)}</b><span>{queueTime(item)||"Waiting to sync"}</span></article>):<div className="seikoDashboardActivityEmpty">All scans are synced.</div>}</div>:<div className="seikoDashboardOrderList">{visible.length?visible.map(order=><article className="seikoDashboardActivityRow homeOrderOperationalRow" key={order.orderId}><button type="button" className="homeOrderOpen" onClick={()=>openSeikoOrder(order)}><strong>{order.details.orderNo||order.orderId}</strong><span>{order.details.clientName||"Client"}</span><small>{order.details.clientType} · {order.records.length} records</small></button><span className="homeOrderOperationalMeta"><span><small>Records</small><b>{order.records.length}</b></span><span><small>Products</small><b>{order.products.filter(item=>item.name.trim()).length}</b></span><span><small>Delivery</small><b>{order.details.deliveryDate||"Not set"}</b></span></span><label className="homeOrderStatus"><small>Status</small><select value={order.status} onChange={event=>changeStatus(order.orderId,event.target.value as OrderStatus)}>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select></label></article>):<div className="seikoDashboardActivityEmpty">No orders match these filters.</div>}</div>}
      {workMode!=="sync"&&filtered.length>config.activeOrderPageSize&&<div className="seikoDashboardPager"><label>Rows <select value={config.activeOrderPageSize} onChange={event=>setConfig(current=>({...current,activeOrderPageSize:Number(event.target.value) as 5|10|20}))}><option>5</option><option>10</option><option>20</option></select></label><button disabled={safePage<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {safePage} of {pageCount}</span><button disabled={safePage>=pageCount} onClick={()=>setPage(value=>value+1)}>Next</button></div>}
    </section>}
  </section>;
}
'''
write(p,prefix+func)

# CSS appended for the new interaction rules.
p='app/seiko-operational-ux.css'; t=read(p)
t += r'''

/* 2026-08-31 operational interaction acceptance */
.seikoOperationalDashboard .seikoMetricReadout{pointer-events:auto!important;cursor:pointer!important;border:1px solid var(--line)!important}
.seikoOperationalDashboard .seikoMetricReadout.active{border-color:color-mix(in srgb,var(--brand) 55%,var(--line))!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 8%,transparent)!important}
.homeOrderOperationalRow{grid-template-columns:minmax(250px,1.3fr) minmax(360px,1.5fr) 150px!important;padding:0!important;overflow:hidden!important}
.homeOrderOpen{display:grid!important;gap:2px!important;align-self:stretch!important;border:0!important;background:transparent!important;padding:9px 10px!important;text-align:left!important;color:var(--ink)!important}
.homeOrderOpen:hover{background:color-mix(in srgb,var(--brand) 4%,var(--paper))!important}
.homeOrderOpen strong{font-size:11px!important;color:var(--navy)!important}.homeOrderOpen span{font-size:11px!important;font-weight:800!important}.homeOrderOpen small{font-size:8px!important;color:var(--muted)!important}
.homeOrderStatus{display:grid!important;gap:3px!important;padding:7px 8px!important;border-left:1px solid var(--line)!important}.homeOrderStatus small{font-size:7px!important;font-weight:900!important;text-transform:uppercase!important;color:var(--muted)!important}.homeOrderStatus select{height:34px!important;border:1px solid var(--line)!important;border-radius:7px!important;background:var(--paper)!important;padding:0 25px 0 7px!important;font-size:9px!important;font-weight:800!important;color:var(--navy)!important}
.seikoDashboardQueueList{display:grid!important;gap:0!important}.seikoDashboardQueueList article{display:flex!important;justify-content:space-between!important;gap:12px!important;padding:9px 10px!important;border-top:1px solid var(--line)!important}.seikoDashboardQueueList article span{color:var(--muted)!important;font-size:9px!important}
.orderCenterOperationalMeta{grid-template-columns:minmax(130px,1.2fr) 70px 70px minmax(120px,1fr) 90px!important}.orderCenterStatusBadge{display:none!important}.orderProductMeta{cursor:help!important}.orderProductHoverCard{position:fixed;z-index:13000;width:min(460px,calc(100vw - 24px));padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);box-shadow:0 16px 42px rgba(8,35,54,.2);display:grid;gap:8px}.orderProductHoverCard>b{font-size:11px;color:var(--navy)}.orderProductHoverCard>div{display:grid;gap:6px}.orderProductHoverCard span{font-size:10px;line-height:1.4;color:var(--ink)}
.orderAdvancedFilterGrid{grid-template-columns:repeat(5,minmax(135px,1fr))!important}.orderArchivedNativeHidden{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important}.orderArchivedFilterToggle{display:flex!important;align-items:center!important;gap:5px!important;height:36px!important;padding:0 9px!important;border:1px solid var(--line)!important;border-radius:7px!important;background:var(--paper)!important;font-size:9px!important;font-weight:750!important}
.workspaceNativeMenuStatus{display:grid!important;gap:3px!important;padding:7px 8px!important;border-bottom:1px solid var(--line)!important}.workspaceNativeMenuStatus>span{font-size:8px!important;font-weight:900!important;text-transform:uppercase!important;color:var(--muted)!important}.workspaceNativeMenuStatus select{height:34px!important;border:1px solid var(--line)!important;border-radius:7px!important;background:var(--paper)!important;padding:0 25px 0 7px!important;font-size:10px!important;font-weight:800!important}.orderActionMenu .workspaceMenuSaveNow{background:var(--navy)!important;color:#fff!important;margin:4px 6px!important;border-radius:7px!important;text-align:center!important}
.workspaceRowHeaderCorner,.workspaceRowHeader{width:34px!important;min-width:34px!important;max-width:34px!important;text-align:center!important;background:color-mix(in srgb,var(--pale) 52%,var(--paper))!important;color:var(--muted)!important;font-size:8px!important;font-weight:800!important;cursor:default!important}.workspaceRowHeader{cursor:grab!important;user-select:none!important}.workspaceMovableColumnHeader{cursor:grab!important;user-select:none!important}.workspaceStructureSelected{background:color-mix(in srgb,var(--brand) 11%,var(--paper))!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brand) 38%,var(--line))!important}.workspaceStructureDropTarget{box-shadow:inset 3px 0 0 var(--brand)!important}.workspaceTable tbody tr.workspaceStructureSelected>td{background:color-mix(in srgb,var(--brand) 5%,var(--paper))!important}
.workspacePager>label>input[aria-label="Rows per page"]{width:70px!important;height:32px!important;border:1px solid var(--line)!important;border-radius:7px!important;padding:0 7px!important;text-align:center!important;font-weight:800!important}
.workspaceRowMenuPopup{min-width:150px!important;padding:5px!important;gap:2px!important}.workspaceRowMenuPopup button{display:block!important;width:100%!important;min-height:32px!important;border:0!important;border-radius:6px!important;background:transparent!important;text-align:left!important;padding:6px 9px!important}.workspaceRowMenuPopup button:hover{background:var(--pale)!important}.workspaceRowMenuDelete{color:#b42318!important}
.labelHeaderSaveSet{background:var(--navy)!important;color:#fff!important;min-width:118px!important}.labelSaveChoiceLayer{position:fixed;inset:0;z-index:15000;display:grid;place-items:center;padding:20px;background:rgba(9,30,45,.42);backdrop-filter:blur(2px)}.labelSaveChoiceDialog{width:min(390px,calc(100vw - 32px));padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:0 22px 60px rgba(8,35,54,.24)}.labelSaveChoiceDialog h3{margin:0 0 5px;font-size:17px}.labelSaveChoiceDialog p{margin:0 0 14px;color:var(--muted);font-size:10px}.labelSaveChoiceDialog>div{display:grid;grid-template-columns:1fr 1fr;gap:7px}.labelSaveChoiceDialog .cancel{grid-column:1/-1}
.labelCanvas .canvasElement{touch-action:none!important}.labelManualArrange .labelCanvas .canvasElement{cursor:move!important}.labelCanvas .guideX,.labelCanvas .guideY{pointer-events:none!important}
@media(max-width:900px){.homeOrderOperationalRow{grid-template-columns:1fr!important}.homeOrderStatus{border-left:0!important;border-top:1px solid var(--line)!important}.orderCenterOperationalMeta{grid-template-columns:repeat(2,minmax(0,1fr))!important}.orderAdvancedFilterGrid{grid-template-columns:1fr 1fr!important}}
'''
write(p,t)

# Sanity guards.
checks={
'app/lib/order-domain.ts':['ORDER_STATUSES','columnOrder'],
'app/orders.tsx':['workspaceNativeMenuStatus','seiko:workspace-reorder-rows','Rows per page','Archive order','Delete order'],
'app/seiko-phase1.tsx':['workMode','changeStatus','SCAN SYNC QUEUE','ORDER_STATUSES'],
'app/seiko-operational-ux.tsx':['orderProductHoverCard','quantityForRecord','Status'],
'app/label-designer.tsx':['labelHeaderSaveSet','Math.round(x * 4) / 4','Products:'],
'app/label-workspace-refinement.tsx':['openLabelSaveChoice','saveShortcut'],
'app/workspace-structure-interactions.tsx':['seiko:workspace-reorder-columns'],
}
for path,needles in checks.items():
    body=read(path)
    for needle in needles:
        if needle not in body: raise RuntimeError(f'{path}: missing sanity marker {needle}')
print('SEIKO operational interaction pass applied.')
