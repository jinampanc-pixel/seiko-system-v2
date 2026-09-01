from pathlib import Path


def one(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))

# HOME — active/completed scope must be explicit, and Clear Filters must keep the panel open.
one(
    'app/seiko-phase1.tsx',
    '  const activeOrders=useMemo(()=>orders.filter(order=>!order.archived&&!["Completed","Cancelled"].includes(order.status)),[orders]);\n  const completedOrders=useMemo(()=>orders.filter(order=>!order.archived&&order.status==="Completed"),[orders]);',
    '  const activeOrders=useMemo(()=>orders.filter(order=>!order.archived&&!["Completed","Cancelled"].includes(order.status)),[orders]);\n  const completedOrders=useMemo(()=>orders.filter(order=>!order.archived&&order.status==="Completed"),[orders]);\n  const activeStatusOptions=useMemo(()=>ORDER_STATUSES.filter(value=>!["Completed","Cancelled"].includes(value)),[]);',
    'home status scope',
)
one(
    'app/seiko-phase1.tsx',
    '  const changeStatus=(orderId:string,next:OrderStatus)=>{const updated=orders.map(order=>order.orderId===orderId?{...order,status:next,updatedAt:new Date().toISOString()}:order);setOrders(updated);localStorage.setItem(orderStoreKey("seiko"),JSON.stringify(updated));window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated",{detail:{businessId:"seiko"}}));};',
    '  const changeStatus=(orderId:string,next:OrderStatus)=>{const updated=orders.map(order=>order.orderId===orderId?{...order,status:next,updatedAt:new Date().toISOString()}:order);setOrders(updated);localStorage.setItem(orderStoreKey("seiko"),JSON.stringify(updated));window.dispatchEvent(new CustomEvent("seiko:orders-cache-updated",{detail:{businessId:"seiko"}}));if(next==="Completed"&&workMode==="active"){setWorkMode("completed");setStatus("");setPage(1);}else if(next!=="Completed"&&workMode==="completed"){setWorkMode("active");setStatus(next==="Cancelled"?"":next);setPage(1);}};',
    'home change status',
)
one(
    'app/seiko-phase1.tsx',
    '<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select>',
    '<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">{workMode==="active"?"All active statuses":"Completed"}</option>{(workMode==="active"?activeStatusOptions:["Completed"] as OrderStatus[]).map(value=><option key={value}>{value}</option>)}</select>',
    'home status filter',
)
one(
    'app/seiko-phase1.tsx',
    '<button type="button" className="textButton" aria-label="Clear all order filters" onClick={()=>{clearFilters();setFiltersOpen(false);}}>Clear filters</button>',
    '<button type="button" className="textButton" aria-label="Clear all order filters" onClick={clearFilters}>Clear filters</button>',
    'home clear filters',
)

# ORDER SETUP — Back belongs top-left; order date is editable.
one(
    'app/orders.tsx',
    '  return <div className="page orderSetup"><div className="orderPageHead"><div><p className="eyebrow">ORDER SETUP</p><h2>{order.details.orderNo || "New order"}</h2></div><div><button className="secondary contextBackButton" onClick={onCancel}>{order.revisions.length ? "← Back to Workspace" : "← Back to Orders"}</button><button className="primary" onClick={onContinue}>{order.revisions.length ? "Update workspace" : "Create workspace"}</button></div></div>{errors.length > 0 &&',
    '  return <div className="page orderSetup"><div className="orderPageHead"><div><button type="button" className="secondary contextBackButton orderSetupBack" onClick={onCancel}>{order.revisions.length ? "← Back to Workspace" : "← Back to Orders"}</button><p className="eyebrow">ORDER SETUP</p><h2>{order.details.orderNo || "New order"}</h2></div><div><button className="primary" onClick={onContinue}>{order.revisions.length ? "Update workspace" : "Create workspace"}</button></div></div>{errors.length > 0 &&',
    'order setup header',
)
one(
    'app/orders.tsx',
    '<div className="autoOrderInfo"><span><b>Order</b> {order.details.orderNo}</span><span><b>Date</b> {new Date(`${order.details.orderDate}T00:00:00`).toLocaleDateString("en-GB")}</span></div>',
    '<div className="autoOrderInfo"><span><b>Order</b> {order.details.orderNo}</span><label className="orderDateEditor"><b>Date</b><input aria-label="Order date" type="date" value={order.details.orderDate} onChange={event=>updateDetails("orderDate",event.target.value)}/></label></div>',
    'order setup date',
)

