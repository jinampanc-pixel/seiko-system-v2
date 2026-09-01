"use client";
/* Exact business logos are served unchanged; image optimization is intentionally disabled. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { callSeiko } from "./lib/seiko-api";
import { Orders } from "./orders";
import { LabelDesigner } from "./label-designer";
import { Production } from "./production";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import { businessStorageKey, canAccess, deriveThemeFromLogo, normalizeMembership, THEME_PRESETS, themeVariables, type BusinessMembership, type BusinessTheme, type FoundationBootstrap, type Module } from "./lib/foundation";

type LabelMode = "INFO" | "BARCODE" | "QR" | "INFO_BARCODE" | "INFO_QR";
type ScanEvent = { id: string; token: string; operation: string; at: string; status: "SYNCED" | "PENDING" | "REJECTED" };
type LabelRecord = { id: string; name: string; group: string; product: string; size: string; qty: string; token: string };
type OrderOption = { orderId: string; orderNumber: string; client: string };

const demoRecords = [
  { id: "p1", name: "Arushi", group: "Class BV", product: "Collared T Shirt", size: "28", qty: "2", token: "S2A7C084DCB1E743AB94" },
  { id: "p2", name: "Evanshi", group: "Class BV", product: "Track Pant", size: "30", qty: "2", token: "S2642D4E2009494FDBB5" },
  { id: "p3", name: "Mokshi", group: "Class AV", product: "Collared T Shirt", size: "26", qty: "1", token: "S2324F4C2E0A734EF08F" },
];

const operations = [
  { state: "CUT", label: "Cutting complete" },
  { state: "STITCHING", label: "Start stitching" },
  { state: "STITCHED", label: "Stitching complete" },
  { state: "FINISHED", label: "Finishing complete" },
  { state: "PACKED", label: "Packed" },
  { state: "CHALLAN_CREATED", label: "Challan created" },
  { state: "DISPATCHED", label: "Dispatched" },
  { state: "DELIVERED", label: "Delivered" },
];

const previewBusinesses: BusinessMembership[] = [
  normalizeMembership({ businessId: "seiko", businessName: "Seiko", logoUrl: "/brands/seiko-logo-transparent.png", role: "owner", modules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"], theme: THEME_PRESETS.seiko }),
  normalizeMembership({ businessId: "veyn-health", businessName: "Veyn Health", logoUrl: "/brands/veyn-health-logo.png", role: "owner", modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"], theme: THEME_PRESETS.veyn }),
  normalizeMembership({ businessId: "meth", businessName: "MeTh", logoUrl: "/brands/meth-logo.jpg", role: "owner", modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"], theme: THEME_PRESETS.meth }),
  normalizeMembership({ businessId: "veyn-view", businessName: "Veyn Health · Read only", logoUrl: "/brands/veyn-health-logo.png", role: "viewer", modules: ["home", "trace"], theme: THEME_PRESETS.veyn }),
];

export default function Home() {
  const [module, setModule] = useState<Module>("home");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [businesses, setBusinesses] = useState<BusinessMembership[]>(previewBusinesses);
  const [businessId, setBusinessId] = useState(previewBusinesses[0].businessId);
  const [themeOverrides, setThemeOverrides] = useState<Record<string, BusinessTheme>>({});
  const [themeOpen, setThemeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [labelOrder,setLabelOrder]=useState<SeikoOrder|null>(null);
  const [labelPurpose,setLabelPurpose]=useState<"production"|"packing"|"inventory"|null>(null);
  const [labelBatchOrder,setLabelBatchOrder]=useState<SeikoOrder|null>(null);
  const membership = businesses.find(item => item.businessId === businessId) || businesses[0];
  const activeTheme = themeOverrides[businessId] || membership?.theme || THEME_PRESETS.jinam;
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
    const saved = localStorage.getItem(businessStorageKey(businessId, "theme-v2"));
    if (!saved) return;
    try {
      const theme = JSON.parse(saved) as BusinessTheme;
      queueMicrotask(() => setThemeOverrides(current => ({ ...current, [businessId]: theme })));
    } catch { /* keep the configured business theme */ }
  }, [businessId]);

  const switchBusiness = (nextBusinessId: string) => {
    setBusinessId(nextBusinessId);
    setModule("home");
    setThemeOpen(false);
  };

  const saveTheme = (theme: BusinessTheme) => {
    setThemeOverrides(current => ({ ...current, [businessId]: theme }));
    localStorage.setItem(businessStorageKey(businessId, "theme-v2"), JSON.stringify(theme));
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
        localStorage.setItem(queueKey, JSON.stringify(remaining));
        setPending(remaining.length);
      }
    };
    flush();
    return () => { cancelled = true; };
  }, [businessId, online, pending, queueKey]);

  return <div className="app" style={themeVariables(activeTheme) as CSSProperties}>
    <div className="surface">
      <header className="topbar"><label className="compactBusinessPicker"><span className={`businessMark logo-${businessId}`}>{membership?.logoUrl ? <img src={membership.logoUrl} alt=""/> : <b>{membership?.businessName?.slice(0, 1) || "J"}</b>}</span>{membership?.logoUrl && <span className={`businessWordmark logo-${businessId}`}><img src={membership.logoUrl} alt={`${membership.businessName} logo`}/></span>}<span className="srOnly">Active business</span><select aria-label="Active business" value={businessId} onChange={event => switchBusiness(event.target.value)}>{businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}</select></label><div className="topbarEnd">{pending > 0 && <div className="topActions"><span className="queue">{pending} waiting to sync</span></div>}<button className={`menuToggle ${navOpen ? "active" : ""}`} onClick={() => setNavOpen(open => !open)} aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen}><span></span><span></span><span></span></button></div>{navOpen && <><button className="menuBackdrop" aria-label="Close menu" onClick={() => setNavOpen(false)}/><nav className="moduleMenu" aria-label="Modules"><div className="moduleMenuHead"><b>Menu</b><button onClick={() => setNavOpen(false)} aria-label="Close menu">×</button></div><Nav icon="⌂" label="Overview" active={module === "home"} onClick={() => { setModule("home"); setNavOpen(false); }}/>{canAccess(membership, "orders") && <Nav icon="≡" label="Orders" active={module === "orders"} onClick={() => { setModule("orders"); setNavOpen(false); }}/>} {canAccess(membership, "labels") && <Nav icon="▤" label="Labels" active={module === "labels"} onClick={() => { setModule("labels"); setNavOpen(false); }}/>} {canAccess(membership, "scan") && <Nav icon="⌗" label="Scan" active={module === "scan"} onClick={() => { setModule("scan"); setNavOpen(false); }}/>} {canAccess(membership, "trace") && <Nav icon="◎" label="Trace" active={module === "trace"} onClick={() => { setModule("trace"); setNavOpen(false); }}/>} {(["production", "inventory", "sales", "delivery"] as Module[]).filter(item => canAccess(membership, item)).map(item => <Nav key={item} icon="•" label={title(item)} active={module === item} onClick={() => { setModule(item); setNavOpen(false); }}/>) }{canAccess(membership, "admin") && <div className="moduleMenuSettings"><Nav icon="⚙" label="Settings" active={themeOpen} onClick={() => { setThemeOpen(true); setNavOpen(false); }}/></div>}</nav></>}</header>
      {themeOpen && <ThemeCustomizer key={businessId} businessName={membership?.businessName || "Business"} theme={activeTheme} onSave={saveTheme} onClose={() => setThemeOpen(false)} />}
      <main>
        {module === "home" && <Overview membership={membership} onOpen={setModule} />}
        {module === "orders" && canAccess(membership, "orders") && <Orders key={`${businessId}:${labelOrder?.orderId || "center"}`} businessId={businessId} initialOrder={labelOrder} canManageSuggestions={membership?.role === "owner" || membership?.role === "admin"} onOpenLabelBatches={order => { setLabelOrder(null); setLabelPurpose(null); setLabelBatchOrder(order); setModule("labels"); }}/>}
        {module === "labels" && canAccess(membership, "labels") && (labelOrder ? <LabelDesigner key={`${businessId}:${labelOrder.orderId}:${labelPurpose || "choose"}`} businessId={businessId} order={labelOrder} initialPurpose={labelPurpose} onBack={() => { setLabelOrder(null); setLabelPurpose(null); }} canManageSizes={membership?.role === "owner" || membership?.role === "admin"}/> : <LabelLauncher businessId={businessId} focusedOrder={labelBatchOrder} onOpen={(order, purpose) => { setLabelBatchOrder(null); setLabelOrder(order); setLabelPurpose(purpose); }} onOpenOrders={() => { setLabelBatchOrder(null); setModule("orders"); }}/>)}
        {module === "scan" && canAccess(membership, "scan") && <Scanner businessId={businessId} queueKey={queueKey} onPending={setPending} />}
        {module === "trace" && canAccess(membership, "trace") && <Trace />}
        {module === "production" && canAccess(membership, "production") && <Production key={businessId} businessId={businessId} canManage={membership?.role === "owner" || membership?.role === "admin"}/>}
        {(["inventory", "sales", "delivery"] as Module[]).includes(module) && <section className="page"><div className="panel"><p className="eyebrow">{title(module).toUpperCase()}</p><h2>{title(module)}</h2><p>{module === "inventory" ? "Manage stock, materials and inventory label batches here." : "This module will be configured after the main navigation and home screen are finalised."}</p></div></section>}
      </main>
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
  return "Packing labels";
}

