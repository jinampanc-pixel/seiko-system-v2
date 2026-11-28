"use client";
import { useAccess } from "./access-control";
import { useOrderTrackingStatuses } from "./lib/order-tracking-client";
import { OrderActionsMenu } from "./order-actions-menu";
import { changeSharedOrder, openOrderFinancialAction } from "./lib/order-commands";
import { openLabelCreation } from "./lib/label-creation";
import { OrderHandoverPreview } from "./order-handover-preview";
import { quantityForRecord, specificationForRecord } from "./lib/order-domain";
import { OrderWorkflowButton } from "./order-workflow";

import "./seiko-billing-polish.css";
import { HOME_ACTIONS, HOME_KEY, HOME_CHANGED, readHomeConfig, applyHomeModules, type HomeConfig, type HomeFocus, type MetricKey } from "./lib/home-preferences";
import { requestAppNavigation } from "./app-navigation";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readOrderCache } from "./lib/order-cache";

import { ORDER_STATUSES, type SeikoOrder } from "./lib/order-domain";
import { startDomEnhancement } from "./lib/dom-enhancement";

function openSeikoModule(label: string, afterOpen?: () => void) {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const target = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav")).find(button => (button.querySelector("small")?.textContent?.trim() || "").toLowerCase() === label.toLowerCase());
    target?.click();
    if (afterOpen) window.setTimeout(afterOpen, 60);
  }, 0);
}

function openSeikoOrder(order: SeikoOrder) {
  requestAppNavigation(()=>window.dispatchEvent(new CustomEvent("seiko:open-order-workspace",{detail:order})));
}

function openNewOrder() {
  window.dispatchEvent(new Event("seiko:new-order"));
}

function openBillingAction(action: "payment" | "invoice" | "quotation" | "challan") {
  window.dispatchEvent(new CustomEvent("seiko:open-billing", { detail: { action } }));
}

export function SeikoPhase1() {
  const [dashboardHost, setDashboardHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const controller = startDomEnhancement(() => {
      const overview = document.querySelector<HTMLElement>(".overview");
      const hero = overview?.querySelector<HTMLElement>(".hero");
      const nextFlow = overview?.querySelector<HTMLElement>(".nextFlow");
      const moduleGrid = overview?.querySelector<HTMLElement>(".moduleGrid");
      if (hero) hero.style.display = "none";
      if (nextFlow) nextFlow.style.display = "none";
      if (overview && moduleGrid) {
        let host = overview.querySelector<HTMLElement>(".seikoDashboardHost");
        if (!host) {
          host = document.createElement("div");
          host.className = "seikoDashboardHost";
          overview.insertBefore(host, moduleGrid);
        }
        moduleGrid.setAttribute("aria-label", "Quick Access");
        moduleGrid.querySelectorAll<HTMLElement>(".moduleCard").forEach(card => {
          if ((card.querySelector("h3")?.textContent?.trim() || "").toLowerCase() === "orders") card.hidden = true;
        });
        if (!moduleGrid.querySelector(".seikoProductionQuickCard")) {
          const production = document.createElement("button");
          production.type = "button";
          production.className = "moduleCard seikoProductionQuickCard";
          production.innerHTML = "<h3>Production</h3><b>Open Production →</b>";
          production.addEventListener("click", () => openSeikoModule("Production"));
          const labels = Array.from(moduleGrid.querySelectorAll<HTMLElement>(".moduleCard")).find(card => (card.querySelector("h3")?.textContent?.trim() || "").toLowerCase() === "labels");
          if (labels) moduleGrid.insertBefore(production, labels); else moduleGrid.appendChild(production);
        }
        applyHomeModules(readHomeConfig());
        setDashboardHost(current => current === host ? current : host);
      } else {
        setDashboardHost(null);
      }

      document.querySelectorAll<HTMLButtonElement>(".moduleMenu .nav").forEach(button => {
        const label = button.querySelector("small")?.textContent?.trim();
        if (["Inventory", "Sales", "Delivery"].includes(label || "")) button.style.display = "none";
      });

      const setupBack = document.querySelector<HTMLButtonElement>(".orderSetup .orderPageHead .secondary");
      if (setupBack && (setupBack.textContent?.trim() || "").toLowerCase() === "cancel") setupBack.textContent = "← Back";
      document.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
        const text = button.textContent?.trim();
        if ((text || "").toLowerCase() === "order center") button.textContent = "← Back";
        if ((text || "").toLowerCase() === "back" && button.closest(".ordersPage,.orderSetup,.workspacePage")) button.textContent = "← Back";
        if ((text || "").toLowerCase() === "back" && button.closest(".labelCreateApp,.labelDesigner")) button.textContent = "← Back";
        if ((button.textContent?.trim() || "").toLowerCase().startsWith("← back")) button.classList.add("contextBackButton","appBackControl");
      });

    });
    return () => controller.stop();
  }, []);

  return dashboardHost ? createPortal(<SeikoDashboard/>, dashboardHost) : null;
}