# WORKSPACE STATE — before/after drop position must be persisted by React state owner.
one(
    'app/orders.tsx',
    '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const ids = new Set(detail.ids);\n      const moving = order.records.filter(record => ids.has(record.recordId));\n      const rest = order.records.filter(record => !ids.has(record.recordId));\n      const target = rest.findIndex(record => record.recordId === detail.targetId);\n      const at = target < 0 ? rest.length : target;\n      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];',
    '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string; position?: "before" | "after" }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const ids = new Set(detail.ids);\n      const moving = order.records.filter(record => ids.has(record.recordId));\n      const rest = order.records.filter(record => !ids.has(record.recordId));\n      const target = rest.findIndex(record => record.recordId === detail.targetId);\n      const at = target < 0 ? rest.length : Math.min(rest.length, target + (detail.position === "after" ? 1 : 0));\n      const next = [...rest.slice(0, at), ...moving, ...rest.slice(at)];',
    'row reorder state',
)
one(
    'app/orders.tsx',
    '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const all = columns.map(column => column.id);\n      const ids = new Set(detail.ids);\n      const moving = all.filter(id => ids.has(id));\n      const rest = all.filter(id => !ids.has(id));\n      const target = rest.indexOf(detail.targetId);\n      const at = target < 0 ? rest.length : target;\n      const columnOrder = [...rest.slice(0, at), ...moving, ...rest.slice(at)];',
    '      const detail = (event as CustomEvent<{ ids: string[]; targetId: string; position?: "before" | "after" }>).detail;\n      if (!detail?.ids?.length || !detail.targetId) return;\n      const all = columns.map(column => column.id);\n      const ids = new Set(detail.ids);\n      const moving = all.filter(id => ids.has(id));\n      const rest = all.filter(id => !ids.has(id));\n      const target = rest.indexOf(detail.targetId);\n      const at = target < 0 ? rest.length : Math.min(rest.length, target + (detail.position === "after" ? 1 : 0));\n      const columnOrder = [...rest.slice(0, at), ...moving, ...rest.slice(at)];',
    'column reorder state',
)

# ORDER CENTER — status only in overflow; compact metadata belongs below client.
one(
    'app/seiko-operational-ux.tsx',
    '    statusWrap?.removeAttribute("hidden");\n    statusWrap?.classList.add("orderCenterInlineStatus");',
    '    statusWrap?.setAttribute("hidden", "");\n    statusWrap?.classList.remove("orderCenterInlineStatus");',
    'order center inline status',
)
one(
    'app/seiko-operational-ux.tsx',
    '      menu.insertAdjacentElement("beforebegin", meta);',
    '      detail?.appendChild(meta);',
    'order center metadata placement',
)