function LabelLauncher({businessId,focusedOrder,onOpen,onOpenOrders}:{businessId:string;focusedOrder?:SeikoOrder|null;onOpen:(order:SeikoOrder,purpose:"production"|"packing"|"inventory")=>void;onOpenOrders:()=>void}){
  const [query,setQuery]=useState("");
  const [batchQuery,setBatchQuery]=useState("");
  const [batchFilter,setBatchFilter]=useState<"all"|SavedLabelBatch["purpose"]>("all");
  const [sourceView,setSourceView]=useState<"orders"|"products">("orders");
  const [createPurpose,setCreatePurpose]=useState<SavedLabelBatch["purpose"]>("production");
  const orders=useMemo(()=>{if(typeof window==="undefined")return[];try{return JSON.parse(localStorage.getItem(orderStoreKey(businessId))||"[]") as SeikoOrder[]}catch{return[]}},[businessId]);
  const batches=useMemo(()=>{if(typeof window==="undefined")return[];try{return JSON.parse(localStorage.getItem(`jinam:${businessId}:labels:tasks-v1`)||"[]") as SavedLabelBatch[]}catch{return[]}},[businessId]);
  const visible=orders.filter(order=>!order.archived&&(!focusedOrder||order.orderId===focusedOrder.orderId)&&`${order.details.orderNo} ${order.details.clientName} ${order.details.clientType} ${order.status}`.toLowerCase().includes(query.toLowerCase()));
  const allowedPurposes=focusedOrder?([['production','Production'],['packing','Packing']] as const):([['production','Production'],['packing','Packing'],['inventory','Inventory']] as const);
  const visibleBatches=batches.filter(batch=>(!focusedOrder||batch.orderId===focusedOrder.orderId)&&(batchFilter==="all"||batch.purpose===batchFilter)&&`${batch.name} ${batch.orderNo} ${batch.client} ${packingBatchType(batch)}`.toLowerCase().includes(batchQuery.toLowerCase()));
  const openBatch=(batch:SavedLabelBatch)=>{const order=orders.find(item=>item.orderId===batch.orderId);if(!order)return;sessionStorage.setItem(`jinam:${businessId}:labels:open-task`,batch.id);onOpen(order,batch.purpose)};
  return <div className="page labelLauncher">
    <section className="labelLauncherHead"><div><p className="eyebrow">LABELS</p><h2>Labels</h2></div><button className="secondary" onClick={onOpenOrders}>Open Order Center</button></section>
    <section className="labelBatchModule panel">
      <div className="labelBatchModuleHead"><h3>Label batch library</h3><div className="labelLibraryFilters"><select aria-label="Filter label batches" value={batchFilter} onChange={event=>setBatchFilter(event.target.value as typeof batchFilter)}><option value="all">All batches</option><option value="production">Production</option><option value="packing">Packing</option>{!focusedOrder&&<option value="inventory">Inventory</option>}</select><input aria-label="Find a saved label batch" placeholder="Find batch, order or client" value={batchQuery} onChange={event=>setBatchQuery(event.target.value)}/></div></div>
      <div className="labelBatchModuleList">{visibleBatches.map(batch=><article key={batch.id}><div><b>{batch.name}</b><small>{batch.orderNo} · {packingBatchType(batch)} · {batch.selectedRows.length} labels</small></div><button disabled={!orders.some(order=>order.orderId===batch.orderId)} onClick={()=>openBatch(batch)}>Open</button></article>)}{!visibleBatches.length&&<p className="emptyLibrary">{batches.length?"No matching batches.":"No saved batches yet."}</p>}</div>
    </section>
    <section className="labelOrderPicker panel"><div className="labelOrderPickerHead"><div><h3>Create a label batch</h3><small>Filter the source, choose the label use, then create the required batch.</small></div><div className="labelCreateFilters"><select aria-label="View orders or products" value={sourceView} onChange={event=>setSourceView(event.target.value as typeof sourceView)}><option value="orders">Orders</option><option value="products">Products</option></select><select aria-label="Label use" value={createPurpose} onChange={event=>setCreatePurpose(event.target.value as typeof createPurpose)}>{allowedPurposes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input aria-label="Find an order for labels" placeholder={sourceView==="orders"?"Find order or client":"Find product, order or client"} value={query} onChange={event=>setQuery(event.target.value)}/></div></div><div className="labelOrderResults">{sourceView==="orders"?visible.map(order=><article key={order.orderId}><div><b>{order.details.orderNo}</b><strong>{order.details.clientName||'Unnamed client'}</strong><small>{order.details.clientType} · {order.records.length} records · {order.status}</small></div><div className="orderLabelActions"><button className="secondary" onClick={()=>onOpen(order,createPurpose)}>Create label batch</button></div></article>):visible.flatMap(order=>order.products.filter(product=>product.name?.toLowerCase().includes(query.toLowerCase())||`${order.details.orderNo} ${order.details.clientName}`.toLowerCase().includes(query.toLowerCase())).map(product=><article key={`${order.orderId}:${product.id}`}><div><b>{order.details.orderNo} · {order.details.clientName||'Unnamed client'}</b><strong>{product.name||'Unnamed product'}</strong><small>{order.status} · {order.records.length} records</small></div><div className="orderLabelActions"><button className="secondary" onClick={()=>onOpen(order,createPurpose)}>Create label batch</button></div></article>))}{!visible.length&&<div className="labelOrderEmpty"><b>No matching saved orders</b><p>Change the search or open Order Center to create an order.</p></div>}</div></section>
  </div>
}

function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span><small>{label}</small></button>;
}

