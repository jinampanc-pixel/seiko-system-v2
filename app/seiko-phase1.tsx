"use client";

import "./seiko-billing-polish.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readOrderCache } from "./lib/order-cache";
import { changeSharedOrder } from "./lib/order-commands";
import { ORDER_STATUSES, type OrderStatus, type SeikoOrder } from "./lib/order-domain";
import { startDomEnhancement } from "./lib/dom-enhancement";

type MetricKey = "active" | "completed" | "sync";
type QuickAccessKey = "Production" | "Labels" | "Scan station" | "Trace";
type HomeConfig = {
  metrics: Record<MetricKey, boolean>;
  showActiveOrders: boolean;
  activeOrderPageSize: 5 | 10 | 20;
  quickAccess: Record<QuickAccessKey, boolean>;
};

const HOME_KEY = "jinam:seiko:home-config-v3";
const DEFAULT_HOME: HomeConfig = {
  metrics: { active: true, completed: true, sync: true },
  showActiveOrders: true,
  activeOrderPageSize: 10,
  quickAccess: { Production: true, Labels: true, "Scan station": true, Trace: true },
};

function openSeikoModule(label: string, afterOpen?: () => void) {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const target = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav")).find(button => button.querySelector("small")?.textContent?.trim() === label);
    target?.click();
    if (afterOpen) window.setTimeout(afterOpen, 60);
  }, 0);
}

function openSeikoOrder(order: SeikoOrder) {
  openSeikoModule("Orders", () => {
    const search = document.querySelector<HTMLInputElement>(".ordersPage .orderTools input");
    if (!search) return;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(search, order.details.orderNo || order.details.clientName);
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.dispatchEvent(new Event("change", { bubbles: true }));
    window.setTimeout(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>(".ordersPage .orderRow")).find(item => item.querySelector("b")?.textContent?.trim() === order.details.orderNo);
      row?.querySelector<HTMLButtonElement>(".openOrderButton")?.click();
    }, 50);
  });
}

function openNewOrder() {
  window.dispatchEvent(new Event("seiko:new-order"));
}

function openBillingAction(action: "payment" | "invoice" | "quotation" | "challan") {
  window.dispatchEvent(new CustomEvent("seiko:open-billing", { detail: { action } }));
}

function readHomeConfig(): HomeConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) || "null") as Partial<HomeConfig> | null;
    if (!saved) return DEFAULT_HOME;
    return {
      metrics: {
        active: saved.metrics?.active ?? true,
        completed: saved.metrics?.completed ?? true,
        sync: saved.metrics?.sync ?? true,
      },
      showActiveOrders: saved.showActiveOrders ?? true,
      activeOrderPageSize: [5, 10, 20].includes(Number(saved.activeOrderPageSize)) ? Number(saved.activeOrderPageSize) as 5 | 10 | 20 : 10,
      quickAccess: {
        Production: saved.quickAccess?.Production ?? true,
        Labels: saved.quickAccess?.Labels ?? true,
        "Scan station": saved.quickAccess?.["Scan station"] ?? true,
        Trace: saved.quickAccess?.Trace ?? true,
      },
    };
  } catch { return DEFAULT_HOME; }
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
        moduleGrid.setAttribute("aria-label", "Quick access");
        moduleGrid.querySelectorAll<HTMLElement>(".moduleCard").forEach(card => {
          if (card.querySelector("h3")?.textContent?.trim() === "Orders") card.hidden = true;
        });
        if (!moduleGrid.querySelector(".seikoProductionQuickCard")) {
          const production = document.createElement("button");
          production.type = "button";
          production.className = "moduleCard seikoProductionQuickCard";
          production.innerHTML = "<h3>Production</h3><p>Open production work, progress and operational handoffs.</p><b>Open production →</b>";
          production.addEventListener("click", () => openSeikoModule("Production"));
          const labels = Array.from(moduleGrid.querySelectorAll<HTMLElement>(".moduleCard")).find(card => card.querySelector("h3")?.textContent?.trim() === "Labels");
          if (labels) moduleGrid.insertBefore(production, labels); else moduleGrid.appendChild(production);
        }
        setDashboardHost(current => current === host ? current : host);
      } else {
        setDashboardHost(null);
      }

      document.querySelectorAll<HTMLButtonElement>(".moduleMenu .nav").forEach(button => {
        const label = button.querySelector("small")?.textContent?.trim();
        if (["Inventory", "Sales", "Delivery"].includes(label || "")) button.style.display = "none";
      });

      const setupBack = document.querySelector<HTMLButtonElement>(".orderSetup .orderPageHead .secondary");
      if (setupBack && setupBack.textContent?.trim() === "Cancel") setupBack.textContent = "← Back to Order Center";
      document.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
        const text = button.textContent?.trim();
        if (text === "Order Center") button.textContent = "← Back to Orders";
        if (text === "Back" && button.closest(".ordersPage,.orderSetup,.workspacePage")) button.textContent = "← Back to Orders";
        if (text === "Back" && button.closest(".labelCreateApp,.labelDesigner")) button.textContent = "← Back to Labels";
        if (button.textContent?.trim().startsWith("← Back")) button.classList.add("contextBackButton");
      });

    });
    return () => controller.stop();
  }, []);

  return dashboardHost ? createPortal(<SeikoDashboard/>, dashboardHost) : null;
}

