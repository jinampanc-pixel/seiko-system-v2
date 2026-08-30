"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LabelDesigner } from "../../label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";
import { businessStorageKey, THEME_PRESETS, themeVariables, type BusinessTheme } from "../../lib/foundation";

type LabelPurpose = "production" | "packing" | "inventory";

const BUSINESS_LOGOS: Record<string, string> = {
  seiko: "/brands/seiko-logo-transparent.png",
  "veyn-health": "/brands/veyn-health-logo.png",
  meth: "/brands/meth-logo.jpg",
};

function defaultThemeFor(businessId: string): BusinessTheme {
  if (businessId === "veyn-health") return THEME_PRESETS.veyn;
  if (businessId === "meth") return THEME_PRESETS.meth;
  return THEME_PRESETS.seiko;
}

function requestedPurpose(value: string | null): LabelPurpose {
  return value === "packing" || value === "inventory" ? value : "production";
}

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [theme, setTheme] = useState<BusinessTheme>(THEME_PRESETS.seiko);
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [purpose, setPurpose] = useState<LabelPurpose>("production");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
      const requestedOrder = params.get("order") || "";
      const requested = requestedPurpose(params.get("purpose"));
      const fallbackTheme = defaultThemeFor(business);
      setBusinessId(business);
      setOrderId(requestedOrder);
      setPurpose(requested);
      try {
        const savedTheme = localStorage.getItem(businessStorageKey(business, "theme-v2"));
        setTheme(savedTheme ? JSON.parse(savedTheme) as BusinessTheme : fallbackTheme);
      } catch { setTheme(fallbackTheme); }
      try {
        const saved = JSON.parse(localStorage.getItem(orderStoreKey(business)) || "[]") as SeikoOrder[];
        setOrders(saved.filter(order => !order.archived));
      } catch { setOrders([]); }
      setReady(true);
    });
  }, []);

  const selectedOrder = useMemo(() => orders.find(order => order.orderId === orderId) || null, [orderId, orders]);
  const logo = BUSINESS_LOGOS[businessId] || BUSINESS_LOGOS.seiko;

  if (!ready) return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main></div>;

  if (started && selectedOrder) return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
    <div className="surface">
      <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>
      <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={purpose} canManageSizes={true} onBack={() => setStarted(false)}/>
    </div>
  </div>;

  return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><div className="surface">
    <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/></header>
    <main className="labelCreateRoute">
      <section className="labelCreateRouteHead"><div><p className="eyebrow">LABELS</p><h1>Open label workspace</h1><p>Choose an order and use. The same production label designer is used everywhere in SEIKO.</p></div></section>
      <section className="panel labelCreateOrderChoice">
        <div className="labelCreateField"><label><span>Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label></div>
        <div className="labelCreateField"><label><span>Use</span><select value={purpose} onChange={event => setPurpose(event.target.value as LabelPurpose)}><option value="production">Production</option><option value="packing">Packing</option><option value="inventory">Inventory</option></select></label></div>
      </section>
      <div className="labelCreateRouteActions"><button className="primary" disabled={!selectedOrder} onClick={() => selectedOrder && setStarted(true)}>Open labels</button></div>
    </main>
  </div></div>;
}
