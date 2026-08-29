"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { orderStoreKey, type SeikoOrder } from "./lib/order-domain";
import { startDomEnhancement } from "./lib/dom-enhancement";

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

      const settings = document.querySelector<HTMLElement>(".themePanel");
      if (settings && !settings.querySelector(".seikoAccessSettings")) {
        const card = document.createElement("section");
        card.className = "seikoAccessSettings";
        card.innerHTML = '<div><b>Users & access</b><p>Manage SEIKO users, roles and permissions from Settings.</p></div><button type="button" class="secondary">Open users & access</button>';
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
      active: active.length,
      records: active.reduce((sum, order) => sum + order.records.length, 0),
      completed: orders.filter(order => !order.archived && order.status === "Completed").length,
    };
  }, [orders]);

  return <section className="seikoOperationalDashboard">
    <div className="seikoDashboardHead"><div><small>SEIKO · JINAM</small><h1>Home</h1><p>Operational dashboard for live order and production work.</p></div></div>
    <div className="seikoDashboardMetrics">
      <article><small>ACTIVE ORDERS</small><strong>{stats.active}</strong><span>Open SEIKO work</span></article>
      <article><small>PERSON / RECORD ENTRIES</small><strong>{stats.records}</strong><span>Across active orders</span></article>
      <article><small>COMPLETED ORDERS</small><strong>{stats.completed}</strong><span>Saved completed work</span></article>
      <article className={pendingScans === 0 ? "positive" : ""}><small>SCAN SYNC QUEUE</small><strong>{pendingScans}</strong><span>{pendingScans ? "Waiting to sync" : "All scans synced"}</span></article>
    </div>
    <div className="seikoDashboardBand"><div><b>Quick access</b><p>Use the module tiles below for Orders, Labels, Scan and Trace. Production remains available from the menu.</p></div></div>
  </section>;
}