function SeikoDashboard() {
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [scanQueue, setScanQueue] = useState<Array<Record<string, unknown>>>([]);
  const [config, setConfig] = useState<HomeConfig>(() => readHomeConfig());
  const [customizing, setCustomizing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workMode, setWorkMode] = useState<MetricKey>("active");
  const [query, setQuery] = useState(""), [clientType, setClientType] = useState(""), [product, setProduct] = useState(""), [status, setStatus] = useState("");
  useEffect(() => { const load=()=>{try{setOrders(readOrderCache("seiko"));}catch{setOrders([]);}try{setScanQueue(JSON.parse(localStorage.getItem("jinam:seiko:scan-queue")||"[]") as Array<Record<string,unknown>>);}catch{setScanQueue([]);}};queueMicrotask(load);window.addEventListener("storage",load);window.addEventListener("seiko:orders-cache-updated",load as EventListener);window.addEventListener("seiko:scan-queue-updated",load);window.addEventListener("focus",load);return()=>{window.removeEventListener("storage",load);window.removeEventListener("seiko:orders-cache-updated",load as EventListener);window.removeEventListener("seiko:scan-queue-updated",load);window.removeEventListener("focus",load);};},[]);
  useEffect(()=>{localStorage.setItem(HOME_KEY,JSON.stringify(config));document.querySelectorAll<HTMLButtonElement>(".overview .moduleGrid .moduleCard").forEach(card=>{const title=card.querySelector("h3")?.textContent?.trim();if(title==="Orders"){card.hidden=true;return;}if(title&&title in config.quickAccess)card.hidden=!config.quickAccess[title as QuickAccessKey];});},[config]);
  const activeOrders=useMemo(()=>orders.filter(order=>!order.archived&&!["Completed","Cancelled"].includes(order.status)),[orders]);
  const completedOrders=useMemo(()=>orders.filter(order=>!order.archived&&order.status==="Completed"),[orders]);
  const activeStatusOptions=useMemo(()=>ORDER_STATUSES.filter(value=>!["Completed","Cancelled"].includes(value)),[]);
  const orderScope=workMode==="completed"?completedOrders:activeOrders;
  const clientTypes=useMemo(()=>[...new Set(orderScope.map(order=>order.details.clientType).filter(Boolean))].sort(),[orderScope]);
  const products=useMemo(()=>[...new Set(orderScope.filter(order=>!clientType||order.details.clientType===clientType).flatMap(order=>order.products.map(item=>item.name).filter(Boolean)))].sort(),[clientType,orderScope]);
  const searchEntries = useMemo(() => orderScope.map(order => ({ order, text: JSON.stringify([order.orderId, order.details, order.status, order.fields, order.products, order.measurements, order.records]).toLowerCase() })).sort((a,b) => (Date.parse(b.order.updatedAt)||0)-(Date.parse(a.order.updatedAt)||0) || a.order.orderId.localeCompare(b.order.orderId)), [orderScope]);
  const filtered = useMemo(() => searchEntries.filter(({order,text}) => (!clientType || order.details.clientType===clientType) && (!product || order.products.some(item=>item.name===product)) && (!status || order.status===status) && query.trim().toLowerCase().split(/\s+/).every(term=>text.includes(term))).map(entry=>entry.order), [searchEntries,clientType,product,status,query]);
  const activeFilterCount=[query.trim(),status,clientType,product].filter(Boolean).length;
  const clearFilters=()=>{setQuery("");setStatus("");setClientType("");setProduct("");};
  const changeStatus = async (orderId: string, next: OrderStatus) => {
    try { await changeSharedOrder("seiko", orderId, { operation: "status", status: next }); }
    catch (cause) { window.alert((cause as Error).message); }
  };
  const metrics=[{key:"active" as MetricKey,label:"ACTIVE ORDERS",value:activeOrders.length,note:"Currently open work"},{key:"completed" as MetricKey,label:"COMPLETED ORDERS",value:completedOrders.length,note:"Completed work"},{key:"sync" as MetricKey,label:"SCAN SYNC QUEUE",value:scanQueue.length,note:scanQueue.length?"Waiting to sync":"All scans synced"}];
  const queueTitle=(item:Record<string,unknown>,index:number)=>String(item.token||item.labelToken||item.id||`Queued scan ${index+1}`),queueTime=(item:Record<string,unknown>)=>String(item.createdAt||item.at||item.timestamp||"");
  return <section className="seikoOperationalDashboard"><div className="seikoDashboardHead"><div><h1>Home</h1><p>Configurable operational dashboard and quick access to working modules.</p></div><div className="seikoDashboardHeadActions"><button type="button" className="secondary" onClick={()=>setCustomizing(value=>!value)}>{customizing?"Done":"Customize dashboard"}</button></div></div>
    {customizing&&<section className="seikoHomeCustomizer panel" aria-label="Customize Home"><div><b>Dashboard</b><p>Choose the live operational views shown on Home. More business metrics can be registered here as Sales, Payments and Production data mature.</p></div><div className="seikoHomeOptionGrid">{metrics.map(metric=><label key={metric.key}><input type="checkbox" checked={config.metrics[metric.key]} onChange={event=>setConfig(current=>({...current,metrics:{...current.metrics,[metric.key]:event.target.checked}}))}/>{metric.label}</label>)}<label><input type="checkbox" checked={config.showActiveOrders} onChange={event=>setConfig(current=>({...current,showActiveOrders:event.target.checked}))}/>Operational list</label></div><div><b>Quick access</b><p>Choose implemented module shortcuts.</p></div><div className="seikoHomeOptionGrid">{(Object.keys(config.quickAccess) as QuickAccessKey[]).map(item=><label key={item}><input type="checkbox" checked={config.quickAccess[item]} onChange={event=>setConfig(current=>({...current,quickAccess:{...current.quickAccess,[item]:event.target.checked}}))}/>{item}</label>)}</div></section>}
    <div className="seikoDashboardMetrics">{metrics.filter(metric=>config.metrics[metric.key]).map(metric=><button type="button" className={`seikoMetricCard seikoMetricReadout ${workMode===metric.key?"active":""} ${metric.key==="sync"&&!metric.value?"positive":""}`} key={metric.key} onClick={()=>{setWorkMode(metric.key);setFiltersOpen(false);clearFilters();}}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></button>)}</div>
    <section className="seikoDailyActions" aria-label="Daily quick actions"><div><b>Daily actions</b><p>Start frequent work directly from Home.</p></div><div className="seikoDailyActionGrid"><button type="button" className="primary" onClick={openNewOrder}>+ New order</button><button type="button" className="primary" onClick={()=>openBillingAction("payment")}>Record payment</button><button type="button" className="secondary" onClick={()=>openBillingAction("invoice")}>Create invoice</button><button type="button" className="secondary" onClick={()=>openBillingAction("challan")}>Delivery challan</button><button type="button" className="secondary" onClick={()=>openBillingAction("quotation")}>Quotation</button><button type="button" className="secondary" onClick={()=>openSeikoModule("Labels")}>Packing labels</button></div></section>
    {config.showActiveOrders&&<section className="seikoDashboardActivity"><div className="seikoDashboardActivityHead"><div><b>{workMode==="active"?"Active orders":workMode==="completed"?"Completed orders":"Scan sync queue"}</b><p>{workMode==="sync"?`${scanQueue.length} scan${scanQueue.length===1?"":"s"} waiting or syncing.`:`${filtered.length} of ${orderScope.length} order${orderScope.length===1?"":"s"} shown.`}</p></div>{workMode!=="sync"&&<button type="button" className={`homeWorkFilterToggle ${activeFilterCount?"active":""}`} aria-label="Filter orders" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(value=>!value)}><span className="homeFilterGlyph" aria-hidden="true"><i/><i/><i/></span>{activeFilterCount>0&&<em>{activeFilterCount}</em>}</button>}</div>
      {workMode!=="sync"&&<form className="homeOrderSearch" onSubmit={event=>{event.preventDefault();document.querySelector<HTMLInputElement>(".homeOrderSearch input")?.focus();}}><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search any order detail" aria-label="Search Home orders"/><button type="submit" className="secondary">Search</button><label>Visible rows <select value={config.activeOrderPageSize} onChange={event=>setConfig(current=>({...current,activeOrderPageSize:Number(event.target.value) as 5|10|20}))}><option>5</option><option>10</option><option>20</option></select></label></form>}
      {workMode!=="sync"&&filtersOpen&&<div className="seikoDashboardActivityFilters"><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">{workMode==="active"?"All active statuses":"Completed"}</option>{(workMode==="active"?activeStatusOptions:["Completed"] as OrderStatus[]).map(value=><option key={value}>{value}</option>)}</select><select value={clientType} onChange={event=>{setClientType(event.target.value);setProduct("");}}><option value="">All client types</option>{clientTypes.map(value=><option key={value}>{value}</option>)}</select><select value={product} onChange={event=>setProduct(event.target.value)}><option value="">All products</option>{products.map(value=><option key={value}>{value}</option>)}</select><button type="button" className="textButton" aria-label="Clear all order filters" onClick={clearFilters}>Clear filters</button></div>}
      {workMode==="sync"?<div className="seikoDashboardQueueList">{scanQueue.length?scanQueue.slice(0,config.activeOrderPageSize).map((item,index)=><article key={`${queueTitle(item,index)}-${index}`}><b>{queueTitle(item,index)}</b><span>{queueTime(item)||"Waiting to sync"}</span></article>):<div className="seikoDashboardActivityEmpty">All scans are synced.</div>}</div>:<HomeOrderList orders={filtered} rows={config.activeOrderPageSize} resetKey={[query,status,clientType,product,workMode].join("|")} changeStatus={changeStatus}/>}
    </section>}
  </section>;
}


function HomeOrderList({orders, rows, resetKey, changeStatus}: {orders: SeikoOrder[]; rows: number; resetKey: string; changeStatus: (id: string, status: OrderStatus)=>Promise<void>}) {
  const host = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({key:"", top:0});
  const [mobile, setMobile] = useState(false);
  useEffect(()=>{const media=window.matchMedia("(max-width: 900px)"); const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const rowHeight = mobile ? 216 : 88;
  const scrollKey=[resetKey,rows,rowHeight].join("|");
  const offset=scroll.key===scrollKey?scroll.top:0;
  useEffect(()=>{if(host.current)host.current.scrollTop=0;},[scrollKey]);
  const start=Math.min(Math.max(0,Math.floor(offset/rowHeight)-2),Math.max(0,orders.length-rows));
  const end=Math.min(orders.length,start+rows+4);
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to focus and scroll this overflow region.
  return <div ref={host} className="seikoDashboardOrderList homeOrderScroll" role="region" aria-label="Home orders" tabIndex={0} style={{height: Math.min(rows,Math.max(1,orders.length))*rowHeight}} onScroll={event=>setScroll({key:scrollKey,top:event.currentTarget.scrollTop})}>
    <div aria-hidden="true" style={{height:start*rowHeight}}/>
    {orders.length?orders.slice(start,end).map(order=><article className="seikoDashboardActivityRow homeOrderOperationalRow" key={order.orderId}><button type="button" className="homeOrderOpen" onClick={()=>openSeikoOrder(order)}><strong>{order.details.orderNo||order.orderId}</strong><span>{order.details.clientName||"Client"}</span><small>{order.details.clientType} · {order.records.length} records</small></button><span className="homeOrderOperationalMeta"><span><small>Records</small><b>{order.records.length}</b></span><span><small>Products</small><b>{order.products.filter(item=>item.name.trim()).length}</b></span><span><small>Delivery</small><b>{order.details.deliveryDate||"Not set"}</b></span></span><label className="homeOrderStatus"><small>Status</small><select value={order.status} onChange={event=>changeStatus(order.orderId,event.target.value as OrderStatus)}>{ORDER_STATUSES.map(value=><option key={value}>{value}</option>)}</select></label></article>):<div className="seikoDashboardActivityEmpty">No orders match your search or filters.</div>}
    <div aria-hidden="true" style={{height:(orders.length-end)*rowHeight}}/>
  </div>;
}
