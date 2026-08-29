"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import { startDomEnhancement } from "./lib/dom-enhancement";

function openSeikoModule(label: string) {
  const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
  if (toggle?.getAttribute("aria-expanded") !== "true") toggle?.click();
  window.setTimeout(() => {
    const target = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .moduleMenu .nav")).find(button => button.querySelector("small")?.textContent?.trim() === label);
    target?.click();
  }, 0);
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

  useEffect(() => {
    const load = () => {
      try { setOrders(JSON.parse(localStorage.getItem(orderStoreKey("seiko")) || "[]") as SeikoOrder[]); } catch { setOrders([]); }
      try { setPendingScans((JSON.parse(localStorage.getItem("jinam:seiko:scan-queue") || "[]") as unknown[]).length); } catch { setPendingScans(0); }
    };
    queueMicrotask(load);
    window.addEventListener("storage", load);
    const timer = window.setInterval(load, 4000);
    return () => { window.removeEventListener("storage", load); window.clearInterval(timer); };
  }, []);

  const stats = useMemo(() => {
    const active = orders.filter(order => !order.archived && !["Completed", "Cancelled"].includes(order.status));
    return {
      active,
      records: active.reduce((sum, order) => sum + order.records.length, 0),
      completed: orders.filter(order => !order.archived && order.status === "Completed").length,
    };
  }, [orders]);
  const recent = [...stats.active].slice(-4).reverse();

  return <section className="seikoOperationalDashboard">
    <div className="seikoDashboardHead"><div><small>SEIKO</small><h1>Home</h1><p>Live operational view of orders, records and production activity.</p></div><button type="button" className="secondary seikoProductionShortcut" onClick={() => openSeikoModule("Production")}>Open production</button></div>
    <div className="seikoDashboardMetrics">
      <article><small>ACTIVE ORDERS</small><strong>{stats.active.length}</strong><span>Open SEIKO work</span></article>
      <article><small>PERSON / RECORD ENTRIES</small><strong>{stats.records}</strong><span>Across active orders</span></article>
      <article><small>COMPLETED ORDERS</small><strong>{stats.completed}</strong><span>Completed work</span></article>
      <article className={pendingScans === 0 ? "positive" : ""}><small>SCAN SYNC QUEUE</small><strong>{pendingScans}</strong><span>{pendingScans ? "Waiting to sync" : "All scans synced"}</span></article>
    </div>
    <div className="seikoDashboardBand"><div><b>Quick access</b><p>Orders, Labels, Scan and Trace are below. Production is available from the action above and the menu.</p></div></div>
    <section className="seikoDashboardActivity"><div className="seikoDashboardActivityHead"><div><b>Active orders</b><p>Recently created active SEIKO work.</p></div></div>{recent.length ? recent.map(order => <div className="seikoDashboardActivityRow" key={order.orderId}><strong>{order.details.orderNo || order.orderId}</strong><span>{order.details.clientName || "Client"}</span><small>{order.status}</small></div>) : <div className="seikoDashboardActivityRow"><strong>No active orders</strong><span>New operational work will appear here.</span><small>—</small></div>}</section>
  </section>;
}
