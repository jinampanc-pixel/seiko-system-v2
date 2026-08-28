"use client";
/* The supplied VÉYN logo is intentionally rendered unchanged. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAccess } from "./access-control";
import { canAccess, THEME_PRESETS, themeVariables, type BusinessMembership, type Module } from "./lib/foundation";
import { listVeynRequirements } from "./lib/veyn-requirements";
import { VeynBilling } from "./veyn-billing";
import { VeynOrders } from "./veyn-orders";

type VeynModule = "home" | "orders" | "billing" | "admin";

const VEYN_NAV: Array<{ module: VeynModule; label: string }> = [
  { module: "home", label: "Home" },
  { module: "orders", label: "Orders" },
  { module: "billing", label: "Billing" },
  { module: "admin", label: "Admin" },
];

export function VeynApplication() {
  const { session, businessId, membership, can, refresh } = useAccess();
  const [module, setModule] = useState<VeynModule>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [billingFocusOrderId, setBillingFocusOrderId] = useState<string | null>(null);

  const availableModules = useMemo(
    () => VEYN_NAV.filter(item => canAccess(membership, item.module as Module)),
    [membership],
  );
  const activeModule: VeynModule = availableModules.some(item => item.module === module) ? module : "home";

  if (businessId !== "veyn-health" || !membership) return null;

  const openModule = (next: VeynModule) => {
    setModule(next);
    setMenuOpen(false);
    if (next !== "billing") setBillingFocusOrderId(null);
    if (next === "billing") setBillingFocusOrderId(null);
  };

  const openBillingForOrder = (orderId: string) => {
    setBillingFocusOrderId(orderId);
    setModule("billing");
    setMenuOpen(false);
  };

  const switchBusiness = (nextBusinessId: string) => {
    if (!nextBusinessId || nextBusinessId === businessId) return;
    localStorage.setItem("jinam:selected-business", nextBusinessId);
    window.location.assign(`/?business=${encodeURIComponent(nextBusinessId)}`);
  };

  return <div className="jinamVeynApp" style={themeVariables(THEME_PRESETS.veyn) as CSSProperties}>
    <header className="veynTopbar">
      <button type="button" className="veynBrand" onClick={() => openModule("home")} aria-label="VÉYN home">
        <img src="/brands/veyn-health-logo.png" alt="véyn health"/>
      </button>
      <div className="veynTopbarMeta"><span>Jinam</span><strong>véyn health</strong></div>
      <button type="button" className={`veynMenuToggle ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
        <span/><span/><span/>
      </button>
    </header>

    <div className="veynShell">
      <aside className={`veynSidebar ${menuOpen ? "open" : ""}`}>
        <nav className="moduleMenu veynModuleMenu" aria-label="VÉYN modules">
          {availableModules.map(item => <button
            type="button"
            className={`nav ${activeModule === item.module ? "active" : ""}`}
            key={item.module}
            onClick={() => openModule(item.module)}
          >
            <span>{veynIcon(item.module)}</span>
            <small><b>{item.label}</b></small>
          </button>)}
        </nav>
        <label className="veynBusinessSwitch">
          <span>Business</span>
          <select aria-label="Switch business" value={businessId} onChange={event => switchBusiness(event.target.value)}>
            {session?.businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}
          </select>
        </label>
      </aside>

      {menuOpen && <button type="button" className="veynMenuBackdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>}

      <main className="veynMain">
        {activeModule === "home" && <VeynHome businessId={businessId} membership={membership} onOpen={openModule}/>} 
        {activeModule === "orders" && <VeynOrders businessId={businessId} canCreate={can("orders.create")} canEdit={can("orders.edit")} onOpenBilling={openBillingForOrder}/>} 
        {activeModule === "billing" && <VeynBilling businessId={businessId} can={can} focusOrderId={billingFocusOrderId}/>} 
        {activeModule === "admin" && <VeynAdmin membership={membership} canManageUsers={can("users.manage")} onRefresh={() => void refresh()}/>} 
      </main>
    </div>
  </div>;
}

function VeynHome({ businessId, membership, onOpen }: { businessId: string; membership: BusinessMembership; onOpen: (module: VeynModule) => void }) {
  const [counts, setCounts] = useState({ open: 0, quotations: 0, challans: 0, invoices: 0 });
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listVeynRequirements(businessId).then(records => {
      if (cancelled) return;
      setCounts({
        open: records.filter(record => !["Closed", "Delivered"].includes(record.order.status)).length,
        quotations: records.reduce((sum, record) => sum + record.order.commercial.quotations.length, 0),
        challans: records.reduce((sum, record) => sum + record.order.commercial.deliveryChallans.length, 0),
        invoices: records.reduce((sum, record) => sum + record.order.commercial.invoices.length, 0),
      });
    }).catch(cause => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Dashboard could not be loaded."); });
    return () => { cancelled = true; };
  }, [businessId]);

  return <section className="page veynHomePage">
    <div className="veynPageHead"><div><p className="eyebrow">VÉYN HEALTH</p><h1>Home</h1></div></div>
    {loadError && <div className="accessError" role="alert">{loadError}</div>}
    <div className="veynMetricGrid">
      <button type="button" className="panel veynMetric" onClick={() => onOpen("orders")}><small>OPEN REQUIREMENTS</small><strong>{counts.open}</strong><span>Orders →</span></button>
      <button type="button" className="panel veynMetric" onClick={() => onOpen("billing")}><small>QUOTATIONS</small><strong>{counts.quotations}</strong><span>Billing →</span></button>
      <button type="button" className="panel veynMetric" onClick={() => onOpen("billing")}><small>CHALLANS</small><strong>{counts.challans}</strong><span>Billing →</span></button>
      <button type="button" className="panel veynMetric" onClick={() => onOpen("billing")}><small>INVOICES</small><strong>{counts.invoices}</strong><span>Billing →</span></button>
    </div>
    <div className="veynQuickActions">
      {canAccess(membership, "orders") && <button type="button" className="primary" onClick={() => onOpen("orders")}>Open requirements</button>}
      {canAccess(membership, "billing") && <button type="button" className="secondary" onClick={() => onOpen("billing")}>Open commercial pipeline</button>}
    </div>
  </section>;
}

function VeynAdmin({ membership, canManageUsers, onRefresh }: { membership: BusinessMembership; canManageUsers: boolean; onRefresh: () => void }) {
  const openAccess = () => {
    const button = document.querySelector<HTMLButtonElement>(".accessMenuEntry");
    button?.click();
  };

  return <section className="page veynAdminPage">
    <div className="veynPageHead"><div><p className="eyebrow">ADMIN</p><h1>Business administration</h1></div></div>
    <div className="panel veynAdminCard">
      <dl className="veynAdminSummary"><div><dt>Business</dt><dd>{membership.businessName}</dd></div><div><dt>Role</dt><dd>{membership.role}</dd></div><div><dt>Modules</dt><dd>{membership.modules.join(" · ")}</dd></div></dl>
      <div className="veynAdminActions">
        {canManageUsers && <button type="button" className="primary" onClick={openAccess}>Users & access</button>}
        <button type="button" className="secondary" onClick={onRefresh}>Refresh access</button>
      </div>
    </div>
  </section>;
}

function veynIcon(module: VeynModule) {
  return ({ home: "⌂", orders: "≡", billing: "₹", admin: "⚙" } as const)[module];
}