# WORKSPACE INTERACTION — exact Excel-like insertion guides.
one(
    'app/workspace-structure-interactions.tsx',
    'function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}',
    'function closeContextMenu(){document.querySelector(".workspaceContextMenu")?.remove();}\nfunction clearDropHints(){document.querySelectorAll(".workspaceDropBefore,.workspaceDropAfter").forEach(node=>node.classList.remove("workspaceDropBefore","workspaceDropAfter"));}\nfunction dropPosition(event:DragEvent,element:HTMLElement,axis:"x"|"y"){const box=element.getBoundingClientRect();return axis==="y"?(event.clientY<box.top+box.height/2?"before":"after"):(event.clientX<box.left+box.width/2?"before":"after");}\nfunction paintDropHint(element:HTMLElement,position:"before"|"after"){clearDropHints();element.classList.add(position==="before"?"workspaceDropBefore":"workspaceDropAfter");}',
    'workspace drop helpers',
)
one(
    'app/workspace-structure-interactions.tsx',
    '    handle.addEventListener("dragover", event => { event.preventDefault(); row.classList.add("workspaceStructureDropTarget"); });\n    handle.addEventListener("dragleave",()=>row.classList.remove("workspaceStructureDropTarget"));\n    handle.addEventListener("drop", event => { event.preventDefault(); row.classList.remove("workspaceStructureDropTarget"); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id}})); });',
    '    handle.addEventListener("dragover", event => { event.preventDefault(); paintDropHint(row,dropPosition(event,row,"y")); });\n    handle.addEventListener("dragleave",event=>{if(!row.contains(event.relatedTarget as Node|null))clearDropHints();});\n    handle.addEventListener("drop", event => { event.preventDefault(); const position=dropPosition(event,row,"y"); clearDropHints(); window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-rows",{detail:{ids:[...selectedRows],targetId:id,position}})); });',
    'workspace row drop',
)
one(
    'app/workspace-structure-interactions.tsx',
    '    cell.addEventListener("dragover",event=>{event.preventDefault();cell.classList.add("workspaceStructureDropTarget");});cell.addEventListener("dragleave",()=>cell.classList.remove("workspaceStructureDropTarget"));\n    cell.addEventListener("drop",event=>{event.preventDefault();cell.classList.remove("workspaceStructureDropTarget");window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id}}));});',
    '    cell.addEventListener("dragover",event=>{event.preventDefault();paintDropHint(cell,dropPosition(event,cell,"x"));});cell.addEventListener("dragleave",event=>{if(!cell.contains(event.relatedTarget as Node|null))clearDropHints();});\n    cell.addEventListener("drop",event=>{event.preventDefault();const position=dropPosition(event,cell,"x");clearDropHints();window.dispatchEvent(new CustomEvent("seiko:workspace-reorder-columns",{detail:{ids:[...selectedColumns],targetId:id,position}}));});',
    'workspace column drop',
)
one(
    'app/workspace-structure-interactions.tsx',
    'export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});return()=>{closeContextMenu();controller.stop();};},[]);return null;}',
    'export function WorkspaceStructureInteractions(){useEffect(()=>{const controller=startDomEnhancement(enhance,{observer:{childList:true,subtree:true}});const clear=()=>clearDropHints();document.addEventListener("dragend",clear,true);return()=>{document.removeEventListener("dragend",clear,true);clearDropHints();closeContextMenu();controller.stop();};},[]);return null;}',
    'workspace drop cleanup',
)

# LABEL WORKSPACE — contextual Back is source-owned at top-left.
one(
    'app/label-designer.tsx',
    'return <div className="page labelPurposePage"><section className="labelPurposeHead panel"><div><p className="eyebrow">ORDER {order.details.orderNo}</p><h2>What will this label identify?</h2><p>Choose its use. You can change the information and size next.</p></div>{onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}</section>',
    'return <div className="page labelPurposePage"><section className="labelPurposeHead panel"><div>{onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}<p className="eyebrow">ORDER {order.details.orderNo}</p><h2>What will this label identify?</h2><p>Choose its use. You can change the information and size next.</p></div></section>',
    'label purpose back',
)
one(
    'app/label-designer.tsx',
    'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div><p className="eyebrow">{order ? `ORDER ${order.details.orderNo} · ${purposeLabel(purpose)}` : "LABEL DESIGNER"}</p>',
    'return <div className={`page labelDesignerPage output-${outputMode} ${order ? "" : "noOrder"}`}><section className="labelTopbar panel"><div>{order && onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}<p className="eyebrow">{order ? `ORDER ${order.details.orderNo} · ${purposeLabel(purpose)}` : "LABEL DESIGNER"}</p>',
    'label editor left back',
)
one(
    'app/label-designer.tsx',
    '<div className="labelHeaderCommandBar">{order && onBack && <button className="secondary contextBackButton" onClick={onBack}>← Back to Order</button>}{order && purpose && <button type="button" className="primary labelHeaderSaveSet"',
    '<div className="labelHeaderCommandBar">{order && purpose && <button type="button" className="primary labelHeaderSaveSet"',
    'label editor right back removal',
)

# LABEL CENTER — contextual Back moves into the title block.
one(
    'app/label-flow-polish.tsx',
    '''    const orderCenter = head?.querySelector<HTMLButtonElement>("button.secondary");
    if (orderCenter) orderCenter.textContent = "Order Center";
    let headActions = head?.querySelector<HTMLElement>(".labelLauncherHeadActions");
    if (head && orderCenter && !headActions) {
      headActions = document.createElement("div");
      headActions.className = "labelLauncherHeadActions";
      orderCenter.insertAdjacentElement("beforebegin", headActions);
      headActions.appendChild(orderCenter);
    }''',
    '''    const orderCenter = head?.querySelector<HTMLButtonElement>("button.secondary");
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
    }''',
    'label center back placement',
)