function title(m: Module) { return ({ home: "Operations", orders: "Order Center", labels: "Create labels", scan: "Scan & record", trace: "Track & trace", production: "Production", inventory: "Inventory", sales: "Sales", delivery: "Delivery", admin: "Administration" } as const)[m]; }

function Overview({ membership, onOpen }: { membership?: BusinessMembership; onOpen: (m: Module) => void }) {
  const [portableScanner, setPortableScanner] = useState(false);
  useEffect(() => { queueMicrotask(() => setPortableScanner(navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches)); }, []);
  return <div className="page overview">
    <section className="hero"><div><span className="kicker">OPERATIONAL FOUNDATION</span><h2>One reliable path from order to delivery.</h2><p>Orders define the work. Labels create identity. Every recorded operation adds traceable evidence.</p></div>{canAccess(membership, "scan") && <button className="primary heroButton" onClick={() => onOpen("scan")}>{portableScanner ? "Open mobile scanner" : "Open scan station"} <span>→</span></button>}</section>
    <div className="moduleGrid">
      {canAccess(membership, "orders") && <ModuleCard title="Orders" text="Client-specific products, policies, measurements and person-wise entries." action="Open Order Center" onClick={() => onOpen("orders")} />}
      {canAccess(membership, "labels") && <ModuleCard title="Labels" text="Information, barcode, QR, or combined 50 × 25 mm labels." action="Design labels" onClick={() => onOpen("labels")} />}
      {canAccess(membership, "scan") && <ModuleCard title="Scan station" text={portableScanner ? "Use this device’s camera or a connected scan gun, with offline protection." : "Use a USB/Bluetooth scan gun or enter a label token; camera appears only when supported."} action="Open scan station" onClick={() => onOpen("scan")} />}
      {canAccess(membership, "trace") && <ModuleCard title="Trace" text="Browse an item’s identity, status and complete event history." action="Search history" onClick={() => onOpen("trace")} />}
    </div>
    {(["production", "sales", "delivery"] as Module[]).some(item => canAccess(membership, item)) && <section className="nextFlow"><div><span>COMING NEXT</span><h3>Production → Packing → Invoice → Delivery</h3></div><p>Each module will use the same identities and event history. No disconnected records, duplicate logic or rebuilding.</p></section>}
  </div>;
}

