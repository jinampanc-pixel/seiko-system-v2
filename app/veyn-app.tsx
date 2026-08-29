"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccess } from "./access-control";
import { JinamBusinessShell, type JinamShellNavItem } from "./jinam-business-shell";
import { canAccess, THEME_PRESETS, type BusinessMembership, type Module } from "./lib/foundation";
import { listVeynRequirements } from "./lib/veyn-requirements";
import { VeynBilling } from "./veyn-billing";
import { VeynOrders } from "./veyn-orders";

type VeynModule = "home" | "orders" | "billing" | "admin";

const VEYN_NAV: readonly JinamShellNavItem<VeynModule>[] = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "orders", label: "Orders", icon: "≡" },
  { key: "billing", label: "Billing", icon: "₹" },
  { key: "admin", label: "Settings", icon: "⚙" },
];

export function VeynApplication() {
  const { businessId, membership, can, refresh } = useAccess();
  const [module, setModule] = useState<VeynModule>("home");
  const [billingFocusOrderId, setBillingFocusOrderId] = useState<string | null>(null);

  const availableModules = useMemo(
    () => VEYN_NAV.filter(item => canAccess(membership, item.key as Module)),
    [membership],
  );
  const activeModule: VeynModule = availableModules.some(item => item.key === module) ? module : "home";

  if (businessId !== "veyn-health" || !membership) return null;

  const openModule = (next: VeynModule) => {
    setModule(next);
    if (next !== "billing") setBillingFocusOrderId(null);
  };

  const openBillingForOrder = (orderId: string) => {
    setBillingFocusOrderId(orderId);
    setModule("billing");
  };

  const back = activeModule === "home" ? undefined
    : activeModule === "billing" && billingFocusOrderId
      ? { label: "Back to Orders", onClick: () => { setBillingFocusOrderId(null); setModule("orders"); } }
      : { label: "Back to Home", onClick: () => { setBillingFocusOrderId(null); setModule("home"); } };

  return <div className="jinamVeynApp">
    <JinamBusinessShell<VeynModule>
      businessName={membership.businessName || "véyn health"}
      businessLogo={membership.logoUrl || "/brands/veyn-health-logo.png"}
      theme={membership.theme || THEME_PRESETS.veyn}
      nav={availableModules}
      active={activeModule}
      onNavigate={openModule}
      back={back}
    >
      {activeModule === "home" && <VeynHome businessId={businessId} membership={membership} onOpen={openModule}/>} 
      {activeModule === "orders" && <VeynOrders businessId={businessId} canCreate={can("orders.create")} canEdit={can("orders.edit")} onOpenBilling={openBillingForOrder}/>} 
      {activeModule === "billing" && <VeynBilling businessId={businessId} can={can} focusOrderId={billingFocusOrderId}/>} 
      {activeModule === "admin" && <VeynSettings membership={membership} canManageUsers={can("users.manage")} onRefresh={() => void refresh()}/>} 
    </JinamBusinessShell>
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
      <button type="button" className="panel veynMetric veynPositiveMetric" onClick={() => onOpen("billing")}><small>CHALLANS</small><strong>{counts.challans}</strong><span>Billing →</span></button>
      <button type="button" className="panel veynMetric veynPositiveMetric" onClick={() => onOpen("billing")}><small>INVOICES</small><strong>{counts.invoices}</strong><span>Billing →</span></button>
    </div>
    <div className="veynQuickActions">
      {canAccess(membership, "orders") && <button type="button" className="primary" onClick={() => onOpen("orders")}>Open requirements</button>}
      {canAccess(membership, "billing") && <button type="button" className="secondary" onClick={() => onOpen("billing")}>Open commercial pipeline</button>}
    </div>
  </section>;
}

function VeynSettings({ membership, canManageUsers, onRefresh }: { membership: BusinessMembership; canManageUsers: boolean; onRefresh: () => void }) {
  const openAccess = () => {
    const button = document.querySelector<HTMLButtonElement>(".accessMenuEntry");
    button?.click();
  };

  return <section className="page veynAdminPage">
    <div className="veynPageHead"><div><p className="eyebrow">SETTINGS</p><h1>Settings</h1></div></div>
    <div className="panel veynAdminCard">
      <dl className="veynAdminSummary"><div><dt>Business</dt><dd>{membership.businessName}</dd></div><div><dt>Role</dt><dd>{membership.role}</dd></div><div><dt>Modules</dt><dd>{membership.modules.join(" · ")}</dd></div></dl>
      <div className="veynAdminActions">
        {canManageUsers && <button type="button" className="primary" onClick={openAccess}>Users & access</button>}
        <button type="button" className="secondary" onClick={onRefresh}>Refresh access</button>
      </div>
    </div>
  </section>;
}
