"use client";

import { useState } from "react";
import { useAccess } from "./access-control";
import { JinamBusinessShell } from "./jinam-business-shell";
import { THEME_PRESETS } from "./lib/foundation";

const METH_NAV = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "settings", label: "Settings", icon: "⚙" },
] as const;

type MethModule = (typeof METH_NAV)[number]["key"];

export function MethApplication() {
  const { businessId, membership } = useAccess();
  const [module, setModule] = useState<MethModule>("home");
  if (businessId !== "meth" || !membership) return null;

  return <JinamBusinessShell<MethModule>
    businessName={membership.businessName || "MeTh"}
    businessLogo={membership.logoUrl || "/brands/meth-logo.jpg"}
    theme={membership.theme || THEME_PRESETS.meth}
    nav={METH_NAV}
    active={module}
    onNavigate={setModule}
    back={module !== "home" ? { label: "Back to Home", onClick: () => setModule("home") } : undefined}
  >
    {module === "home" ? <MethHome/> : <MethSettings/>}
  </JinamBusinessShell>;
}

function MethHome() {
  return <section className="jinamDashboard">
    <div className="jinamDashboardHead">
      <div><small>METH</small><h1>Home</h1><p>Store orders, production handoffs and fulfilment queues.</p></div>
    </div>
    <div className="jinamDashboardGrid">
      <article className="jinamDashboardCard"><small>INCOMING ORDERS</small><strong>0</strong><span>Orders received from the store</span></article>
      <article className="jinamDashboardCard"><small>IN PRODUCTION</small><strong>0</strong><span>Linked SEIKO production handoffs</span></article>
      <article className="jinamDashboardCard"><small>READY TO PACK</small><strong>0</strong><span>Returned from production</span></article>
      <article className="jinamDashboardCard"><small>READY TO DISPATCH</small><strong>0</strong><span>Packed customer orders</span></article>
    </div>
    <section className="jinamDashboardSection">
      <div className="jinamDashboardSectionHead"><div><h2>Today</h2><p>Operational queues will populate automatically as connected MeTh orders arrive.</p></div></div>
      <div className="jinamDashboardList">
        <div className="jinamDashboardRow"><strong>Orders needing action</strong><span>0</span></div>
        <div className="jinamDashboardRow"><strong>Production returns ready for packing</strong><span>0</span></div>
        <div className="jinamDashboardRow"><strong>Dispatches due</strong><span>0</span></div>
      </div>
    </section>
  </section>;
}

function MethSettings() {
  const openAccess = () => document.querySelector<HTMLButtonElement>(".accessMenuEntry")?.click();
  return <section className="jinamSettingsPage">
    <div className="jinamSettingsHead"><small>METH</small><h1>Settings</h1></div>
    <div className="jinamSettingsGrid">
      <article className="jinamSettingsCard"><h2>Users & access</h2><p>Manage who can enter MeTh and what each person can see or do.</p><button type="button" className="primary" onClick={openAccess}>Open users & access</button></article>
    </div>
  </section>;
}
