"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccess } from "./access-control";
import { JinamBusinessShell, type JinamShellNavItem } from "./jinam-business-shell";
import { canAccess, THEME_PRESETS, type BusinessMembership, type Module } from "./lib/foundation";
import { listVeynRequirements, type VeynRequirementEnvelope } from "./lib/veyn-requirements";
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
  const [records, setRecords] = useState<VeynRequirementEnvelope[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listVeynRequirements(businessId).then(next => { if (!cancelled) setRecords(next); })
      .catch(cause => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Dashboard could not be loaded."); });
    return () => { cancelled = true; };
  }, [businessId]);

  const open = records.filter(record => !["Closed", "Delivered"].includes(record.order.status));
  const awaitingPo = records.filter(record => record.order.commercial.quotations.some(item => item.status === "accepted") && record.order.commercial.purchaseOrders.length === 0);
  const deliveryOpen = records.filter(record => record.order.commercial.purchaseOrders.some(item => ["open", "part-delivered"].includes(item.status)));
  const invoiceOutstanding = records.filter(record => record.order.commercial.invoices.some(item => ["issued", "part-paid"].includes(item.status)));
  const paidInvoices = records.reduce((sum, record) => sum + record.order.commercial.invoices.filter(item => item.status === "paid").length, 0);
  const quotations = records.reduce((sum, record) => sum + record.order.commercial.quotations.length, 0);
  const challans = records.reduce((sum, record) => sum + record.order.commercial.deliveryChallans.length, 0);
  const invoices = records.reduce((sum, record) => sum + record.order.commercial.invoices.length, 0);
  const recent = [...records].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 4);

  return <section className="jinamDashboard veynDashboard">
    <div className="jinamDashboardHead">
      <div><small>VÉYN HEALTH</small><h1>Home</h1><p>Requirements, commercial actions and fulfilment in one operational view.</p></div>
      <div className="jinamDashboardActions">
        {canAccess(membership, "orders") && <button type="button" className="primary" onClick={() => onOpen("orders")}>New / open requirement</button>}
        {canAccess(membership, "billing") && <button type="button" className="secondary" onClick={() => onOpen("billing")}>Commercial pipeline</button>}
      </div>
    </div>
    {loadError && <div className="accessError" role="alert">{loadError}</div>}
    <div className="jinamDashboardGrid">
      <button type="button" className="jinamDashboardCard veynDashboardButton" onClick={() => onOpen("orders")}><small>OPEN REQUIREMENTS</small><strong>{open.length}</strong><span>Institutional work still active</span></button>
      <button type="button" className="jinamDashboardCard veynDashboardButton" onClick={() => onOpen("billing")}><small>AWAITING PO</small><strong>{awaitingPo.length}</strong><span>Accepted quotations without PO</span></button>
      <button type="button" className="jinamDashboardCard veynDashboardButton" onClick={() => onOpen("billing")}><small>DELIVERY OPEN</small><strong>{deliveryOpen.length}</strong><span>Open or part-delivered POs</span></button>
      <button type="button" className="jinamDashboardCard veynDashboardButton" data-tone={invoiceOutstanding.length === 0 && paidInvoices > 0 ? "positive" : undefined} onClick={() => onOpen("billing")}><small>INVOICE OUTSTANDING</small><strong>{invoiceOutstanding.length}</strong><span>{invoiceOutstanding.length ? "Issued / part-paid invoices" : paidInvoices ? `${paidInvoices} paid` : "No outstanding invoices"}</span></button>
    </div>
    <section className="jinamDashboardSection">
      <div className="jinamDashboardSectionHead"><div><h2>Commercial flow</h2><p>Quotation → PO → Delivery Challan → Invoice → Payment</p></div><span className="veynFlowSummary">{quotations} quotations · {challans} challans · {invoices} invoices</span></div>
      <div className="jinamDashboardActions"><button type="button" className="secondary" onClick={() => onOpen("billing")}>Open billing</button><button type="button" className="secondary" onClick={() => onOpen("orders")}>Open orders</button></div>
    </section>
    <section className="jinamDashboardSection">
      <div className="jinamDashboardSectionHead"><div><h2>Recent requirements</h2><p>Most recently updated VÉYN records.</p></div></div>
      <div className="jinamDashboardList">{recent.length ? recent.map(record => <div className="jinamDashboardRow" key={record.order.orderId}><strong>{record.order.details.institutionName || record.order.details.orderNo}</strong><span>{record.order.status} · {record.order.details.orderNo}</span></div>) : <div className="jinamDashboardRow"><strong>No requirements yet</strong><span>Start from Orders.</span></div>}</div>
    </section>
  </section>;
}

function VeynSettings({ membership, canManageUsers, onRefresh }: { membership: BusinessMembership; canManageUsers: boolean; onRefresh: () => void }) {
  const openAccess = () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click();

  return <section className="jinamSettingsPage">
    <div className="jinamSettingsHead"><small>VÉYN HEALTH</small><h1>Settings</h1></div>
    <div className="jinamSettingsGrid">
      <article className="jinamSettingsCard"><h2>Users & access</h2><p>Manage VÉYN memberships, roles and permissions.</p>{canManageUsers && <button type="button" className="primary" onClick={openAccess}>Open users & access</button>}</article>
      <article className="jinamSettingsCard"><h2>My access</h2><p>{membership.businessName} · {membership.role}</p><button type="button" className="secondary" onClick={onRefresh}>Refresh access</button></article>
    </div>
  </section>;
}
