from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match ({count}) for {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

# 1) Home: make dashboard scopes/status filters truthful and keep the filter row open after Clear.
p = Path("app/seiko-phase1.tsx")
text = p.read_text()
old = '  const activeOrders=orders.filter(order=>!order.archived&&![' + '"Completed","Cancelled"' + '].includes(order.status));\n  const completedOrders=orders.filter(order=>!order.archived&&order.status==="Completed");'
new = old + '\n  const activeStatusOptions=ORDER_STATUSES.filter(value=>![' + '"Completed","Cancelled"' + '].includes(value));'
if text.count(old) != 1:
    raise SystemExit("seiko-phase1: active order scope marker missing")
text = text.replace(old, new, 1)
old = '  const changeStatus=(orderId:string,next:OrderStatus)=>{setOrders(prev=>prev.map(order=>order.orderId===orderId?{...order,status:next}:order));};'
new = '''  const changeStatus=(orderId:string,next:OrderStatus)=>{\n    setOrders(prev=>prev.map(order=>order.orderId===orderId?{...order,status:next}:order));\n    if(next==="Completed"&&workMode==="active"){setWorkMode("completed");setStatus("");setPage(1);}\n    else if(next!=="Completed"&&workMode==="completed"){setWorkMode("active");setStatus(next==="Cancelled"?"":next);setPage(1);}\n  };'''
if text.count(old) != 1:
    raise SystemExit("seiko-phase1: changeStatus marker missing")
text = text.replace(old, new, 1)
old = '<select aria-label="Filter active work by status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">All statuses</option>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select>'
new = '<select aria-label="Filter active work by status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">{workMode==="active"?"All active statuses":"Completed"}</option>{(workMode==="active"?activeStatusOptions:["Completed"] as OrderStatus[]).map(value=><option key={value}>{value}</option>)}</select>'
if text.count(old) != 1:
    raise SystemExit("seiko-phase1: status select marker missing")
text = text.replace(old, new, 1)
old = '<button className="textButton" onClick={()=>{clearFilters();setFiltersOpen(false);}}>Clear filters</button>'
new = '<button className="textButton" onClick={clearFilters}>Clear filters</button>'
if text.count(old) != 1:
    raise SystemExit("seiko-phase1: clear filters marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 2) Order Setup: Back is top-left and order date is editable.
p = Path("app/orders.tsx")
text = p.read_text()
old = '  return <div className="page orderSetup">\n    <div className="orderPageHead"><div><p className="eyebrow">ORDER SETUP</p><h2>{order.details.orderNo}</h2></div><div><button className="secondary contextBackButton" onClick={onCancel}>{existingOrder ? "← Back to Order" : "← Back to Order Center"}</button><button className="primary" onClick={onContinue}>{existingOrder ? "Update workspace" : "Create workspace"}</button></div></div>'
new = '  return <div className="page orderSetup">\n    <div className="orderPageHead"><div><button type="button" className="secondary contextBackButton orderSetupBack" onClick={onCancel}>{existingOrder ? "← Back to Order" : "← Back to Orders"}</button><p className="eyebrow">ORDER SETUP</p><h2>{order.details.orderNo}</h2></div><div><button className="primary" onClick={onContinue}>{existingOrder ? "Update workspace" : "Create workspace"}</button></div></div>'
if text.count(old) != 1:
    raise SystemExit("orders: OrderSetup header marker missing")
text = text.replace(old, new, 1)
old = '<div className="autoOrderInfo"><span><b>Order</b> {order.details.orderNo}</span><span><b>Date</b> {new Date(`${order.details.orderDate}T00:00:00`).toLocaleDateString("en-GB")}</span></div>'
new = '<div className="autoOrderInfo"><span><b>Order</b> {order.details.orderNo}</span><label className="orderDateEditor"><b>Date</b><input aria-label="Order date" type="date" value={order.details.orderDate} onChange={event=>updateDetails("orderDate",event.target.value)}/></label></div>'
if text.count(old) != 1:
    raise SystemExit("orders: auto order info marker missing")
text = text.replace(old, new, 1)

# Workspace reorder: honor before/after insertion position.
old = '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const ids = new Set(detail.ids);\n      const moving = order.records.filter(record => ids.has(record.recordId));\n      const rest = order.records.filter(record => !ids.has(record.recordId));\n      const target = rest.findIndex(record => record.recordId === detail.targetId);\n      const at = target < 0 ? rest.length : target;\n      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];'
new = '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string; position?: "before" | "after" }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const ids = new Set(detail.ids);\n      const moving = order.records.filter(record => ids.has(record.recordId));\n      const rest = order.records.filter(record => !ids.has(record.recordId));\n      const target = rest.findIndex(record => record.recordId === detail.targetId);\n      const at = target < 0 ? rest.length : Math.min(rest.length, target + (detail.position === "after" ? 1 : 0));\n      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];'
if text.count(old) != 1:
    raise SystemExit("orders: row reorder marker missing")
text = text.replace(old, new, 1)
old = '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const all = columns.map(column => column.id);\n      const ids = new Set(detail.ids);\n      const moving = all.filter(id => ids.has(id));\n      const rest = all.filter(id => !ids.has(id));\n      const target = rest.indexOf(detail.targetId);\n      const at = target < 0 ? rest.length : target;\n      const columnOrder = [...rest.slice(0, at), ...moving, ...rest.slice(at)];'
new = '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string; position?: "before" | "after" }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const all = columns.map(column => column.id);\n      const ids = new Set(detail.ids);\n      const moving = all.filter(id => ids.has(id));\n      const rest = all.filter(id => !ids.has(id));\n      const target = rest.indexOf(detail.targetId);\n      const at = target < 0 ? rest.length : Math.min(rest.length, target + (detail.position === "after" ? 1 : 0));\n      const columnOrder = [...rest.slice(0, at), ...moving, ...rest.slice(at)];'
if text.count(old) != 1:
    raise SystemExit("orders: column reorder marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 3) Order Center: status lives only in three-dot menu and metadata is plain under the client name.
p = Path("app/seiko-operational-ux.tsx")
text = p.read_text()
old = '    statusWrap?.removeAttribute("hidden");\n    statusWrap?.classList.add("orderCenterInlineStatus");'
new = '    statusWrap?.setAttribute("hidden", "");\n    statusWrap?.classList.remove("orderCenterInlineStatus");'
if text.count(old) != 1:
    raise SystemExit("operational ux: inline status marker missing")
text = text.replace(old, new, 1)
old = '      menu.insertAdjacentElement("beforebegin", meta);'
new = '      detail?.appendChild(meta);'
if text.count(old) != 1:
    raise SystemExit("operational ux: metadata insertion marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 4) Workspace drag/drop: precise before/after guides, not whole-row/whole-column highlighting.
p = Path("app/workspace-structure-interactions.tsx")
text = p.read_text()
old = 'function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}'
new = 'function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}\nfunction clearDropHints(){document.querySelectorAll(".workspaceDropBefore,.workspaceDropAfter").forEach(node=>node.classList.remove("workspaceDropBefore","workspaceDropAfter"));}\nfunction dropPosition(event:DragEvent,element:HTMLElement,axis:"x"|"y"){const box=element.getBoundingClientRect();return axis==="y"?(event.clientY<box.top+box.height/2?"before":"after"):(event.clientX<box.left+box.width/2?"before":"after");}\nfunction paintDropHint(element:HTMLElement,position:"before"|"after"){clearDropHints();element.classList.add(position==="before"?"workspaceDropBefore":"workspaceDropAfter");}'
if text.count(old) != 1:
    raise SystemExit("workspace interactions: helper marker missing")
text = text.replace(old, new, 1)
old = '    handle.addEventListener("dragover", event => { event.preventDefault(); row.classList.add("workspaceStructureDropTarget"); });\n    handle.addEventListener("dragleave",()=>row.classList.remove("workspaceStructureDropTarget"));\n    handle.addEventListener("drop", event => { event.preventDefault(); row.classList.remove("workspaceStructureDropTarget"); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id}})); });'
new = '    handle.addEventListener("dragover", event => { event.preventDefault(); paintDropHint(row,dropPosition(event,row,"y")); });\n    handle.addEventListener("dragleave",event=>{if(!row.contains(event.relatedTarget as Node|null))clearDropHints();});\n    handle.addEventListener("drop", event => { event.preventDefault(); const position=dropPosition(event,row,"y"); clearDropHints(); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id,position}})); });'
if text.count(old) != 1:
    raise SystemExit("workspace interactions: row drag marker missing")
text = text.replace(old, new, 1)
old = '    cell.addEventListener("dragover",event=>{event.preventDefault();cell.classList.add("workspaceStructureDropTarget");});cell.addEventListener("dragleave",()=>cell.classList.remove("workspaceStructureDropTarget"));\n    cell.addEventListener("drop",event=>{event.preventDefault();cell.classList.remove("workspaceStructureDropTarget");window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id}}));});'
new = '    cell.addEventListener("dragover",event=>{event.preventDefault();paintDropHint(cell,dropPosition(event,cell,"x"));});cell.addEventListener("dragleave",event=>{if(!cell.contains(event.relatedTarget as Node|null))clearDropHints();});\n    cell.addEventListener("drop",event=>{event.preventDefault();const position=dropPosition(event,cell,"x");clearDropHints();window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id,position}}));});'
if text.count(old) != 1:
    raise SystemExit("workspace interactions: column drag marker missing")
text = text.replace(old, new, 1)
old = 'export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});return()=>{closeContextMenu();controller.stop();};},[]);return null;}'
new = 'export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});const clear=()=>clearDropHints();document.addEventListener("dragend",clear,true);return()=>{document.removeEventListener("dragend",clear,true);clearDropHints();closeContextMenu();controller.stop();};},[]);return null;}'
if text.count(old) != 1:
    raise SystemExit("workspace interactions: cleanup marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 5) Label Workspace: Back is top-left in both purpose selection and editor header.
p = Path("app/label-designer.tsx")
text = p.read_text()
old = 'return <div className="page labelPurposePage"><section className="labelPurposeHead panel"><div><p className="eyebrow">ORDER {order.details.orderNo}</p><h2>What will this label identify?</h2><p>Choose its use. You can change the information and size next.</p></div>{onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}</section>'
new = 'return <div className="page labelPurposePage"><section className="labelPurposeHead panel"><div>{onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}<p className="eyebrow">ORDER {order.details.orderNo}</p><h2>What will this label identify?</h2><p>Choose its use. You can change the information and size next.</p></div></section>'
if text.count(old) != 1:
    raise SystemExit("label designer: purpose back marker missing")
text = text.replace(old, new, 1)
old = 'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div><p className="eyebrow">{order ? `ORDER ${order.details.orderNo} · ${purposeLabel(purpose)}` : "LABEL DESIGNER"}</p>'
new = 'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div>{order && onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}<p className="eyebrow">{order ? `ORDER ${order.details.orderNo} · ${purposeLabel(purpose)}` : "LABEL DESIGNER"}</p>'
if text.count(old) != 1:
    raise SystemExit("label designer: editor header marker missing")
text = text.replace(old, new, 1)
old = '<div className="labelHeaderCommandBar">{order && onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}{order && purpose && <button type="button" className="primary labelHeaderSaveSet"'
new = '<div className="labelHeaderCommandBar">{order && purpose && <button type="button" className="primary labelHeaderSaveSet"'
if text.count(old) != 1:
    raise SystemExit("label designer: right-side back marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 6) Label Center: put contextual Back at top-left and keep + Create labels as the only right header action.
p = Path("app/label-flow-polish.tsx")
text = p.read_text()
old = '''    const orderCenter = head?.querySelector<HTMLButtonElement>("button.secondary");
    if (orderCenter) orderCenter.textContent = "Order Center";
    let headActions = head?.querySelector<HTMLElement>(".labelLauncherHeadActions");
    if (head && orderCenter && !headActions) {
      headActions = document.createElement("div");
      headActions.className = "labelLauncherHeadActions";
      orderCenter.insertAdjacentElement("beforebegin", headActions);
      headActions.appendChild(orderCenter);
    }'''
new = '''    const orderCenter = head?.querySelector<HTMLButtonElement>("button.secondary");
    if (head && orderCenter) {
      orderCenter.textContent = "← Back to Orders";
      orderCenter.classList.add("contextBackButton");
      const title = head.firstElementChild as HTMLElement | null;
      if (title && orderCenter.parentElement !== title) title.prepend(orderCenter);
    }
    let headActions = head?.querySelector<HTMLElement>(".labelLauncherHeadActions");
    if (head && !headActions) {
      headActions = document.createElement("div");
      headActions.className = "labelLauncherHeadActions";
      head.appendChild(headActions);
    }'''
if text.count(old) != 1:
    raise SystemExit("label flow: Label Center header marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

# 7) CSS: plain order metadata, top-left back/date editor, and Excel-like insertion lines.
p = Path("app/seiko-operational-ux.css")
text = p.read_text()
text = text.replace('grid-template-columns:minmax(250px,1.05fr) 142px minmax(470px,1.35fr) 38px!important;', 'grid-template-columns:minmax(0,1fr) 38px!important;', 1)
old = '.orderCenterOperationalMeta{display:grid!important;grid-template-columns:minmax(130px,1.2fr) 76px 76px minmax(125px,1fr)!important;gap:6px!important;min-width:0!important}\n.orderCenterOperationalMeta>span{display:grid!important;gap:1px!important;min-width:0!important;padding:5px 7px!important;border:1px solid color-mix(in srgb,var(--line) 80%,transparent)!important;border-radius:7px!important;background:color-mix(in srgb,var(--paper) 94%,var(--pale))!important}\n.orderCenterOperationalMeta small{font-size:7px!important;font-weight:850!important;text-transform:uppercase!important;color:var(--muted)!important}\n.orderCenterOperationalMeta b{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;color:var(--ink)!important}'
new = '.orderCenterOperationalMeta{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:5px 12px!important;min-width:0!important;margin-top:4px!important}\n.orderCenterOperationalMeta>span{display:inline-flex!important;align-items:baseline!important;gap:4px!important;min-width:0!important;padding:0!important;border:0!important;background:transparent!important}\n.orderCenterOperationalMeta small{font-size:7px!important;font-weight:850!important;text-transform:uppercase!important;color:var(--muted)!important}\n.orderCenterOperationalMeta b{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;color:var(--ink)!important}\n.orderCenterOperationalMeta>span+span::before{content:"·";margin-right:6px;color:var(--muted)!important}'
if text.count(old) != 1:
    raise SystemExit("operational css: order metadata marker missing")
text = text.replace(old, new, 1)
p.write_text(text)

p = Path("app/order-enhancements.css")
text = p.read_text()
append = '''

/* Runtime accuracy: contextual navigation, editable order date, and exact spreadsheet drop guides. */
.orderSetup .orderPageHead>div:first-child,.labelTopbar>div:first-child,.labelPurposeHead>div:first-child,.labelLauncherHead>div:first-child{display:grid!important;justify-items:start!important;align-content:start!important}
.orderSetup .orderSetupBack,.labelDesignerPage .contextBackButton,.labelLauncher .contextBackButton{margin-bottom:5px!important}
.orderSetup .orderDateEditor{display:inline-grid!important;grid-template-columns:auto minmax(132px,160px)!important;align-items:center!important;gap:7px!important}
.orderSetup .orderDateEditor>b{font-size:9px!important;color:var(--navy)!important}
.orderSetup .orderDateEditor>input{height:30px!important;min-height:30px!important;padding:0 7px!important}
.workspaceTable tr.workspaceDropBefore{box-shadow:inset 0 3px 0 var(--brand)!important}
.workspaceTable tr.workspaceDropAfter{box-shadow:inset 0 -3px 0 var(--brand)!important}
.workspaceMovableColumnHeader.workspaceDropBefore::before,.workspaceMovableColumnHeader.workspaceDropAfter::after{content:"";position:absolute;z-index:20;top:0;bottom:0;width:3px;background:var(--brand);box-shadow:0 0 0 1px color-mix(in srgb,var(--paper) 60%,transparent)}
.workspaceMovableColumnHeader.workspaceDropBefore::before{left:-2px}.workspaceMovableColumnHeader.workspaceDropAfter::after{right:-2px}
.workspaceTable tr.workspaceDropBefore .workspaceRowHeader,.workspaceTable tr.workspaceDropAfter .workspaceRowHeader,.workspaceMovableColumnHeader.workspaceDropBefore,.workspaceMovableColumnHeader.workspaceDropAfter{background:color-mix(in srgb,var(--brand) 10%,var(--paper))!important}
'''
if '/* Runtime accuracy: contextual navigation' in text:
    raise SystemExit("order-enhancements.css: runtime accuracy block already exists")
p.write_text(text + append)

print("SEIKO runtime accuracy source patch completed")
