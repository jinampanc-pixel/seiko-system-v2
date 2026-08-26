"use client";

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

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [theme, setTheme] = useState<BusinessTheme>(THEME_PRESETS.seiko);
  const [purpose, setPurpose] = useState<LabelPurpose>("production");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const requestedPurpose = params.get("purpose");
    const requestedOrder = params.get("order") || "";
    const fallbackTheme = defaultThemeFor(business);

    setBusinessId(business);
    setPurpose(requestedPurpose === "packing" || requestedPurpose === "inventory" ? requestedPurpose : "production");
    setOrderId(requestedOrder);

    try {
      const savedTheme = localStorage.getItem(businessStorageKey(business, "theme-v2"));
      setTheme(savedTheme ? JSON.parse(savedTheme) as BusinessTheme : fallbackTheme);
    } catch {
      setTheme(fallbackTheme);
    }

    try {
      const saved = JSON.parse(localStorage.getItem(orderStoreKey(business)) || "[]") as SeikoOrder[];
      setOrders(saved.filter(order => !order.archived));
    } catch {
      setOrders([]);
    }
    setReady(true);
  }, []);

  const selectedOrder = useMemo(() => orders.find(order => order.orderId === orderId) || null, [orderId, orders]);
  const logo = BUSINESS_LOGOS[businessId] || BUSINESS_LOGOS.seiko;

  if (!ready) {
    return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main></div>;
  }

  if (started && selectedOrder) {
    return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
      <div className="surface">
        <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/><button className="secondary" onClick={() => setStarted(false)}>Back to setup</button></header>
        <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={purpose} canManageSizes onBack={() => setStarted(false)} />
      </div>
    </div>;
  }

  return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
    <div className="surface">
      <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/><button className="secondary" onClick={() => window.close()}>Close tab</button></header>
      <main className="labelCreateRoute">
        <section className="labelCreateRouteHead">
          <div><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order first, confirm the source, then choose what the labels are for.</p></div>
        </section>
        <section className="panel labelCreateOrderChoice">
          <label><span>Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label>
          <label><span>Source</span><div className={`logicLockedField ${selectedOrder ? "sourceReady" : "sourceWaiting"}`}>{selectedOrder ? "Data from selected order" : "Choose an order first"}<small>System source</small></div></label>
          <label><span>Purpose</span><select value={purpose} onChange={event => setPurpose(event.target.value as LabelPurpose)}><option value="production">Production</option><option value="packing">Packing</option><option value="inventory">Inventory</option></select></label>
        </section>
        <div className="labelCreateRouteActions"><button className="primary" disabled={!selectedOrder} onClick={() => selectedOrder && setStarted(true)}>Continue to designer</button></div>
      </main>
    </div>
  </div>;
}
