"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { THEME_PRESETS, themeVariables, type BusinessTheme } from "../lib/foundation";
import type { SeikoPriorityModule } from "./model";

const NAVIGATION: Array<{ module: SeikoPriorityModule; label: string; note: string }> = [
  { module: "home", label: "Home", note: "Operational overview" },
  { module: "orders", label: "Orders", note: "Order Center and workspace" },
  { module: "labels", label: "Packing labels", note: "Person/package labels" },
  { module: "reports", label: "Reports & PDF", note: "Filtered operational reports" },
  { module: "billing", label: "Billing & challans", note: "Invoices and delivery challans" },
];

export function SeikoPriorityShell({
  active,
  theme,
  onNavigate,
  children,
}: {
  active: SeikoPriorityModule;
  theme?: BusinessTheme;
  onNavigate: (module: SeikoPriorityModule) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  const navigate = (module: SeikoPriorityModule) => { setMenuOpen(false); onNavigate(module); };

  return <div className="seikoP0App" style={themeVariables(theme || THEME_PRESETS.seiko) as CSSProperties}>
    <header className="seikoP0Topbar">
      <button className="seikoP0Brand" type="button" onClick={() => navigate("home")} aria-label="SEIKO Home"><img src="/brands/seiko-logo-transparent.png" alt="SEIKO Tailors"/></button>
      <div className="seikoP0TopbarContext"><span>{NAVIGATION.find(item => item.module === active)?.label}</span></div>
      <button className="seikoP0MenuToggle" type="button" onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>☰</button>
    </header>

    {menuOpen && <>
      <button className="seikoP0Backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu"/>
      <aside className="seikoP0Drawer" aria-label="SEIKO modules">
        <div className="seikoP0DrawerHead"><div><strong>SEIKO</strong><small>Operations</small></div><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div>
        <nav className="seikoP0NavList">{NAVIGATION.map(item => <button key={item.module} type="button" className={`seikoP0Nav ${active === item.module ? "active" : ""}`} onClick={() => navigate(item.module)}><strong>{item.label}</strong><small>{item.note}</small></button>)}</nav>
        <div className="seikoP0DrawerNote">Clean Priority‑0 runtime · Orders are the source of truth</div>
      </aside>
    </>}

    <main className="seikoP0Main">{children}</main>
  </div>;
}
