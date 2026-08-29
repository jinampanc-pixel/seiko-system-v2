"use client";

import { useMemo, useState } from "react";
import { useAccess } from "./access-control";
import { ChannelConnectionSettings } from "./channel-connection-settings";
import { JinamBusinessShell } from "./jinam-business-shell";
import { THEME_PRESETS } from "./lib/foundation";
import { intercompanyStoreKey, methStoreKey, type IntercompanyTransaction, type MethChannelOrder, type ProductionHandoff } from "./lib/meth-commerce";
import { MethCommerceSettings, MethFinanceSurface, MethOrdersSurface, MethProductionSurface } from "./meth-commerce-ui";
import { MethFulfilmentRoutingSettings, MethRoutingDecisions } from "./meth-fulfilment-routing";
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
    <div className="jinamDashboardHead"><div><small>METH</small><h1>Home</h1><p>Channel orders, SEIKO production handoffs, fulfilment and financial settlement.</p></div></div>
    <div className="jinamDashboardGrid">
      <button className="jinamDashboardCard" onClick={() => onNavigate("orders")}><small>INCOMING ORDERS</small><strong>{metrics.incoming}</strong><span>Across Shopify, Amazon and other channels</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("production")}><small>IN PRODUCTION</small><strong>{metrics.production}</strong><span>Linked SEIKO production handoffs</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("production")}><small>READY TO PACK</small><strong>{metrics.pack}</strong><span>Accepted production returned to MeTh</span></button>
      <button className="jinamDashboardCard" onClick={() => onNavigate("orders")}><small>READY TO DISPATCH</small><strong>{metrics.dispatch}</strong><span>Packed customer orders</span></button>
    </div>
    <section className="jinamDashboardSection"><div className="jinamDashboardSectionHead"><div><h2>Financial control</h2><p>Customer payment, marketplace settlement and SEIKO payable remain separate records.</p></div></div><div className="jinamDashboardList"><button className="jinamDashboardRow" onClick={() => onNavigate("finance")}><strong>SEIKO payable</strong><span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(metrics.payable)}</span></button><div className="jinamDashboardRow"><strong>Production cost rule</strong><span>Only accepted, completed and chargeable units create MeTh cost.</span></div></div></section>
  </section>;
}

function MethSettings() {
  const openAccess = () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click();
  return <section className="jinamSettingsPage"><div className="jinamSettingsHead"><small>METH</small><h1>Settings</h1></div><div className="jinamSettingsGrid"><article className="jinamSettingsCard"><h2>Users & access</h2><p>Manage who can enter MeTh and what each person can see or do.</p><button type="button" className="primary" onClick={openAccess}>Open users & access</button></article><MethFulfilmentRoutingSettings/><ChannelConnectionSettings/><MethCommerceSettings/></div></section>;
}