function ModuleCard({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <button className="moduleCard" onClick={onClick}><h3>{title}</h3><p>{text}</p><b>{action} →</b></button>;
}

export function LabelsLegacy({ businessId }: { businessId: string }) {
  const [mode, setMode] = useState<LabelMode>("INFO_QR");
  const [selected, setSelected] = useState<string[]>(["p1"]);
  const [fields, setFields] = useState({ name: true, group: true, product: true, size: true, qty: false });
  const [names, setNames] = useState({ name: false, group: false, product: true, size: true, qty: true });
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState("");
  const [records, setRecords] = useState<LabelRecord[]>(demoRecords);
  const [source, setSource] = useState<"LIVE" | "DEMO">("DEMO");
  const current = records.find(r => selected.includes(r.id)) || records[0] || demoRecords[0];
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  useEffect(() => {
    callSeiko<{ orders: OrderOption[] }>("labelBootstrap", {}, businessId).then(result => {
      if (!result.ok || !result.data.orders?.length) return;
      setOrders(result.data.orders); setOrderId(result.data.orders[0].orderId); setSource("LIVE");
    });
  }, [businessId]);
  useEffect(() => {
    if (!orderId) return;
    callSeiko<{ records: Array<{ recordId: string; title: string; token: string; values: Record<string, unknown> }> }>("labelRecords", { orderId }, businessId).then(result => {
      if (!result.ok) return;
      const mapped = result.data.records.map(r => ({ id: r.recordId, name: String(r.values?.["field:name"] || r.title || "Record"), group: String(r.values?.["field:class"] || ""), product: String(r.values?.product_name || ""), size: String(r.values?.size || ""), qty: String(r.values?.quantity || ""), token: r.token || "" }));
      setRecords(mapped); setSelected(mapped[0] ? [mapped[0].id] : []);
    });
  }, [businessId, orderId]);
  return <div className="page labelsPage">
    <div className="toolbar"><div className="selectGroup"><label htmlFor="label-order">Order · {source === "LIVE" ? "Live" : "Preview"}</label><select id="label-order" value={orderId} onChange={e => setOrderId(e.target.value)}>{orders.length ? orders.map(o => <option key={o.orderId} value={o.orderId}>{o.orderNumber} — {o.client}</option>) : <option>I-26-27-08-009 — Test 10</option>}</select></div><div className="selectGroup"><label htmlFor="label-content">Label content</label><select id="label-content" value={mode} onChange={e => setMode(e.target.value as LabelMode)}><option value="INFO">Information only</option><option value="BARCODE">Barcode only</option><option value="QR">QR only</option><option value="INFO_BARCODE">Information + barcode</option><option value="INFO_QR">Information + QR</option></select></div><button className="secondary">Saved layouts</button></div>
    <div className="labelWorkspace">
      <section className="records panel"><div className="panelHead"><div><p className="eyebrow">RECORDS</p><h3>{selected.length} selected</h3></div><button className="textButton" onClick={() => setSelected(selected.length === records.length ? [] : records.map(r => r.id))}>Select all</button></div>{records.map(r => <button key={r.id} onClick={() => toggle(r.id)} className={`record ${selected.includes(r.id) ? "selected" : ""}`}><span className="check">{selected.includes(r.id) ? "✓" : ""}</span><span><b>{r.name}</b><small>{r.group} · {r.product} · {r.size}</small></span></button>)}</section>
      <section className="fields panel"><div className="panelHead"><div><p className="eyebrow">FIELDS</p><h3>Content & names</h3></div></div>{Object.keys(fields).map(key => <div className="fieldRow" key={key}><label><input type="checkbox" checked={fields[key as keyof typeof fields]} onChange={e => setFields({ ...fields, [key]: e.target.checked })}/><b>{pretty(key)}</b></label><label className="nameToggle"><input type="checkbox" checked={names[key as keyof typeof names]} disabled={!fields[key as keyof typeof fields]} onChange={e => setNames({ ...names, [key]: e.target.checked })}/> Show field name</label></div>)}<button className="secondary full">+ Free text</button></section>
      <section className="designer panel"><div className="panelHead"><div><p className="eyebrow">LIVE 50 × 25 MM PREVIEW</p><h3>Drag elements to position</h3></div><div className="miniTools"><button>A−</button><button>A+</button><button>B</button></div></div><div className="labelStage"><div className="labelPaper"><div className="safeArea">{(mode === "INFO" || mode.startsWith("INFO_")) && <div className="labelInfo">{Object.entries(fields).filter(([,v]) => v).map(([key]) => <div key={key}>{names[key as keyof typeof names] && <strong>{pretty(key)}: </strong>}{current[key as keyof typeof current]}</div>)}</div>}{(mode === "QR" || mode === "INFO_QR") && <div className="qr">▦</div>}{(mode === "BARCODE" || mode === "INFO_BARCODE") && <div className="barcode" />}</div></div></div><div className="designerFoot"><input placeholder="Layout name"/><button className="secondary">Save layout</button><button className="primary">Preview & print {selected.length}</button></div></section>
    </div>
  </div>;
}

function Scanner({ businessId, queueKey, onPending }: { businessId: string; queueKey: string; onPending: (n: number) => void }) {
  const [operation, setOperation] = useState(operations[0].state);
  const [token, setToken] = useState("");
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const lastCameraToken = useRef("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [portableCamera, setPortableCamera] = useState(false);
  useEffect(() => { queueMicrotask(() => setPortableCamera(Boolean(navigator.mediaDevices?.getUserMedia) && navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches)); }, []);

  const submit = useCallback(async (value = token) => {
    const clean = value.trim();
    if (!clean) return;
    const label = operations.find(o => o.state === operation)?.label || operation;
    const event: ScanEvent = { id: crypto.randomUUID(), token: clean, operation: label, at: new Date().toLocaleTimeString("en-IN"), status: "PENDING" };
    setEvents(current => [event, ...current]);
    setToken("");
    const result = navigator.onLine ? await callSeiko("recordScan", { token: clean, toState: operation, requestKey: event.id }, businessId) : null;
    if (result?.ok) {
      setEvents(current => current.map(item => item.id === event.id ? { ...item, status: "SYNCED" } : item));
    } else {
      const queue = JSON.parse(localStorage.getItem(queueKey) || "[]");
      queue.push({ ...event, toState: operation });
      localStorage.setItem(queueKey, JSON.stringify(queue));
      onPending(queue.length);
    }
    if (navigator.vibrate) navigator.vibrate(result?.ok ? 70 : [80, 60, 80]);
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
          setCameraMessage("Code detected and recorded.");
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
      <label className="scanLabel" htmlFor="scan-code">Scan code</label>
      <div className="scanInput"><input id="scan-code" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder={portableCamera ? "Scan gun, camera, or enter token" : "Scan gun or enter label token"}/><button onClick={() => submit()}>Record</button></div>
      {portableCamera && <button className={`cameraButton ${camera ? "stop" : ""}`} onClick={toggleCamera}>{camera ? "Stop camera" : "Open device camera"}</button>}
      {camera && <><div className="camera"><video ref={video} autoPlay playsInline muted/><div className="scanFrame"/><p>Point the camera at a QR or barcode</p></div><p className="cameraMessage" role="status">{cameraMessage}</p></>}
      <p className="hint">Scan guns work automatically as keyboard input. Offline scans remain on this device and synchronize when connection returns.</p>
    </section>
    <section className="activity panel">
      <div className="panelHead"><div><p className="eyebrow">THIS SESSION</p><h3>{events.length} scans</h3></div><span className="liveDot">● LIVE</span></div>
      {events.length === 0 ? <div className="empty"><span>⌗</span><b>Ready for the first scan</b><p>The result and item identity will appear here immediately.</p></div> : events.map(event => <div className="event" key={event.id}><span className={`eventIcon ${event.status.toLowerCase()}`}>✓</span><div><b>{event.operation}</b><small>{event.token}</small></div><time>{event.at}</time></div>)}
    </section>
  </div></div>;
}

function Trace() {
  const [query, setQuery] = useState(""); const rows = useMemo(() => demoRecords.filter(r => Object.values(r).join(" ").toLowerCase().includes(query.toLowerCase())), [query]); const [current, setCurrent] = useState(demoRecords[0]);
  return <div className="page tracePage"><div className="traceSearch"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search order, client, person, product or scan code"/></div><div className="traceGrid"><section className="panel traceResults"><p className="eyebrow">MATCHING IDENTITIES</p>{rows.map(r => <button className={current.id === r.id ? "active" : ""} key={r.id} onClick={() => setCurrent(r)}><b>{r.name}</b><span>{r.product} · Size {r.size}</span><small>{r.token}</small></button>)}</section><section className="panel traceDetail"><div className="identity"><div><p className="eyebrow">CURRENT IDENTITY</p><h2>{current.name}</h2><p>{current.product} · Size {current.size} · Qty {current.qty}</p></div><span className="status">STITCHING</span></div><div className="timeline"><Timeline title="Identity created" text="Order I-26-27-08-009 · Test 10" time="13 Aug, 10:14"/><Timeline title="Cutting complete" text="Floor · authorized operation" time="13 Aug, 15:42"/><Timeline title="Stitching started" text="Operator record verified" time="14 Aug, 09:18" active/></div></section></div></div>;
}

function Timeline({ title, text, time, active = false }: { title: string; text: string; time: string; active?: boolean }) { return <div className={`timelineRow ${active ? "active" : ""}`}><span/><div><b>{title}</b><p>{text}</p></div><time>{time}</time></div>; }
function pretty(v: string) { return ({ name: "Name", group: "Class / group", product: "Product", size: "Size", qty: "Quantity" } as Record<string,string>)[v] || v; }

function ThemeCustomizer({ businessName, theme, onSave, onClose }: { businessName: string; theme: BusinessTheme; onSave: (theme: BusinessTheme) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(theme);
  const [message, setMessage] = useState("Choose a preset, edit colours, or analyse a logo.");
  const colourFields: Array<[keyof BusinessTheme, string]> = [["primary", "Primary"], ["primaryAlt", "Secondary"], ["accent", "Accent"], ["background", "Background"], ["surface", "Surface"], ["ink", "Text"]];

  const analyseLogo = async (file?: File) => {
    if (!file) return;
    setMessage("Analysing logo colours…");
    try {
      const derived = await deriveThemeFromLogo(file, businessName);
      setDraft(derived); onSave(derived); setMessage("Logo palette applied. You can fine-tune it below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The logo could not be analysed."); }
  };

  return <div className="themeScrim" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="themePanel" role="dialog" aria-modal="true" aria-labelledby="theme-title">
    <div className="themeHead"><div><p className="eyebrow">SYSTEM SETTINGS</p><h2 id="theme-title">Settings · {businessName}</h2><p className="settingsIntro">Appearance is the first settings section. Users, permissions, workflows and business defaults will live here as they are added.</p></div><button onClick={onClose} aria-label="Close settings">×</button></div>
    <h3 className="settingsSectionTitle">Appearance</h3>
    <label className="themeField"><span>Preset mood</span><select value="" onChange={event => { const preset = THEME_PRESETS[event.target.value]; if (preset) setDraft(preset); }}><option value="">Custom / current</option><option value="seiko">Seiko · operational</option><option value="veyn">Veyn · clinical organic</option><option value="meth">MeTh · retail energy</option></select></label>
    <label className="logoPicker"><span>Automatically derive from company logo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={event => analyseLogo(event.target.files?.[0])}/></label>
    <p className="themeMessage" role="status">{message}</p>
    <div className="colourGrid">{colourFields.map(([key, label]) => <label key={key}><span>{label}</span><input type="color" value={String(draft[key])} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/><code>{String(draft[key])}</code></label>)}</div>
    <label className="themeField"><span>Heading style</span><select value={draft.headingFont} onChange={event => setDraft(current => ({ ...current, headingFont: event.target.value as BusinessTheme["headingFont"] }))}><option value="serif">Editorial serif</option><option value="sans">Modern sans serif</option></select></label>
    <div className="themePreview" style={themeVariables(draft) as CSSProperties}><span>Live mood preview</span><b>{businessName}</b><button>Primary action</button></div>
    <div className="themeActions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => { onSave({ ...draft, name: `${businessName} custom` }); onClose(); }}>Save theme</button></div>
  </section></div>;
}