function SeikoDashboard() {
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const {session}=useAccess();
  const trackingStatuses=useOrderTrackingStatuses(session?.user.email||"","seiko",orders.map(order=>order.orderId));
  const [scanQueue, setScanQueue] = useState<Array<Record<string, unknown>>>([]);
  const [config, setConfig] = useState<HomeConfig>(() => readHomeConfig());
  const [focus, setFocus] = useState<HomeFocus>(() => readHomeConfig().defaultFocus);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(searchOpen)searchInput.current?.focus();},[searchOpen]);
  const [workMode, setWorkMode] = useState<MetricKey>("active");
  const [query, setQuery] = useState(""), [clientType, setClientType] = useState(""), [product, setProduct] = useState(""), [status, setStatus] = useState("");
  useEffect(() => { const load=()=>{try{setOrders(readOrderCache("seiko"));}catch{setOrders([]);}try{setScanQueue(JSON.parse(localStorage.getItem("jinam:seiko:scan-queue")||"[]") as Array<Record<string,unknown>>);}catch{setScanQueue([]);}};queueMicrotask(load);window.addEventListener("storage",load);window.addEventListener("seiko:orders-cache-updated",load as EventListener);window.addEventListener("seiko:scan-queue-updated",load);window.addEventListener("focus",load);return()=>{window.removeEventListener("storage",load);window.removeEventListener("seiko:orders-cache-updated",load as EventListener);window.removeEventListener("seiko:scan-queue-updated",load);window.removeEventListener("focus",load);};},[]);
  useEffect(()=>{try{localStorage.setItem(HOME_KEY,JSON.stringify(config));}catch{/* Settings reports preference write failures. */}applyHomeModules(config);},[config]);
  useEffect(()=>{const reload=()=>{const next=readHomeConfig();setConfig(next);setFocus(next.defaultFocus);setWorkMode("active");};window.addEventListener(HOME_CHANGED,reload);window.addEventListener("storage",reload);return()=>{window.removeEventListener(HOME_CHANGED,reload);window.removeEventListener("storage",reload);};},[]);
  const activeOrders=useMemo(()=>orders.filter(order=>!order.archived&&!["Completed","Cancelled"].includes(trackingStatuses.get(order.orderId)||order.status)),[orders,trackingStatuses]);


  const orderScope=useMemo(()=>orders.filter(order=>!order.archived),[orders]);
  const clientTypes=useMemo(()=>[...new Set(orderScope.map(order=>order.details.clientType).filter(Boolean))].sort(),[orderScope]);
  const products=useMemo(()=>[...new Set(orderScope.filter(order=>!clientType||order.details.clientType===clientType).flatMap(order=>order.products.map(item=>item.name).filter(Boolean)))].sort(),[clientType,orderScope]);
  const searchEntries = useMemo(() => orderScope.map(order => ({ order, text: JSON.stringify([order.orderId, order.details, order.status, order.fields, order.products, order.measurements, order.records]).toLowerCase() })).sort((a,b) => (config.sort==="client"?a.order.details.clientName.localeCompare(b.order.details.clientName):config.sort==="delivery"?(a.order.details.deliveryDate||"9999").localeCompare(b.order.details.deliveryDate||"9999"):(Date.parse(b.order.updatedAt)||0)-(Date.parse(a.order.updatedAt)||0)) || a.order.orderId.localeCompare(b.order.orderId)), [orderScope,config.sort]);
  const dueOrderIds = useMemo(() => { const today=new Date();today.setHours(0,0,0,0);return new Set(activeOrders.filter(order=>{const value=order.details.deliveryDate;if(!value)return false;const date=new Date(value+"T00:00:00");return Number.isFinite(date.getTime())&&date.getTime()<=today.getTime()+7*86400000;}).map(order=>order.orderId)); },[activeOrders]);
  const needsEntries = activeOrders.filter(order => order.records.length === 0).length;
  const dueCount = dueOrderIds.size;
  const filtered = useMemo(() => searchEntries.filter(({order,text}) => (workMode!=="active" || focus==="all" || focus==="entries" && order.records.length===0 || focus==="due" && dueOrderIds.has(order.orderId)) && (!clientType || order.details.clientType===clientType) && (!product || order.products.some(item=>item.name===product)) && (!status || (trackingStatuses.get(order.orderId)||order.status)===status) && query.trim().toLowerCase().split(/\s+/).every(term=>text.includes(term))).map(entry=>entry.order), [searchEntries,clientType,product,status,query,focus,workMode,dueOrderIds,trackingStatuses]);
  const activeFilterCount=[query.trim(),status,clientType,product].filter(Boolean).length;
  const clearFilters=()=>{setQuery("");setStatus("");setClientType("");setProduct("");};
  const queueTitle=(item:Record<string,unknown>,index:number)=>String(item.token||item.labelToken||item.id||`Queued scan ${index+1}`),queueTime=(item:Record<string,unknown>)=>String(item.createdAt||item.at||item.timestamp||"");
  return <section className="seikoOperationalDashboard"><div className="seikoDashboardHead"><h1>Home</h1></div>
    {config.sections.actions&&config.actions.length>0&&<section className="seikoDailyActions" aria-label="Quick Actions"><div><b>Quick Actions</b></div><div className="seikoDailyActionGrid">{config.actions.map(id=>HOME_ACTIONS.find(item=>item.id===id)!).map(item=><button type="button" key={item.id} className={item.id==="new"?"primary":"secondary"} onClick={()=>item.id==="new"?openNewOrder():item.id==="labels"?openSeikoModule("Labels"):openBillingAction(item.id)}>{item.label}</button>)}</div></section>}
    {<section className="seikoDashboardActivity"><div className="seikoDashboardActivityHead"><div><b>Orders</b><p>{workMode==="sync"?`${scanQueue.length} scan${scanQueue.length===1?"":"s"} waiting or syncing.`:`${filtered.length} of ${orderScope.length} order${orderScope.length===1?"":"s"} shown.`}</p></div>{workMode==="active"&&Object.values(config.orderViews).some(Boolean)&&<div className="homeFocusViews" role="group" aria-label="Order Work Views">{([{id:"all",label:"All Orders",count:orderScope.length},{id:"entries",label:"Needs Entries",count:needsEntries},{id:"due",label:"Due Soon",count:dueCount}] as const).filter(item=>config.orderViews[item.id]).map(item=><button type="button" key={item.id} aria-pressed={focus===item.id} onClick={()=>setFocus(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>}{workMode!=="sync"&&<div className="homeOrderHeaderActions"><button type="button" className={`homeWorkFilterToggle ${query.trim()?"active":""}`} aria-label="Search Orders" title="Search Orders" aria-expanded={searchOpen} aria-controls="home-order-search" onClick={()=>setSearchOpen(value=>!value)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button><button type="button" className={`homeWorkFilterToggle ${activeFilterCount?"active":""}`} aria-label="Filter Orders" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><span className="homeFilterGlyph" aria-hidden="true"><i/><i/><i/></span>{activeFilterCount>0&&<em>{activeFilterCount}</em>}</button></div>}</div>
      {workMode!=="sync"&&searchOpen&&<form id="home-order-search" className="homeOrderSearch" onSubmit={event=>{event.preventDefault();document.querySelector<HTMLInputElement>(".homeOrderSearch input")?.focus();}}><input ref={searchInput} type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search any order detail" aria-label="Search Home Orders"/><button type="submit" className="homeWorkFilterToggle" aria-label="Submit Order Search" title="Search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form>}
      {workMode!=="sync"&&filtersOpen&&<div className="seikoDashboardActivityFilters"><label>Visible Rows <select value={config.activeOrderPageSize} onChange={event=>setConfig(current=>({...current,activeOrderPageSize:Number(event.target.value) as 5|10|20}))}><option>5</option><option>10</option><option>20</option></select></label><select aria-label="Filter by Order Status" value={status} onChange={event=>setStatus(event.target.value)}><option value="">All Statuses</option>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select><select value={clientType} onChange={event=>{setClientType(event.target.value);setProduct("");}}><option value="">All Client Types</option>{clientTypes.map(value=><option key={value}>{value}</option>)}</select><select value={product} onChange={event=>setProduct(event.target.value)}><option value="">All Products</option>{products.map(value=><option key={value}>{value}</option>)}</select><button type="button" className="textButton" aria-label="Clear All Order Filters" onClick={clearFilters}>Clear Filters</button></div>}
      {workMode==="sync"?<div className="seikoDashboardQueueList">{scanQueue.length?scanQueue.slice(0,config.activeOrderPageSize).map((item,index)=><article key={`${queueTitle(item,index)}-${index}`}><b>{queueTitle(item,index)}</b><span>{queueTime(item)||"Waiting to Sync"}</span></article>):<div className="seikoDashboardActivityEmpty">All scans are synced.</div>}</div>:<HomeOrderList orders={filtered} rows={config.activeOrderPageSize} resetKey={[query,status,clientType,product,workMode,focus].join("|")}/>}
    </section>}
  </section>;
}


function HomeOrderList({orders, rows, resetKey}: {orders: SeikoOrder[]; rows: number; resetKey: string}) {
  const host = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({key:"", top:0});
  const [mobile, setMobile] = useState(false);
  useEffect(()=>{const media=window.matchMedia("(max-width: 900px)"); const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const rowHeight = mobile ? 184 : 88;
  const scrollKey=[resetKey,rows,rowHeight].join("|");
  const offset=scroll.key===scrollKey?scroll.top:0;
  useEffect(()=>{if(host.current)host.current.scrollTop=0;},[scrollKey]);
  const start=Math.min(Math.max(0,Math.floor(offset/rowHeight)-2),Math.max(0,orders.length-rows));
  const end=Math.min(orders.length,start+rows+4);
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to focus and scroll this overflow region.
  return <div ref={host} className="seikoDashboardOrderList homeOrderScroll" role="region" aria-label="Home Orders" tabIndex={0} style={{height: Math.min(rows,Math.max(1,orders.length))*rowHeight}} onScroll={event=>setScroll({key:scrollKey,top:event.currentTarget.scrollTop})}>
    <div aria-hidden="true" style={{height:start*rowHeight}}/>
    {orders.length?orders.slice(start,end).map(order=><article className="seikoDashboardActivityRow homeOrderOperationalRow" key={order.orderId}><button type="button" className="homeOrderOpen" title={`${order.details.orderNo} · ${order.details.clientName}`} onClick={()=>openSeikoOrder(order)}><strong>{order.details.orderNo||order.orderId}</strong><span>{order.details.clientName||"Client"}</span></button><HomeOrderDetails order={order}/><div className="homeOrderStatus"><OrderWorkflowButton businessId="seiko" order={order}/></div><HomeOrderActions order={order}/></article>):<div className="seikoDashboardActivityEmpty">No orders match your search or filters.</div>}
    <div aria-hidden="true" style={{height:(orders.length-end)*rowHeight}}/>
  </div>;
}
function HomeOrderDetails({order}:{order:SeikoOrder}){
 const anchor=useRef<HTMLButtonElement>(null),[position,setPosition]=useState<{left:number;top:number}|null>(null);
 const show=()=>{const box=anchor.current?.getBoundingClientRect();if(box)setPosition({left:Math.max(10,Math.min(box.left,innerWidth-Math.min(400,innerWidth-20)-10)),top:Math.max(10,Math.min(box.bottom+5,innerHeight-300))});};
 useEffect(()=>{if(!position)return;const close=(event:Event)=>{if(!anchor.current?.contains(event.target as Node))setPosition(null);};const scroll=()=>setPosition(null);document.addEventListener('pointerdown',close);window.addEventListener('scroll',scroll,true);return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('scroll',scroll,true);};},[position]);
 return <span className="homeOrderOperationalMeta"><button ref={anchor} className="homeOrderDetailsTrigger" type="button" aria-label={`Order Details for ${order.details.orderNo}`} aria-expanded={Boolean(position)} onPointerEnter={event=>{if(event.pointerType!=='touch')show();}} onPointerLeave={event=>{if(event.pointerType!=='touch')setPosition(null);}} onFocus={show} onBlur={()=>setPosition(null)} onClick={show} onKeyDown={event=>{if(event.key==='Escape')setPosition(null);}}><span><small>Records</small><b>{order.records.length}</b></span><span><small>Products</small><b>{order.products.filter(product=>product.name.trim()).length}</b></span></button>{position&&createPortal(<div className="homeOrderDetailsPopover" role="tooltip" aria-label={`Order Details for ${order.details.orderNo}`} style={{left:position.left,top:position.top}}><b>{order.details.orderNo} · {order.details.clientName}</b>{order.products.filter(product=>product.name.trim()).map(product=>{const quantity=product.quantityMode==='order_total'?product.orderTotal:order.records.reduce((sum,record,index)=>sum+(record.held?0:quantityForRecord(product,record,index===0)),0);return <section key={product.id}><strong>{product.name} · {quantity}</strong>{product.specifications.map(spec=>{const values=[...new Set(order.records.filter((record,index)=>!record.held&&quantityForRecord(product,record,index===0)>0).map(record=>specificationForRecord(spec,record)).filter(Boolean))];const value=values.join(', ')||spec.defaultValue;return value?<span key={spec.id}>{spec.name}: {value}</span>:null;})}</section>;})}<footer>Delivery: {order.details.deliveryDate?new Date(order.details.deliveryDate+'T00:00:00').toLocaleDateString('en-IN'):'Not Scheduled'}</footer></div>,document.body)}</span>;
}
function HomeOrderActions({order}:{order:SeikoOrder}){
 const {membership,can}=useAccess(),[busy,setBusy]=useState(false),[handover,setHandover]=useState(false);
 async function mutate(operation:'archive'|'delete'){if(busy)return;let confirmOrderNo='';if(operation==='delete'){const entered=window.prompt(`Type ${order.details.orderNo} to permanently delete this order. Orders with financial records must be archived instead.`);if(entered===null)return;confirmOrderNo=entered;}setBusy(true);try{await changeSharedOrder('seiko',order.orderId,operation==='archive'?{operation,archived:!order.archived}:{operation,confirmOrderNo});}catch(cause){window.alert((cause as Error).message);}finally{setBusy(false);}}
 return <><OrderActionsMenu order={order} busy={busy} onWorkspace={()=>requestAppNavigation(()=>window.dispatchEvent(new CustomEvent('seiko:open-order-workspace',{detail:order})))} onFinancial={action=>openOrderFinancialAction(order.orderId,action)} onHandover={()=>setHandover(true)} onManagement={()=>requestAppNavigation(()=>window.dispatchEvent(new CustomEvent('seiko:open-order-workspace',{detail:{order,management:true}})))} onProduction={membership?.modules.includes('production')?()=>window.dispatchEvent(new CustomEvent('seiko:production-order',{detail:order.orderId})):undefined} onSetup={()=>requestAppNavigation(()=>window.dispatchEvent(new CustomEvent("seiko:open-order",{detail:order})))} onLabels={()=>openLabelCreation({businessId:'seiko',orderId:order.orderId})} onArchive={()=>{if(can('orders.edit'))void mutate('archive');}} onDelete={()=>{if(can('orders.edit'))void mutate('delete');}}/>{handover&&createPortal(<OrderHandoverPreview order={order} businessId="seiko" onClose={()=>setHandover(false)}/>,document.body)}</>;
}