# ORDER CENTER CSS — plain metadata, no inline status column.
one(
    'app/seiko-operational-ux.css',
    'grid-template-columns:minmax(250px,1.05fr) 142px minmax(470px,1.35fr) 38px!important;',
    'grid-template-columns:minmax(0,1fr) 38px!important;',
    'order center grid',
)
one(
    'app/seiko-operational-ux.css',
    '.orderCenterOperationalMeta{display:grid!important;grid-template-columns:minmax(130px,1.2fr) 76px 76px minmax(125px,1fr)!important;gap:6px!important;min-width:0!important}\n.orderCenterOperationalMeta>span{display:grid!important;gap:1px!important;min-width:0!important;padding:5px 7px!important;border:1px solid color-mix(in srgb,var(--line) 80%,transparent)!important;border-radius:7px!important;background:color-mix(in srgb,var(--paper) 94%,var(--pale))!important}\n.orderCenterOperationalMeta small{font-size:7px!important;font-weight:850!important;text-transform:uppercase!important;color:var(--muted)!important}\n.orderCenterOperationalMeta b{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;color:var(--ink)!important}',
    '.orderCenterOperationalMeta{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:5px 12px!important;min-width:0!important;margin-top:4px!important}\n.orderCenterOperationalMeta>span{display:inline-flex!important;align-items:baseline!important;gap:4px!important;min-width:0!important;padding:0!important;border:0!important;background:transparent!important}\n.orderCenterOperationalMeta small{font-size:7px!important;font-weight:850!important;text-transform:uppercase!important;color:var(--muted)!important}\n.orderCenterOperationalMeta b{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:9px!important;color:var(--ink)!important}\n.orderCenterOperationalMeta>span+span::before{content:"·";margin-right:6px;color:var(--muted)!important}',
    'order center metadata css',
)

# SHARED CSS — top-left Back, editable date, insertion lines.
p=Path('app/order-enhancements.css')
text=p.read_text()
if '/* Runtime accuracy v3 */' in text:
    raise SystemExit('runtime accuracy css already present')
text += '''

/* Runtime accuracy v3 */
.orderSetup .orderPageHead>div:first-child,.labelTopbar>div:first-child,.labelPurposeHead>div:first-child,.labelLauncherHead>div:first-child{display:grid!important;justify-items:start!important;align-content:start!important}
.orderSetup .orderSetupBack,.labelDesignerPage .contextBackButton,.labelLauncher .contextBackButton{margin-bottom:5px!important}
.orderSetup .orderDateEditor{display:inline-grid!important;grid-template-columns:auto minmax(132px,160px)!important;align-items:center!important;gap:7px!important}
.orderSetup .orderDateEditor>b{font-size:9px!important;color:var(--navy)!important}
.orderSetup .orderDateEditor>input{height:30px!important;min-height:30px!important;padding:0 7px!important}
.workspaceTable tr.workspaceDropBefore{box-shadow:inset 0 3px 0 var(--brand)!important}
.workspaceTable tr.workspaceDropAfter{box-shadow:inset 0 -3px 0 var(--brand)!important}
.workspaceMovableColumnHeader.workspaceDropBefore::before,.workspaceMovableColumnHeader.workspaceDropAfter::after{content:"";position:absolute;z-index:20;top:0;bottom:0;width:3px;background:var(--brand)}
.workspaceMovableColumnHeader.workspaceDropBefore::before{left:-2px}.workspaceMovableColumnHeader.workspaceDropAfter::after{right:-2px}
.workspaceTable tr.workspaceDropBefore .workspaceRowHeader,.workspaceTable tr.workspaceDropAfter .workspaceRowHeader,.workspaceMovableColumnHeader.workspaceDropBefore,.workspaceMovableColumnHeader.workspaceDropAfter{background:color-mix(in srgb,var(--brand) 10%,var(--paper))!important}
'''
p.write_text(text)

print('SEIKO runtime corrections verified and applied')
