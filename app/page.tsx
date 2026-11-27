"use client";
import {AppInstallationSettings} from "./app-installation";
import {openLabelCreation} from "./lib/label-creation";
import { uiStatusLabel } from "./lib/ui-copy";
import { MenuLayoutEditor } from "./menu-layout-editor";
import { HomePreferencesEditor } from "./home-preferences-editor";
import { rememberSettingsReturn } from "./app-back-link";
import { RetainedScreen } from "./retained-screen";
import { SavedOutputRecordDetails, useSavedOutputRecords } from "./saved-output-record";

import { readLabelStorage } from "./lib/label-storage";
import { mergeScanAcknowledgements } from "./lib/scan-queue";
import { RecordTrace } from "./record-trace";
import { CloseIcon } from "./ui-icons";

/* Exact business logos are served unchanged; image optimization is intentionally disabled. */
/* eslint-disable @next/next/no-img-element */

import { requestAppNavigation, useModuleNavigation } from "./app-navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAccess } from "./access-control";
import { BillingProfileEditor, requestBillingProfile, type ProfileState } from "./billing-profile-editor";
import { callSeiko } from "./lib/seiko-api";
import { Orders } from "./orders";
import { BusinessAssistant } from "./business-assistant";
import { SavedLabelWorkspace } from "./saved-label-workspace";
import { Production } from "./production-workspace";
import { type SeikoOrder } from "./lib/order-domain";
import { useCachedOrders } from "./lib/use-cached-orders";
import { businessStorageKey, canAccess, deriveThemeFromLogo, normalizeMembership, THEME_PRESETS, themeVariables, type BusinessMembership, type BusinessTheme, type FoundationBootstrap, type Module } from "./lib/foundation";

type ScanEvent = { id: string; token: string; operation: string; at: string; status: "SYNCED" | "PENDING" | "REJECTED" };



const operations = [
  { state: "CUT", label: "Cutting Complete" },
  { state: "STITCHING", label: "Start Stitching" },
  { state: "STITCHED", label: "Stitching Complete" },
  { state: "FINISHED", label: "Finishing Complete" },
  { state: "PACKED", label: "Packed" },
  { state: "CHALLAN_CREATED", label: "Challan Created" },
  { state: "DISPATCHED", label: "Dispatched" },
  { state: "DELIVERED", label: "Delivered" },
];

