"use client";
/* The supplied VÉYN logo is intentionally rendered unchanged. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Billing } from "./billing";
import { useAccess } from "./access-control";
import { canAccess, THEME_PRESETS, themeVariables, type BusinessMembership, type Module } from "./lib/foundation";

type VeynModule = "home" | "orders" | "billing" | "admin";

const VEYN_NAV: Array<{ module: VeynModule; label: string; description: string }> = [
  { module: "home", label: "Home", description: "Commercial overview" },
  { module: "orders", label: "Orders", description: "Institutional requirements" },
  { module: "billing", label: "Billing", description: "Quotation to invoice" },
  { module: "admin", label: "Admin", description: "Business settings" },
];

/**
 * VÉYN is a first-class Jinam business application, not a themed SEIKO screen.
 * It owns its navigation and workflow while reusing Jinam platform capabilities
 * such as authentication, permissions, business switching and commercial primitives.
 */
export function VeynApplication() {
  const { session, businessId, membership, can } = useAccess();
  const [module, setModule] = useState<VeynModule>("home");
  const [menuOpen, setMenuOpen] = useState(false);

  const availableModules = useMemo(
    () => VEYN_NAV.filter(item => canAccess(membership, item.module as Module)),
    [membership],
  );

  useEffect(() => {
    if (!availableModules.some(item => item.module === module)) setModule("home");
  }, [availableModules, module]);

  if (businessId !== "veyn-health" || !membership) return null;

  const switchBusiness = (nextBusinessId: string) => {
    if (!nextBusinessId || nextBusinessId === businessId) return;
    localStorage.setItem("jinam:selected-business", nextBusinessId);
    window.location.assign(`/?business=${encodeURIComponent(nextBusinessId)}`);
  };

  return <div className="jinamVeynApp" style={themeVariables(THEME_PRESETS.veyn) as CSSProperties}>
    <header className="veynTopbar">
      <button type="button" className="veynBrand" onClick={() => setModule("home")} aria-label="VÉYN home">
        <img src="/brands/veyn-health-logo.png" alt="véyn health"/>
      </button>
      <div className="veynTopbarMeta">
        <span>Jinam</span>
        <strong>Institutional healthcare</strong>
      </div>
      <button type="button" className={`veynMenuToggle ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
        <span/><span/><span/>
      </button>
    </header>

    <div className="veynShell">
      <aside className={`veynSidebar ${menuOpen ? "open" : ""}`}>
        <div className="veynSidebarHead">
          <small>VÉYN HEALTH</small>
          <b>Commercial workspace</b>
        </div>
        <nav className="moduleMenu veynModuleMenu" aria-label="VÉYN modules">
          {availableModules.map(item => <button
            type="button"
            className={`nav ${module === item.module ? "active" : ""}`}
            key={item.module}
            onClick={() => { setModule(item.module); setMenuOpen(false); }}
          >
            <span>{veynIcon(item.module)}</span>
            <small><b>{item.label}</b><em>{item.description}</em></small>
          </button>)}
        </nav>
        <label className="veynBusinessSwitch">
          <span>Jinam business</span>
          <select aria-label="Switch business" value={businessId} onChange={event => switchBusiness(event.target.value)}>
            {session?.businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}
          </select>
        </label>
      </aside>

      {menuOpen && <button type="button" className="veynMenuBackdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>}

      <main className="veynMain">
        {module === "home" && <VeynHome membership={membership} onOpen={setModule}/>} 
        {module === "orders" && <VeynOrders canCreate={can("orders.create")} canEdit={can("orders.edit")}/>} 
        {module === "billing" && <Billing businessId={businessId} can={can}/>} 
        {module === "admin" && <VeynAdmin membership={membership}/>} 
      </main>
    </div>
  </div>;
}

function VeynHome({ membership, onOpen }: { membership: BusinessMembership; onOpen: (module: VeynModule) => void }) {
  return <section className="page veynHomePage">
    <div className="veynHero panel">
      <div>
        <p className="eyebrow">VÉYN HEALTH · JINAM</p>
        <h1>Institutional healthcare, from requirement to commercial closure.</h1>
        <p>VÉYN keeps client requirements and commercial documents in one linked flow without inheriting SEIKO production workflows.</p>
      </div>
      <div className="veynHeroFlow" aria-label="Commercial workflow">
        <span>Order</span><i>→</i><span>Quotation</span><i>→</i><span>PO</span><i>→</i><span>Challan</span><i>→</i><span>Invoice</span>
      </div>
    </div>

    <div className="veynHomeGrid">
      {canAccess(membership, "orders") && <button type="button" className="panel veynHomeCard" onClick={() => onOpen("orders")}>
        <small>REQUIREMENTS</small><h3>Orders</h3><p>Capture the healthcare institution, requirement, delivery context and the products or services requested.</p><b>Open orders →</b>
      </button>}
      {canAccess(membership, "billing") && <button type="button" className="panel veynHomeCard" onClick={() => onOpen("billing")}>
        <small>COMMERCIAL</small><h3>Billing</h3><p>Move through quotations, accepted commercial authority, delivery challans and invoices using shared source data.</p><b>Open billing →</b>
      </button>}
      {canAccess(membership, "admin") && <button type="button" className="panel veynHomeCard" onClick={() => onOpen("admin")}>
        <small>CONTROL</small><h3>Admin</h3><p>Manage the VÉYN business context and use Jinam access controls without exposing another business&apos;s modules.</p><b>Open admin →</b>
      </button>}
    </div>
  </section>;
}

function VeynOrders({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  return <section className="page veynOrdersPage">
    <div className="panel veynOrdersHero">
      <div><p className="eyebrow">ORDERS</p><h2>Institutional requirements</h2><p>VÉYN orders describe what a healthcare client needs. They are intentionally separate from SEIKO&apos;s person-wise measurements, labels and production workflow.</p></div>
      <button type="button" className="primary" disabled={!canCreate}>{canCreate ? "+ New requirement" : "No create access"}</button>
    </div>
    <div className="veynOrderStructure">
      <article className="panel"><small>CLIENT</small><h3>Institution & contact</h3><p>Hospital, CHC, PHC, diagnostic centre or other institutional customer, including billing and delivery locations.</p></article>
      <article className="panel"><small>REQUIREMENT</small><h3>Products & services</h3><p>Requested items, quantities, specifications, references, tender/PO context and required delivery dates.</p></article>
      <article className="panel"><small>COMMERCIAL LINK</small><h3>One source for documents</h3><p>The accepted requirement becomes the source for quotation, PO linkage, delivery challans and invoices instead of being retyped.</p></article>
    </div>
    <div className="panel veynOrderEmpty">
      <div><h3>Order register</h3><p>The VÉYN order register is the next persistence step. The workflow boundary is now locked before live client records are introduced.</p></div>
      <span>{canEdit ? "Edit access ready" : "View-only access"}</span>
    </div>
  </section>;
}

function VeynAdmin({ membership }: { membership: BusinessMembership }) {
  return <section className="page veynAdminPage">
    <div className="panel">
      <p className="eyebrow">ADMIN</p>
      <h2>VÉYN business administration</h2>
      <p>This area owns VÉYN-specific settings. User authentication and access remain shared Jinam platform capabilities and are available from the menu.</p>
      <dl className="veynAdminSummary"><div><dt>Business</dt><dd>{membership.businessName}</dd></div><div><dt>Role</dt><dd>{membership.role}</dd></div><div><dt>Modules</dt><dd>{membership.modules.join(" · ")}</dd></div></dl>
    </div>
  </section>;
}

function veynIcon(module: VeynModule) {
  return ({ home: "⌂", orders: "≡", billing: "₹", admin: "⚙" } as const)[module];
}
