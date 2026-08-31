"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import { startDomEnhancement } from "./lib/dom-enhancement";

type MetricKey = "active" | "records" | "completed" | "sync";
type QuickAccessKey = "Orders" | "Production" | "Labels" | "Scan station" | "Trace";
type HomeConfig = {
  metrics: Record<MetricKey, boolean>;
  showActiveOrders: boolean;
  activeOrderPageSize: 5 | 10 | 20;
  quickAccess: Record<QuickAccessKey, boolean>;
};

const HOME_KEY = "jinam:seiko:home-config-v2";
const DEFAULT_HOME: HomeConfig = {
  metrics: { active: true, records: true, completed: true, sync: true },
  showActiveOrders: true,
  activeOrderPageSize: 10,
  quickAccess: { Orders: true, Production: true, Labels: true, "Scan station": true, Trace: true },
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

function readHomeConfig(): HomeConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) || "null") as Partial<HomeConfig> | null;
    if (!saved) return DEFAULT_HOME;
    return {
      metrics: { ...DEFAULT_HOME.metrics, ...(saved.metrics || {}) },
      showActiveOrders: saved.showActiveOrders ?? true,
      activeOrderPageSize: [5, 10, 20].includes(Number(saved.activeOrderPageSize)) ? Number(saved.activeOrderPageSize) as 5 | 10 | 20 : 10,
      quickAccess: { ...DEFAULT_HOME.quickAccess, ...(saved.quickAccess || {}) },
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
      document.querySelectorAll<HTMLElement>(".moduleMenu .accessMenuEntry").forEach(button => { button.style.display = "none"; });

      const setupBack = document.querySelector<HTMLButtonElement>(".orderSetup .orderPageHead .secondary");
      if (setupBack && setupBack.textContent?.trim() === "Cancel") setupBack.textContent = "← Back to Order Center";
      document.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
        const text = button.textContent?.trim();
        if (text === "Order Center") button.textContent = "← Back to Orders";
        if (text === "Back" && button.closest(".ordersPage,.orderSetup,.workspacePage")) button.textContent = "← Back to Orders";
        if (text === "Back" && button.closest(".labelCreateApp,.labelDesigner")) button.textContent = "← Back to Labels";
      });

      const settings = document.querySelector<HTMLElement>(".themePanel");
      const settingsIntro = settings?.querySelector<HTMLElement>(".settingsIntro");
      if (settingsIntro) settingsIntro.textContent = "Manage SEIKO appearance and access.";
      if (settings && !settings.querySelector(".seikoAccessSettings")) {
        const card = document.createElement("section");
        card.className = "seikoAccessSettings";
        card.innerHTML = '<div><b>Users & access</b><p>Manage SEIKO users, roles and permissions.</p></div><button type="button" class="secondary">Open users & access</button>';
        card.querySelector("button")?.addEventListener("click", () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click());
        const intro = settings.querySelector(".settingsIntro");
        intro?.insertAdjacentElement("afterend", card);
      }
    });
    return () => controller.stop();
  }, []);

  return dashboardHost ? createPortal(<SeikoDashboard/>, dashboardHost) : null;
}