const previewBusinesses: BusinessMembership[] = [
  normalizeMembership({ businessId: "seiko", businessName: "Seiko", logoUrl: "/brands/seiko-logo-approved.webp", role: "owner", modules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"], theme: THEME_PRESETS.seiko }),
  normalizeMembership({ businessId: "veyn-health", businessName: "Veyn Health", logoUrl: "/brands/veyn-health-logo.png", role: "owner", modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"], theme: THEME_PRESETS.veyn }),
  normalizeMembership({ businessId: "meth", businessName: "MeTh", logoUrl: "/brands/meth-logo.jpg", role: "owner", modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"], theme: THEME_PRESETS.meth }),
  normalizeMembership({ businessId: "veyn-view", businessName: "Veyn Health · Read only", logoUrl: "/brands/veyn-health-logo.png", role: "viewer", modules: ["home", "trace"], theme: THEME_PRESETS.veyn }),
];

export default function Home() {
  const {can:canPermission}=useAccess();
  const {module,setModule,back:moduleBack,reset:resetNavigation,restore:restoreModule,backLabel:moduleBackLabel}=useModuleNavigation();
  const [newOrderRequest, setNewOrderRequest] = useState(0);
  const [orderVisit,setOrderVisit]=useState(0),[productionVisit,setProductionVisit]=useState(0);
  const [assistantOrderId, setAssistantOrderId] = useState<string>();
  const [productionOrderId,setProductionOrderId]=useState<string|undefined>();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [businesses, setBusinesses] = useState<BusinessMembership[]>(previewBusinesses);
  const [businessId, setBusinessId] = useState(previewBusinesses[0].businessId);
  useEffect(()=>resetNavigation(),[businessId,resetNavigation]);
  useEffect(()=>{if(businessId==="seiko")document.body.dataset.seikoPalette="true";else delete document.body.dataset.seikoPalette;return()=>{delete document.body.dataset.seikoPalette;};},[businessId]);
  const [themeOverrides, setThemeOverrides] = useState<Record<string, BusinessTheme>>({});
  const [themeOpen, setThemeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(()=>{const open=()=>{setThemeOpen(true);setNavOpen(false);};window.addEventListener("jinam:open-settings",open);return()=>window.removeEventListener("jinam:open-settings",open);},[]);
  useEffect(()=>{const open=(event:Event)=>{setProductionOrderId((event as CustomEvent<string>).detail);setModule("production");setNavOpen(false);};window.addEventListener("seiko:production-order",open);return()=>window.removeEventListener("seiko:production-order",open);},[]);
  const [serviceOriginModule,setServiceOriginModule]=useState<Module>("home");
  const [serviceOrder,setServiceOrder]=useState<SeikoOrder|null>(null);
  useEffect(()=>{const open=(e:Event)=>{setServiceOriginModule(module);setServiceOrder((e as CustomEvent<SeikoOrder>).detail);setModule("orders",{preserveDraft:true});setNavOpen(false);};window.addEventListener("seiko:open-order-service",open);return()=>window.removeEventListener("seiko:open-order-service",open);},[module,setModule]);
  const [entryOrder,setEntryOrder]=useState<SeikoOrder|null>(null);
  useEffect(()=>{const open=(event:Event)=>{setEntryOrder((event as CustomEvent<SeikoOrder>).detail);setNewOrderRequest(0);setModule("orders");};window.addEventListener("seiko:open-order",open);return()=>window.removeEventListener("seiko:open-order",open);},[setModule]);
  const [labelOrder,setLabelOrder]=useState<SeikoOrder|null>(null);
  const [labelPurpose,setLabelPurpose]=useState<"production"|"packing"|"inventory"|null>(null);
  useEffect(()=>{const home=()=>requestAppNavigation(()=>{setModule("home");setNavOpen(false);setThemeOpen(false);setNewOrderRequest(0);setServiceOrder(null);setLabelOrder(null);window.dispatchEvent(new Event("seiko:home-arrived"));});window.addEventListener("seiko:home",home);return()=>window.removeEventListener("seiko:home",home);},[]);
  const [labelBatchOrder,setLabelBatchOrder]=useState<SeikoOrder|null>(null);
  const membership = businesses.find(item => item.businessId === businessId) || businesses[0];
  useEffect(() => {
    const create = () => {
      if (!canAccess(membership, "orders")) return;
      requestAppNavigation(()=>{setLabelOrder(null); setServiceOrder(null); setNavOpen(false);
      setNewOrderRequest(value => value + 1); setModule("orders");});
    };
    window.addEventListener("seiko:new-order", create);
    return () => window.removeEventListener("seiko:new-order", create);
  }, [membership]);
  const activeTheme = themeOverrides[businessId] || (businessId === "seiko" ? THEME_PRESETS.seiko : membership?.theme || THEME_PRESETS.jinam);
  const queueKey = businessStorageKey(businessId, "scan-queue");

  useEffect(() => {
    callSeiko<FoundationBootstrap>("foundationBootstrap").then(result => {
      if (!result.ok || !result.data.businesses?.length) return;
      const next = result.data.businesses.map(normalizeMembership).filter(item => item.modules.includes("home"));
      if (!next.length) return;
      const saved = localStorage.getItem("jinam:selected-business");
      setBusinesses(next);
      setBusinessId(next.some(item => item.businessId === saved) ? saved! : next[0].businessId);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem("jinam:selected-business", businessId);
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    queueMicrotask(() => setPending(queue.length));
  }, [businessId, queueKey]);

  useEffect(() => {
    const saved = localStorage.getItem(businessStorageKey(businessId, businessId === "seiko" ? "theme-v3" : "theme-v2"));
    if (!saved) return;
    try {
      const theme = JSON.parse(saved) as BusinessTheme;
      queueMicrotask(() => setThemeOverrides(current => ({ ...current, [businessId]: theme })));
    } catch { /* keep the configured business theme */ }
  }, [businessId]);

  const switchBusiness = (nextBusinessId: string) => requestAppNavigation(()=>{
    setBusinessId(nextBusinessId);
    setServiceOrder(null);setModule("home");
    setThemeOpen(false);
  });

  const saveTheme = (theme: BusinessTheme) => {
    setThemeOverrides(current => ({ ...current, [businessId]: theme }));
    localStorage.setItem(businessStorageKey(businessId, businessId === "seiko" ? "theme-v3" : "theme-v2"), JSON.stringify(theme));
  };

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
    queueMicrotask(() => setPending(queue.length));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, [queueKey]);

  useEffect(() => {
    if (!online || pending === 0) return;
    let cancelled = false;
    const flush = async () => {
      const queued = JSON.parse(localStorage.getItem(queueKey) || "[]") as Array<ScanEvent & { toState: string }>;
      const remaining: typeof queued = [];
      for (const item of queued) {
        const result = await callSeiko("recordScan", { token: item.token, toState: item.toState, requestKey: item.id }, businessId);
        if (!result.ok) remaining.push(item);
      }
      if (!cancelled) {
        const currentQueue = JSON.parse(localStorage.getItem(queueKey) || "[]");
        const nextQueue = mergeScanAcknowledgements(currentQueue, queued, remaining);
        localStorage.setItem(queueKey, JSON.stringify(nextQueue)); window.dispatchEvent(new Event("seiko:scan-queue-updated"));
        window.dispatchEvent(new CustomEvent("seiko:scans-synced",{detail:{businessId,ids:queued.filter(item=>!remaining.some(failed=>failed.id===item.id)).map(item=>item.id)}}));
        setPending(nextQueue.length);
      }
    };
    void flush().catch(() => { /* Keep the durable queue and stable request IDs for a later retry. */ });
    return () => { cancelled = true; };
  }, [businessId, online, pending, queueKey]);

  return <div className="app" style={themeVariables(activeTheme) as CSSProperties}>
    <div className="surface">
      <header className="topbar"><div className="compactBusinessPicker"><button type="button" className="globalHomeLogo" aria-label="Go to Home" onClick={()=>window.dispatchEvent(new Event("seiko:home"))}><span className={`businessMark logo-${businessId}`}>{membership?.logoUrl ? <img src={membership.logoUrl} alt=""/> : <b>{membership?.businessName?.slice(0, 1) || "J"}</b>}</span>{membership?.logoUrl && <span className={`businessWordmark logo-${businessId}`}><img src={membership.logoUrl} alt={`${membership.businessName} logo`}/></span>}</button><span className="srOnly">Active Business</span><select aria-label="Active Business" value={businessId} onChange={event => switchBusiness(event.target.value)}>{businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}</select></div><div className="topbarEnd">{pending > 0 && <div className="topActions"><span className="queue">{pending} Waiting to Sync</span></div>}<button className={`menuToggle ${navOpen ? "active" : ""}`} onClick={() => setNavOpen(open => !open)} aria-label={navOpen ? "Close Menu" : "Open Menu"} aria-expanded={navOpen}><span></span><span></span><span></span></button></div>{navOpen && <><button className="menuBackdrop" aria-label="Close Menu" onClick={() => setNavOpen(false)}/><nav className="moduleMenu" aria-label="Modules"><div className="moduleMenuHead"><b>Menu</b><button title="Close Menu" type="button" className="uiIconButton uiCloseButton" onClick={() => setNavOpen(false)} aria-label="Close Menu"><CloseIcon/></button></div><Nav icon="⌂" label="Home" active={module === "home"} onClick={() => { setNewOrderRequest(0); setModule("home"); setNavOpen(false); }}/>{canAccess(membership, "orders") && <Nav icon="≡" label="Orders" active={module === "orders"} onClick={() => { setOrderVisit(value=>value+1);setEntryOrder(null); setNewOrderRequest(0); setServiceOrder(null); setEntryOrder(null); setModule("orders"); setNavOpen(false); }}/>} {canAccess(membership, "labels") && <Nav icon="▤" label="Labels" active={module === "labels"} onClick={() => { setModule("labels"); setNavOpen(false); }}/>} {canAccess(membership, "scan") && <Nav icon="⌗" label="Scan" active={module === "scan"} onClick={() => { setModule("scan"); setNavOpen(false); }}/>} {canAccess(membership, "trace") && <Nav icon="◎" label="Trace" active={module === "trace"} onClick={() => { setModule("trace"); setNavOpen(false); }}/>} {(["production", "inventory", "sales", "delivery"] as Module[]).filter(item => canAccess(membership, item)).map(item => <Nav key={item} icon="•" label={title(item)} active={module === item} onClick={() => { if(item==="production"){setProductionOrderId(undefined);setProductionVisit(value=>value+1);}setModule(item); setNavOpen(false); }}/>) }<div className="moduleMenuSettings">{(canAccess(membership, "admin")||canPermission("financials.view")) && <Nav icon="⚙" label="Settings" active={themeOpen} onClick={() => window.dispatchEvent(new CustomEvent("jinam:open-settings"))}/>}<Nav icon="?" label="Help & Training" active={false} onClick={()=>{setNavOpen(false);window.dispatchEvent(new Event("jinam:open-help"));}}/></div></nav></>}</header>
      {themeOpen && createPortal(<ThemeCustomizer key={businessId} businessName={membership?.businessName || "Business"} theme={activeTheme} onSave={saveTheme} onClose={() => setThemeOpen(false)} />,document.body)}
      <main>{(["scan","trace","inventory","sales","delivery"] as Module[]).includes(module)&&<div className="moduleBackRow"><button type="button" className="appBackControl" onClick={moduleBack}>{moduleBackLabel}</button></div>}
        {module === "home" && <Overview membership={membership} onOpen={next => { setNewOrderRequest(0); setServiceOrder(null); setModule(next); }} />}
        {canAccess(membership, "orders") && <RetainedScreen key={"orders:"+businessId} active={module === "orders"}><Orders onAssistantContext={setAssistantOrderId} key={`${businessId}:${serviceOrder?.orderId||entryOrder?.orderId || "center"}:${newOrderRequest}:${orderVisit}`} initialService={Boolean(serviceOrder)} onServiceBack={()=>{setServiceOrder(null);restoreModule(serviceOriginModule);window.dispatchEvent(new Event("seiko:resume-billing"));}} homeLabel={moduleBackLabel} onHome={() => requestAppNavigation(()=>{ setNewOrderRequest(0); setServiceOrder(null); setLabelOrder(null); moduleBack(); setNavOpen(false); })} startNewOrder={newOrderRequest > 0} businessId={businessId} initialOrder={serviceOrder||entryOrder} canManageSuggestions={membership?.role === "owner" || membership?.role === "admin"} onOpenLabelBatches={order => { setLabelOrder(null); setLabelPurpose(null); setLabelBatchOrder(order); setModule("labels"); }}/></RetainedScreen>}
        {module === "labels" && canAccess(membership, "labels") && (labelOrder ? <SavedLabelWorkspace key={`${businessId}:${labelOrder.orderId}:${labelPurpose || "choose"}`} businessId={businessId} order={labelOrder} initialPurpose={labelPurpose} backLabel="← Back" onBack={() => { setLabelOrder(null); setLabelPurpose(null); }} canManageSizes={membership?.role === "owner" || membership?.role === "admin"}/> : <LabelLauncher onBack={moduleBack} backLabel={moduleBackLabel} businessId={businessId} focusedOrder={labelBatchOrder} onOpen={(order, purpose) => { setLabelBatchOrder(null); setLabelOrder(order); setLabelPurpose(purpose); }} onOpenOrders={() => { setLabelBatchOrder(null); setModule("orders"); }}/>)}
        {module === "scan" && canAccess(membership, "scan") && <Scanner businessId={businessId} queueKey={queueKey} onPending={setPending} />}
        {module === "trace" && canAccess(membership, "trace") && <RecordTrace key={businessId} businessId={businessId}/>}
        {canAccess(membership, "production") && <RetainedScreen key={"production:"+businessId} active={module === "production"}><Production key={`${businessId}:${productionOrderId||"all"}:${productionVisit}`} businessId={businessId} initialOrderId={productionOrderId} onHome={moduleBack} backLabel={moduleBackLabel} canManage={membership?.role === "owner" || membership?.role === "admin"}/></RetainedScreen>}
        {(["inventory", "sales", "delivery"] as Module[]).includes(module) && <section className="page"><div className="panel"><p className="eyebrow">{title(module).toUpperCase()}</p><h2>{title(module)}</h2><p>{module === "inventory" ? "Manage stock, materials and inventory label batches here." : "This module will be configured after the main navigation and home screen are finalised."}</p></div></section>}
      </main>
      <BusinessAssistant key={businessId} businessId={businessId} module={module} orderId={module === "orders" ? assistantOrderId : productionOrderId} onOpenOrder={order => requestAppNavigation(() => { setServiceOrder(null); setEntryOrder(order); setNewOrderRequest(0); setModule("orders"); setNavOpen(false); })}/>
    </div>
  </div>;
}

type SavedLabelBatch = {
  id: string;
  name: string;
  orderId: string;
  orderNo: string;
  client: string;
  purpose: "production" | "packing" | "inventory";
  sourceMode?: "person_product" | "person" | "product" | "group" | "order";
  personPackagePlan?: "together" | "sets" | "products";
  selectedRows: string[];
};

function packingBatchType(batch: SavedLabelBatch) {
  if (batch.purpose === "production") return "Garment lifecycle labels";
  if (batch.purpose === "inventory") return "Inventory labels";
  if (batch.sourceMode === "group") return "Grouped outer-package labels";
  if (batch.sourceMode === "order") return "Whole-order package labels";
  if (batch.sourceMode === "person") {
    if (batch.personPackagePlan === "sets") return "Person packages · one label per set";
    if (batch.personPackagePlan === "products") return "Person packages · separate by product";
    return "Person packages · selected products together";
  }
  return "Packing Labels";
}

export function LabelLauncher({businessId,focusedOrder,onOpen,onBack,backLabel="← Back"}:{onBack?:()=>void;backLabel?:string;businessId:string;focusedOrder?:SeikoOrder|null;onOpen:(order:SeikoOrder,purpose:"production"|"packing"|"inventory")=>void;onOpenOrders:()=>void}){
  const [query,setQuery]=useState("");
  const [batchQuery,setBatchQuery]=useState("");
  const [batchFilter,setBatchFilter]=useState<"all"|SavedLabelBatch["purpose"]>("all");
  const [sourceView,setSourceView]=useState<"orders"|"products">("orders");
  const [createPurpose,setCreatePurpose]=useState<SavedLabelBatch["purpose"]>("production");
  const [labelRevision,setLabelRevision]=useState(0);
  useEffect(()=>{const refresh=()=>setLabelRevision(value=>value+1);window.addEventListener("jinam:label-storage",refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener("jinam:label-storage",refresh);window.removeEventListener("storage",refresh);};},[]);
  const orders=useCachedOrders(businessId);
  const batches=useMemo(()=>{if(typeof window==="undefined")return[];try{return JSON.parse(readLabelStorage(`jinam:${businessId}:labels:tasks-v1`)||"[]") as SavedLabelBatch[]}catch{return[]}},[businessId,labelRevision]);
  const visible=orders.filter(order=>!order.archived&&(!focusedOrder||order.orderId===focusedOrder.orderId)&&`${order.details.orderNo} ${order.details.clientName} ${order.details.clientType} ${order.status}`.toLowerCase().includes(query.toLowerCase()));
  const allowedPurposes=focusedOrder?([['production','Production'],['packing','Packing']] as const):([['production','Production'],['packing','Packing'],['inventory','Inventory']] as const);
  const visibleBatches=batches.filter(batch=>(!focusedOrder||batch.orderId===focusedOrder.orderId)&&(batchFilter==="all"||batch.purpose===batchFilter)&&`${batch.name} ${batch.orderNo} ${batch.client} ${packingBatchType(batch)}`.toLowerCase().includes(batchQuery.toLowerCase()));
  const savedHistory=useSavedOutputRecords(businessId,"labels",visibleBatches.map(batch=>batch.id));
  const openBatch=(batch:SavedLabelBatch)=>{const order=orders.find(item=>item.orderId===batch.orderId);if(!order)return;sessionStorage.setItem(`jinam:${businessId}:labels:open-task`,batch.id);openLabelCreation({businessId,orderId:order.orderId,purpose:batch.purpose,taskId:batch.id})};
  return <div className="page labelLauncher">
    <section className="labelLauncherHead"><div>{onBack&&<button type="button" className="finalSessionBack appBackControl" onClick={onBack}>{backLabel}</button>}<p className="eyebrow">LABELS</p><h2>Labels</h2></div></section>
    <section className="labelBatchModule panel">
      <div className="labelBatchModuleHead"><h3>Label Batch Library</h3><div className="labelLibraryFilters"><select aria-label="Filter Label Batches" value={batchFilter} onChange={event=>setBatchFilter(event.target.value as typeof batchFilter)}><option value="all">All Batches</option><option value="production">Production</option><option value="packing">Packing</option>{!focusedOrder&&<option value="inventory">Inventory</option>}</select><input aria-label="Find a Saved Label Batch" placeholder="Find batch, order or client" value={batchQuery} onChange={event=>setBatchQuery(event.target.value)}/></div></div>
      {savedHistory.error&&<p className="savedRecordError" role="alert">{savedHistory.error} <button type="button" onClick={()=>void savedHistory.refresh()}>Retry History</button></p>}<div className="labelBatchModuleList">{visibleBatches.map(batch=><article key={batch.id} data-label-task-id={batch.id}><div><button type="button" className="labelSavedTitleButton" disabled={!orders.some(order=>order.orderId===batch.orderId)} onClick={()=>openBatch(batch)}><b>{batch.name}</b></button><small>{batch.orderNo} · {packingBatchType(batch)} · {batch.selectedRows.length} Labels</small></div><button disabled={!orders.some(order=>order.orderId===batch.orderId)} onClick={()=>openBatch(batch)}>Open</button><SavedOutputRecordDetails record={savedHistory.records[batch.id]} businessId={businessId} kind="labels" id={batch.id}/></article>)}{!visibleBatches.length&&<p className="emptyLibrary">{batches.length?"No matching batches.":"No saved batches yet."}</p>}</div>
    </section>
    <section className="labelOrderPicker panel"><div className="labelOrderPickerHead"><div><h3>Create a Label Batch</h3></div><div className="labelCreateFilters"><select aria-label="View Orders or Products" value={sourceView} onChange={event=>setSourceView(event.target.value as typeof sourceView)}><option value="orders">Orders</option><option value="products">Products</option></select><select aria-label="Label Use" value={createPurpose} onChange={event=>setCreatePurpose(event.target.value as typeof createPurpose)}>{allowedPurposes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input aria-label="Find an Order for Labels" placeholder={sourceView==="orders"?"Find order or client":"Find product, order or client"} value={query} onChange={event=>setQuery(event.target.value)}/></div></div><div className="labelOrderResults">{sourceView==="orders"?visible.map(order=><article key={order.orderId}><div><b>{order.details.orderNo}</b><strong>{order.details.clientName||'Unnamed client'}</strong><small>{order.details.clientType} · {order.records.length} Records · {uiStatusLabel(String(order.status ?? ""))}</small></div><div className="orderLabelActions"><button className="secondary" onClick={()=>onOpen(order,createPurpose)}>Create Label Batch</button></div></article>):visible.flatMap(order=>order.products.filter(product=>product.name?.toLowerCase().includes(query.toLowerCase())||`${order.details.orderNo} ${order.details.clientName}`.toLowerCase().includes(query.toLowerCase())).map(product=><article key={`${order.orderId}:${product.id}`}><div><b>{order.details.orderNo} · {order.details.clientName||'Unnamed client'}</b><strong>{product.name||'Unnamed product'}</strong><small>{uiStatusLabel(String(order.status ?? ""))} · {order.records.length} Records</small></div><div className="orderLabelActions"><button className="secondary" onClick={()=>onOpen(order,createPurpose)}>Create Label Batch</button></div></article>))}{!visible.length&&<div className="labelOrderEmpty"><b>No Matching Saved Orders</b></div>}</div></section>
  </div>
}

function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav ${active ? "active" : ""}`} onClick={()=>requestAppNavigation(onClick)}><span>{icon}</span><small>{label}</small></button>;
}

function title(m: Module) { return ({ home: "Operations", orders: "Order Center", labels: "Create Labels", scan: "Scan & record", trace: "Track & trace", production: "Production", inventory: "Inventory", sales: "Sales", delivery: "Delivery", admin: "Administration" } as const)[m]; }

function Overview({ membership, onOpen }: { membership?: BusinessMembership; onOpen: (m: Module) => void }) {
  const [portableScanner, setPortableScanner] = useState(false);
  useEffect(() => { queueMicrotask(() => setPortableScanner(navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches)); }, []);
  return <div className="page overview">
    <section className="hero"><div><span className="kicker">OPERATIONAL FOUNDATION</span><h2>One reliable path from order to delivery.</h2></div>{canAccess(membership, "scan") && <button className="primary heroButton" onClick={() => onOpen("scan")}>{portableScanner ? "Open Mobile Scanner" : "Open Scan Station"} <span>→</span></button>}</section>
    <div className="moduleGrid">
      {canAccess(membership, "orders") && <ModuleCard title="Orders" text="Client-specific products, policies, measurements and person-wise entries." action="Open Order Center" onClick={() => onOpen("orders")} />}
      {canAccess(membership, "labels") && <ModuleCard title="Labels" text="Information, barcode, QR, or combined 50 × 25 mm labels." action="Design labels" onClick={() => onOpen("labels")} />}
      {canAccess(membership, "scan") && <ModuleCard title="Scan Station" text={portableScanner ? "Use this device’s camera or a connected scan gun, with offline protection." : "Use a USB/Bluetooth scan gun or enter a label token; camera appears only when supported."} action="Open Scan Station" onClick={() => onOpen("scan")} />}
      {canAccess(membership, "trace") && <ModuleCard title="Trace" text="Browse an item’s identity, status and complete event history." action="Search history" onClick={() => onOpen("trace")} />}
    </div>
    {(["production", "sales", "delivery"] as Module[]).some(item => canAccess(membership, item)) && <section className="nextFlow"><div><span>COMING NEXT</span><h3>Production → Packing → Invoice → Delivery</h3></div></section>}
  </div>;
}

function ModuleCard({ title, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <button className="moduleCard" onClick={onClick}><h3>{title}</h3><b>{action} →</b></button>;
}

export function Scanner({ businessId, queueKey, onPending }: { businessId: string; queueKey: string; onPending: (n: number) => void }) {
  const [operation, setOperation] = useState(operations[0].state);
  const [token, setToken] = useState("");
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [scanError,setScanError]=useState("");
  const [recording,setRecording]=useState(false);
  const scanPending=useRef(false);
  const retryScan=useRef<ScanEvent|null>(null);
  useEffect(()=>{const synced=(event:Event)=>{const detail=(event as CustomEvent<{businessId:string;ids:string[]}>).detail;if(detail.businessId===businessId)setEvents(current=>current.map(item=>detail.ids.includes(item.id)?{...item,status:"SYNCED"}:item));};window.addEventListener("seiko:scans-synced",synced);return()=>window.removeEventListener("seiko:scans-synced",synced);},[businessId]);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const lastCameraToken = useRef("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [portableCamera, setPortableCamera] = useState(false);
  useEffect(() => { queueMicrotask(() => setPortableCamera(Boolean(navigator.mediaDevices?.getUserMedia) && navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches)); }, []);

  const submit = useCallback(async (value = token) => {
    const clean = value.trim();
    if (!clean || scanPending.current) return;
    scanPending.current=true;setRecording(true);setScanError("");
    const label = operations.find(o => o.state === operation)?.label || operation;
    const event: ScanEvent = retryScan.current?.token===clean&&retryScan.current.operation===label?{...retryScan.current,status:"PENDING"}:{ id: crypto.randomUUID(), token: clean, operation: label, at: new Date().toLocaleTimeString("en-IN"), status: "PENDING" };
    setEvents(current => [event, ...current.filter(item=>item.id!==event.id)]);
    try {
      const result = navigator.onLine ? await callSeiko("recordScan", { token: clean, toState: operation, requestKey: event.id }, businessId) : null;
      if (result?.ok) {
        setEvents(current => current.map(item => item.id === event.id ? { ...item, status: "SYNCED" } : item));
      } else {
        if(result&&!result.ok&&!["NETWORK_ERROR","BACKEND_TIMEOUT","BACKEND_UNAVAILABLE","BACKEND_NOT_CONNECTED","INVALID_BACKEND_RESPONSE"].includes(result.code))throw Error(result.message);
        const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
        if(!Array.isArray(queue))throw Error("The offline scan queue cannot be read. Keep this code and contact the administrator before retrying.");
        queue.push({ ...event, toState: operation });
        try { localStorage.setItem(queueKey, JSON.stringify(queue)); }
        catch { throw Error("This scan could not be saved on this device. The code remains in the input; keep it and retry when connected."); }
        window.dispatchEvent(new Event("seiko:scan-queue-updated")); onPending(queue.length);
      }
      retryScan.current=null;setToken("");
      if (navigator.vibrate) navigator.vibrate(result?.ok ? 70 : [80, 60, 80]);
    } catch(e) { retryScan.current=event;setToken(clean);setScanError((e as Error).message);setEvents(current=>current.map(item=>item.id===event.id?{...item,status:"REJECTED"}:item)); }
    finally {scanPending.current=false;setRecording(false);}
  }, [businessId, onPending, operation, queueKey, token]);

  const toggleCamera = async () => {
    if (camera) {
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      setCamera(false);
      setCameraMessage("");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamera(true);
      setCameraMessage("Camera ready. Hold one code inside the frame.");
      setTimeout(() => { if (video.current && stream.current) video.current.srcObject = stream.current; }, 0);
    } catch {
      alert("Camera permission was not granted. Open the app directly in Safari or Chrome, or use a scan gun/manual code.");
    }
  };

  useEffect(() => {
    if (!camera) return;
    type DetectorResult = { rawValue?: string };
    type Detector = { detect(source: HTMLVideoElement): Promise<DetectorResult[]> };
    type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) {
      queueMicrotask(() => setCameraMessage("Live decoding is not supported by this browser. Use Chrome, a scan gun, or paste the code."));
      return;
    }
    const detector = new DetectorClass({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"] });
    let reading = false;
    const timer = window.setInterval(async () => {
      if (reading || !video.current || video.current.readyState < 2) return;
      reading = true;
      try {
        const found = await detector.detect(video.current);
        const value = found[0]?.rawValue?.trim();
        if (value && value !== lastCameraToken.current) {
          lastCameraToken.current = value;
          setCameraMessage("Code detected. Checking and recording…");
          await submit(value);
          window.setTimeout(() => { lastCameraToken.current = ""; }, 1500);
        }
      } catch { /* keep scanning the next frame */ }
      finally { reading = false; }
    }, 350);
    return () => window.clearInterval(timer);
  }, [camera, submit]);

  useEffect(() => () => stream.current?.getTracks().forEach(track => track.stop()), []);

  return <div className="page scanPage"><div className="scanGrid">
    <section className="scanControl panel">
      <p className="eyebrow">OPERATION</p>
      <div className="operationGrid">{operations.map(item => <button className={item.state === operation ? "active" : ""} key={item.state} onClick={() => setOperation(item.state)}>{item.label}</button>)}</div>
      <label className="scanLabel" htmlFor="scan-code">Scan Code</label>
      <div className="scanInput"><input id="scan-code" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder={portableCamera ? "Scan gun, camera, or enter token" : "Scan gun or enter label token"}/><button disabled={recording||!token.trim()} onClick={() => submit()}>{recording?"Recording…":"Record Scan"}</button></div>
      {scanError&&<p role="alert">{scanError}</p>}
      {portableCamera && <button className={`cameraButton ${camera ? "stop" : ""}`} onClick={toggleCamera}>{camera ? "Stop Camera" : "Open Device Camera"}</button>}
      {camera && <><div className="camera"><video ref={video} autoPlay playsInline muted/><div className="scanFrame"/></div><p className="cameraMessage" role="status">{cameraMessage}</p></>}

    </section>
    <section className="activity panel">
      <div className="panelHead"><div><p className="eyebrow">THIS SESSION</p><h3>{events.length} Scans</h3></div><span className="liveDot">{recording?"Recording":"Scanner Ready"}</span></div>
      {events.length === 0 ?  null: events.map(event => <div className="event" key={event.id}><span className={`eventIcon ${event.status.toLowerCase()}`}>{event.status==="SYNCED"?"✓":event.status==="PENDING"?"…":"!"}</span><div><b>{event.operation}</b><small>{event.token}</small><small>{event.status==="SYNCED"?"Saved":event.status==="PENDING"?"Waiting to Sync":"Not Saved — Retry Required"}</small></div><time>{event.at}</time></div>)}
    </section>
  </div></div>;
}

function ThemeCustomizer({ businessName, theme, onSave, onClose }: { businessName: string; theme: BusinessTheme; onSave: (theme: BusinessTheme) => void; onClose: () => void }) {
  const { membership, businessId, can } = useAccess();
  const [billingProfile,setBillingProfile]=useState<ProfileState|null>(null);
  const [settingsError,setSettingsError]=useState("");
  const [draft, setDraft] = useState(theme);
  const [section, setSection] = useState<"appearance" | "users" | "billing" | "home" | "menu" | "app">("appearance");
  const [message, setMessage] = useState("");
  const colourFields: Array<[keyof BusinessTheme, string]> = [["primary", "Primary"], ["primaryAlt", "Secondary"], ["accent", "Accent"], ["background", "Background"], ["surface", "Surface"], ["ink", "Text"]];

  const analyseLogo = async (file?: File) => {
    if (!file) return;
    setMessage("Analysing logo colours…");
    try {
      const derived = await deriveThemeFromLogo(file, businessName);
      setDraft(derived); onSave(derived); setMessage("Logo palette applied.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The logo could not be analysed."); }
  };
  const openAccess = () => {
    onClose();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("jinam:open-access")), 0);
  };

  return <div className="themeScrim" style={themeVariables(theme) as CSSProperties} role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="themePanel" role="dialog" aria-modal="true" aria-labelledby="theme-title">
    <div className="themeHead"><div><p className="eyebrow">SYSTEM SETTINGS</p><h2 id="theme-title">Settings · {businessName}</h2></div><button title="Close Settings" type="button" className="uiIconButton uiCloseButton" onClick={onClose} aria-label="Close Settings"><CloseIcon/></button></div>
    <nav className="settingsModuleNav" aria-label="Settings Modules">
      <button type="button" className={section==="app"?"active":""} onClick={()=>setSection("app")}>App &amp; Updates</button>
      {businessId==="seiko"&&<button type="button" className={section==="menu"?"active":""} onClick={()=>setSection("menu")}>Menu Layout</button>}
      {businessId==="seiko"&&<button type="button" className={section==="home"?"active":""} onClick={()=>setSection("home")}>Home</button>}
      {can("audit.view")&&<a href={"/activity?business="+encodeURIComponent(businessId)} onClick={rememberSettingsReturn}>Activity history</a>}
      {membership?.role === "owner" && <a href="/backups" onClick={rememberSettingsReturn}>Backup &amp; recovery</a>}
      <button type="button" className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}><small>1</small><span>Appearance</span></button>
      {can("users.manage")&&<button type="button" className={section === "users" ? "active" : ""} onClick={() => setSection("users")}><span>Users & Access</span></button>}
      {businessId==="seiko"&&can("financials.view")&&<button type="button" className={section === "billing" ? "active" : ""} onClick={()=>setSection("billing")}>Billing & Assets</button>}
    </nav>
    {section === "app" ? <AppInstallationSettings/> : section === "menu" ? <MenuLayoutEditor/> : section === "home" ? <HomePreferencesEditor/> : section === "appearance" ? <div className="settingsAppearanceModule">
      <h3 className="settingsSectionTitle">Appearance</h3>
      <label className="themeField"><span>Preset Mood</span><select value="" onChange={event => { const preset = THEME_PRESETS[event.target.value]; if (preset) setDraft(preset); }}><option value="">Custom / Current</option><option value="seiko">Seiko · Operational</option><option value="veyn">Veyn · Clinical Organic</option><option value="meth">MeTh · Retail Energy</option></select></label>
      <label className="logoPicker"><span>Automatically Derive from Company Logo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => analyseLogo(event.target.files?.[0])}/></label>
      {message&&<p className="themeMessage" role="status">{message}</p>}
      <div className="colourGrid">{colourFields.map(([key, label]) => <label key={key}><span>{label}</span><input type="color" value={String(draft[key])} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/><code>{String(draft[key])}</code></label>)}</div>
      <label className="themeField"><span>Heading Style</span><select value={draft.headingFont} onChange={event => setDraft(current => ({ ...current, headingFont: event.target.value as BusinessTheme["headingFont"] }))}><option value="serif">Editorial Serif</option><option value="sans">Modern Sans Serif</option></select></label>
      <div className="themePreview" style={themeVariables(draft) as CSSProperties}><span>Live Mood Preview</span><b>{businessName}</b><button type="button">Primary Action</button></div>
      <div className="themeActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { onSave({ ...draft, name: `${businessName} custom` }); onClose(); }}>Save Theme</button></div>
    </div> : section==="billing" ? <section className="settingsUsersModule"><h3>Billing & Assets</h3><button type="button" className="secondary" onClick={()=>void requestBillingProfile({operation:"get"}).then(setBillingProfile).catch(e=>setSettingsError(e.message))}>Billing Settings & Assets</button>{settingsError&&<p role="alert">{settingsError}</p>}</section> : <section className="settingsUsersModule">
      <p className="eyebrow">USERS & ACCESS</p><h3>Users, Roles and Permissions</h3><button type="button" className="primary" onClick={openAccess}>Open Users & Access</button>
    </section>}
  </section>{billingProfile&&<BillingProfileEditor state={billingProfile} onClose={()=>setBillingProfile(null)} onSaved={()=>setBillingProfile(null)}/>}</div>;
}

