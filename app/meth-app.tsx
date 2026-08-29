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
      <div><small>METH</small><h1>Home</h1><p>Commerce, production handoffs and fulfilment in one operational view.</p></div>
    </div>
    <div className="jinamDashboardGrid">
      <article className="jinamDashboardCard"><small>INCOMING ORDERS</small><strong>—</strong><span>Store order connection is the next MeTh implementation step.</span></article>
      <article className="jinamDashboardCard"><small>WITH SEIKO</small><strong>—</strong><span>Production-required lines will appear here after handoff is enabled.</span></article>
      <article className="jinamDashboardCard"><small>READY TO PACK</small><strong>—</strong><span>Completed production returns to MeTh for fulfilment.</span></article>
      <article className="jinamDashboardCard"><small>DISPATCH QUEUE</small><strong>—</strong><span>Customer-facing dispatch work will live here.</span></article>
    </div>
    <section className="jinamDashboardSection">
      <div className="jinamDashboardSectionHead"><div><h2>Operational foundation</h2><p>Only working MeTh modules are exposed in navigation. Commerce, inventory, vendors and fulfilment will appear as their workflows become functional.</p></div></div>
      <div className="jinamDashboardList">
        <div className="jinamDashboardRow"><strong>Store orders</strong><span>Planned connector</span></div>
        <div className="jinamDashboardRow"><strong>SEIKO production handoff</strong><span>Explicit linked workflow</span></div>
        <div className="jinamDashboardRow"><strong>MeTh packing & delivery</strong><span>Own fulfilment stage</span></div>
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
      <article className="jinamSettingsCard"><h2>Business setup</h2><p>Store connections, document templates, vendors and notification settings will be added here as their workflows are implemented.</p></article>
    </div>
  </section>;
}