function SeikoDashboard() {
  const [orders, setOrders] = useState<SeikoOrder[]>([]);
  const [pendingScans, setPendingScans] = useState(0);
  const [config, setConfig] = useState<HomeConfig>(() => readHomeConfig());
  const [customizing, setCustomizing] = useState(false);
  const [query, setQuery] = useState("");
  const [clientType, setClientType] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = () => {
      try { setOrders(JSON.parse(localStorage.getItem(orderStoreKey("seiko")) || "[]") as SeikoOrder[]); } catch { setOrders([]); }
      try { setPendingScans((JSON.parse(localStorage.getItem("jinam:seiko:scan-queue") || "[]") as unknown[]).length); } catch { setPendingScans(0); }
    };
    queueMicrotask(load);
    window.addEventListener("storage", load);
    window.addEventListener("seiko:orders-cache-updated", load as EventListener);
    const timer = window.setInterval(load, 4000);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("seiko:orders-cache-updated", load as EventListener);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(HOME_KEY, JSON.stringify(config));
    document.querySelectorAll<HTMLButtonElement>(".overview .moduleGrid .moduleCard").forEach(card => {
      const title = card.querySelector("h3")?.textContent?.trim() as QuickAccessKey | undefined;
      if (title && title in config.quickAccess) card.hidden = !config.quickAccess[title];
    });
  }, [config]);

  const stats = useMemo(() => {
    const active = orders.filter(order => !order.archived && !["Completed", "Cancelled"].includes(order.status));
    return {
      active,
      records: active.reduce((sum, order) => sum + order.records.length, 0),
      completed: orders.filter(order => !order.archived && order.status === "Completed").length,
    };
  }, [orders]);

  const clientTypes = useMemo(() => [...new Set(stats.active.map(order => order.details.clientType).filter(Boolean))].sort(), [stats.active]);
  const products = useMemo(() => [...new Set(stats.active.filter(order => !clientType || order.details.clientType === clientType).flatMap(order => order.products.map(item => item.name).filter(Boolean)))].sort(), [clientType, stats.active]);
  const statuses = useMemo(() => [...new Set(stats.active.map(order => order.status))], [stats.active]);
  const filtered = useMemo(() => stats.active.filter(order => {
    if (clientType && order.details.clientType !== clientType) return false;
    if (product && !order.products.some(item => item.name === product)) return false;
    if (status && order.status !== status) return false;
    const haystack = `${order.details.orderNo} ${order.details.clientName} ${order.details.clientType} ${order.status} ${order.products.map(item => item.name).join(" ")}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [clientType, product, query, stats.active, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / config.activeOrderPageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * config.activeOrderPageSize, safePage * config.activeOrderPageSize);

  useEffect(() => { setPage(1); }, [clientType, product, query, status, config.activeOrderPageSize]);

  const metricCards: Array<{ key: MetricKey; label: string; value: number; note: string; module: string; positive?: boolean }> = [
    { key: "active", label: "ACTIVE ORDERS", value: stats.active.length, note: "Open SEIKO work", module: "Orders" },
    { key: "records", label: "PERSON / RECORD ENTRIES", value: stats.records, note: "Across active orders", module: "Orders" },
    { key: "completed", label: "COMPLETED ORDERS", value: stats.completed, note: "Completed work", module: "Orders" },
    { key: "sync", label: "SCAN SYNC QUEUE", value: pendingScans, note: pendingScans ? "Waiting to sync" : "All scans synced", module: "Scan", positive: pendingScans === 0 },
  ];

  return <section className="seikoOperationalDashboard">
    <div className="seikoDashboardHead"><div><small>SEIKO</small><h1>Home</h1><p>Dashboard for operational visibility. Quick access below opens modules and features.</p></div><div className="seikoDashboardHeadActions"><button type="button" className="secondary" onClick={() => setCustomizing(value => !value)}>{customizing ? "Done" : "Customize dashboard"}</button></div></div>

    {customizing && <section className="seikoHomeCustomizer panel" aria-label="Customize Home"><div><b>Dashboard</b><p>Choose what operational information appears here.</p></div><div className="seikoHomeOptionGrid">{metricCards.map(metric => <label key={metric.key}><input type="checkbox" checked={config.metrics[metric.key]} onChange={event => setConfig(current => ({ ...current, metrics: { ...current.metrics, [metric.key]: event.target.checked } }))}/>{metric.label.replace("PERSON / RECORD ENTRIES", "Record entries")}</label>)}<label><input type="checkbox" checked={config.showActiveOrders} onChange={event => setConfig(current => ({ ...current, showActiveOrders: event.target.checked }))}/>Active-orders list</label></div><div><b>Quick access</b><p>Choose which module shortcuts appear below the dashboard.</p></div><div className="seikoHomeOptionGrid">{(Object.keys(config.quickAccess) as QuickAccessKey[]).map(item => <label key={item}><input type="checkbox" checked={config.quickAccess[item]} onChange={event => setConfig(current => ({ ...current, quickAccess: { ...current.quickAccess, [item]: event.target.checked } }))}/>{item}</label>)}</div></section>}

    <div className="seikoDashboardMetrics">{metricCards.filter(metric => config.metrics[metric.key]).map(metric => <button type="button" className={`seikoMetricCard ${metric.positive ? "positive" : ""}`} key={metric.key} onClick={() => openSeikoModule(metric.module)}><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></button>)}</div>

    {config.showActiveOrders && <section className="seikoDashboardActivity"><div className="seikoDashboardActivityHead"><div><b>Active orders</b><p>{filtered.length} matching active order{filtered.length === 1 ? "" : "s"}. This list stays paginated even with hundreds of orders.</p></div><div className="seikoDashboardActivityFilters"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find order or client" aria-label="Filter active orders"/><select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter active orders by status"><option value="">All active statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select><select value={clientType} onChange={event => { setClientType(event.target.value); setProduct(""); }} aria-label="Filter active orders by client type"><option value="">All client types</option>{clientTypes.map(value => <option key={value}>{value}</option>)}</select><select value={product} onChange={event => setProduct(event.target.value)} aria-label="Filter active orders by product"><option value="">All products</option>{products.map(value => <option key={value}>{value}</option>)}</select></div></div><div className="seikoDashboardOrderList">{visible.length ? visible.map(order => <button type="button" className="seikoDashboardActivityRow" key={order.orderId} onClick={() => openSeikoOrder(order)}><strong>{order.details.orderNo || order.orderId}</strong><span>{order.details.clientName || "Client"}</span><small>{order.details.clientType} · {order.records.length} records · {order.status}</small></button>) : <div className="seikoDashboardActivityEmpty">No active orders match these filters.</div>}</div>{filtered.length > config.activeOrderPageSize && <div className="seikoDashboardPager"><label>Rows <select value={config.activeOrderPageSize} onChange={event => setConfig(current => ({ ...current, activeOrderPageSize: Number(event.target.value) as 5 | 10 | 20 }))}><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label><button type="button" className="secondary" disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><span>Page {safePage} of {pageCount}</span><button type="button" className="secondary" disabled={safePage >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next</button></div>}</section>}
  </section>;
}
