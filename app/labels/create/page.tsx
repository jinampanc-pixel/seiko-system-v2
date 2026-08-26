"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LabelDesigner } from "../../label-designer";
import { orderStoreKey, type SeikoOrder } from "../../lib/order-domain";
import { businessStorageKey, THEME_PRESETS, themeVariables, type BusinessTheme } from "../../lib/foundation";

type LabelPurpose = "production" | "packing" | "inventory";
type SourceMode = "person_product" | "person" | "product" | "group" | "order";

const BUSINESS_LOGOS: Record<string, string> = {
  seiko: "/brands/seiko-logo-transparent.png",
  "veyn-health": "/brands/veyn-health-logo.png",
  meth: "/brands/meth-logo.jpg",
};

const SOURCE_OPTIONS: Array<{ value: SourceMode; label: string; help: string }> = [
  { value: "person_product", label: "Person + Product", help: "One label for each person-product/workpiece identity." },
  { value: "person", label: "Person", help: "One label representing each person or person package." },
  { value: "product", label: "Product", help: "One label representing a product or stock summary." },
  { value: "group", label: "Group", help: "One label for a grouped package or grouped work set." },
  { value: "order", label: "Whole Order", help: "One label representing the complete order or outer package." },
];

function defaultThemeFor(businessId: string): BusinessTheme {
  if (businessId === "veyn-health") return THEME_PRESETS.veyn;
  if (businessId === "meth") return THEME_PRESETS.meth;
  return THEME_PRESETS.seiko;
}

function defaultSourceForPurpose(purpose: LabelPurpose): SourceMode {
  if (purpose === "packing") return "person";
  if (purpose === "inventory") return "product";
  return "person_product";
}

function sourceLabel(source: SourceMode) {
  return SOURCE_OPTIONS.find(option => option.value === source)?.label || "Source";
}

function DesignerSourceLock({ sourceMode }: { sourceMode: SourceMode }) {
  useEffect(() => {
    let attempts = 0;
    const apply = () => {
      attempts += 1;
      const select = document.querySelector<HTMLSelectElement>(".labelDesignerPage .labelSetup label:first-child select");
      if (!select) {
        if (attempts < 30) window.setTimeout(apply, 40);
        return;
      }

      // LabelDesigner already understands all five source modes internally.
      // Temporarily expose the selected value to its React onChange handler,
      // then replace the designer control with a clear locked summary so the
      // source is changed only through Back to setup.
      if (!Array.from(select.options).some(option => option.value === sourceMode)) {
        const option = document.createElement("option");
        option.value = sourceMode;
        option.textContent = sourceLabel(sourceMode);
        select.appendChild(option);
      }
      select.disabled = false;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      descriptor?.set?.call(select, sourceMode);
      select.dispatchEvent(new Event("change", { bubbles: true }));

      const label = select.closest("label");
      if (!label) return;
      label.classList.add("launcherSourceLocked");
      const title = label.querySelector<HTMLElement>(":scope > span");
      if (title) title.textContent = "Source";
      let locked = label.querySelector<HTMLElement>(".designerSourceLockedValue");
      if (!locked) {
        locked = document.createElement("div");
        locked.className = "designerSourceLockedValue";
        label.appendChild(locked);
      }
      locked.innerHTML = `<b>${sourceLabel(sourceMode)}</b><small>Change from Back to setup</small>`;
      select.disabled = true;
    };

    apply();
  }, [sourceMode]);

  return null;
}

export default function CreateLabelsPage() {
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState("seiko");
  const [theme, setTheme] = useState<BusinessTheme>(THEME_PRESETS.seiko);
  const [purpose, setPurpose] = useState<LabelPurpose>("production");
  const [sourceMode, setSourceMode] = useState<SourceMode>("person_product");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const business = params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
    const requestedPurpose = params.get("purpose");
    const requestedOrder = params.get("order") || "";
    const resolvedPurpose: LabelPurpose = requestedPurpose === "packing" || requestedPurpose === "inventory" ? requestedPurpose : "production";
    const fallbackTheme = defaultThemeFor(business);

    setBusinessId(business);
    setPurpose(resolvedPurpose);
    setSourceMode(defaultSourceForPurpose(resolvedPurpose));
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
  const selectedSource = SOURCE_OPTIONS.find(option => option.value === sourceMode) || SOURCE_OPTIONS[0];
  const logo = BUSINESS_LOGOS[businessId] || BUSINESS_LOGOS.seiko;

  const changePurpose = (next: LabelPurpose) => {
    setPurpose(next);
    setSourceMode(defaultSourceForPurpose(next));
  };

  if (!ready) {
    return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}><main className="labelCreateRoute"><div className="panel">Loading label workspace…</div></main></div>;
  }

  if (started && selectedOrder) {
    return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
      <div className="surface">
        <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/><button className="secondary" onClick={() => setStarted(false)}>Back to setup</button></header>
        <DesignerSourceLock sourceMode={sourceMode} />
        <LabelDesigner businessId={businessId} order={selectedOrder} initialPurpose={purpose} canManageSizes onBack={() => setStarted(false)} />
      </div>
    </div>;
  }

  return <div className="labelCreateApp app" style={themeVariables(theme) as CSSProperties}>
    <div className="surface">
      <header className="labelCreateTopbar"><img className={`labelCreateBrand logo-${businessId}`} src={logo} alt="Business logo"/><button className="secondary" onClick={() => window.close()}>Close tab</button></header>
      <main className="labelCreateRoute">
        <section className="labelCreateRouteHead">
          <div><p className="eyebrow">LABEL CREATION</p><h1>Create labels</h1><p>Choose the order, decide what one label represents, then choose why the labels are being created.</p></div>
        </section>
        <section className="panel labelCreateOrderChoice">
          <label><span>1 · Order</span><select value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Choose an order…</option>{orders.map(order => <option key={order.orderId} value={order.orderId}>{order.details.orderNo} — {order.details.clientName || "Unnamed client"}</option>)}</select></label>
          <label><span>2 · Source</span><select value={sourceMode} disabled={!selectedOrder} onChange={event => setSourceMode(event.target.value as SourceMode)}>{SOURCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="labelCreateFieldHelp">{selectedOrder ? selectedSource.help : "Choose an order first."}</small></label>
          <label><span>3 · Purpose</span><select value={purpose} onChange={event => changePurpose(event.target.value as LabelPurpose)}><option value="production">Production</option><option value="packing">Packing</option><option value="inventory">Inventory</option></select></label>
        </section>
        <div className="labelCreateRouteActions"><button className="primary" disabled={!selectedOrder} onClick={() => selectedOrder && setStarted(true)}>Continue to designer</button></div>
      </main>
    </div>
  </div>;
}
