"use client";

import { useMemo, useState } from "react";
import { useAccess } from "./access-control";
import { ChannelConnectionSettings } from "./channel-connection-settings";
import { JinamBusinessShell } from "./jinam-business-shell";
import { THEME_PRESETS } from "./lib/foundation";
import { intercompanyStoreKey, methStoreKey, type IntercompanyTransaction, type MethChannelOrder, type ProductionHandoff } from "./lib/meth-commerce";
import { MethCommerceSettings } from "./meth-commerce-settings";
import { MethFinanceSurface, MethProductionSurface } from "./meth-commerce-ui";
import { MethFulfilmentRoutingSettings, MethRoutingDecisions } from "./meth-fulfilment-routing";
import { MethOrdersSurface } from "./meth-orders-surface";
import { MethServerSync } from "./meth-server-sync";

const METH_NAV = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "orders", label: "Orders", icon: "▤" },
  { key: "production", label: "Production", icon: "⌁" },
  { key: "finance", label: "Finance", icon: "₹" },
  { key: "settings", label: "Settings", icon: "⚙" },
] as const;

type MethModule = (typeof METH_NAV)[number]["key"];

export function MethApplication() {
  const { businessId, membership } = useAccess();
  const [module, setModule] = useState<MethModule>("home");
  const [routingRevision, setRoutingRevision] = useState(0);
  if (businessId !== "meth" || !membership) return null;

  return <>
    <MethServerSync/>
    <JinamBusinessShell<MethModule>
      businessName={membership.businessName || "MeTh"}
      businessLogo={membership.logoUrl || "/brands/meth-logo.jpg"}
      theme={membership.theme || THEME_PRESETS.meth}
      nav={METH_NAV}
      active={module}
      onNavigate={setModule}
      back={module !== "home" ? { label: "Back to Home", onClick: () => setModule("home") } : undefined}
    >
      {module === "home" && <MethHome onNavigate={setModule}/>} 
      {module === "orders" && <MethOrdersSurface/>}
      {module === "production" && <><MethRoutingDecisions onRouted={() => setRoutingRevision(value => value + 1)}/><MethProductionSurface key={routingRevision}/></>}
      {module === "finance" && <MethFinanceSurface/>}
      {module === "settings" && <MethSettings/>}
    </JinamBusinessShell>
  </>;
}

function read<T>(key: string, fallback: T): T { if (typeof window === "undefined") return fallback; try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }

function MethHome({ onNavigate }: { onNavigate: (module: MethModule) => void }) {
  const orders = read<MethChannelOrder[]>(methStoreKey("orders"), []);
  const handoffs = read<ProductionHandoff[]>(methStoreKey("handoffs"), []);
  const transactions = read<IntercompanyTransaction[]>(intercompanyStoreKey("transactions"), []);
  const metrics = useMemo(() => ({
    incoming: orders.filter(order => ["unfulfilled", "awaiting_production"].includes(order.fulfilmentStatus)).length,
    production: handoffs.filter(item => ["accepted", "cutting", "stitching", "finishing", "qc"].includes(item.seikoStatus)).length,
    pack: orders.filter(order => order.fulfilmentStatus === "ready_to_pack").length,
    dispatch: orders.filter(order => order.fulfilmentStatus === "packed").length,
    payable: transactions.reduce((sum, item) => sum + item.outstandingAmount, 0),
  }), [orders, handoffs, transactions]);
  return <section className="jinamDashboard">
    <div className="jinamDashboardHead"><div><small>METH</small><h1>Home</h1></div></div>
    <div className="jinamDashboardGrid">
      <button className="jinamDashboardCard" onClick={() => onNavigate("orders")}><small>INCOMING ORDERS</small><strong>{metrics.incoming}</strong><span>Across Shopify, Amazon and Other Channels</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("production")}><small>IN PRODUCTION</small><strong>{metrics.production}</strong><span>Linked SEIKO Production Handoffs</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("production")}><small>READY TO PACK</small><strong>{metrics.pack}</strong><span>Accepted Production Returned to MeTh</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("orders")}><small>READY TO DISPATCH</small><strong>{metrics.dispatch}</strong><span>Packed Customer Orders</span></button>
    </div>
    <section className="jinamDashboardSection"><div className="jinamDashboardSectionHead"><div><h2>Financial Control</h2></div></div><div className="jinamDashboardList"><button className="jinamDashboardRow" onClick={() => onNavigate("finance")}><strong>SEIKO Payable</strong><span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(metrics.payable)}</span></button></div></section>
  </section>;
}

function MethSettings() {
  const openAccess = () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click();
  return <section className="jinamSettingsPage"><div className="jinamSettingsHead"><small>METH</small><h1>Settings</h1></div><div className="jinamSettingsGrid"><article className="jinamSettingsCard"><h2>Users & Access</h2><button type="button" className="primary" onClick={openAccess}>Open Users & Access</button></article><MethFulfilmentRoutingSettings/><ChannelConnectionSettings/><MethCommerceSettings/></div></section>;
}
