"use client";
/* Business logos are rendered from their supplied assets. */
/* eslint-disable @next/next/no-img-element */

import { useState, type CSSProperties, type ReactNode } from "react";
import { useAccess } from "./access-control";
import { themeVariables, type BusinessTheme } from "./lib/foundation";

export type JinamShellNavItem<T extends string> = {
  key: T;
  label: string;
  icon: string;
};

export function JinamBusinessShell<T extends string>({
  businessName,
  businessLogo,
  theme,
  nav,
  active,
  onNavigate,
  back,
  children,
}: {
  businessName: string;
  businessLogo?: string;
  theme: BusinessTheme;
  nav: readonly JinamShellNavItem<T>[];
  active: T;
  onNavigate: (key: T) => void;
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  const { session, businessId } = useAccess();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (key: T) => {
    onNavigate(key);
    setMenuOpen(false);
  };

  const switchBusiness = (nextBusinessId: string) => {
    if (!nextBusinessId || nextBusinessId === businessId) return;
    localStorage.setItem("jinam:selected-business", nextBusinessId);
    window.location.assign(`/?business=${encodeURIComponent(nextBusinessId)}`);
  };

  return <div className="jinamBusinessShell" data-business={businessId} style={themeVariables(theme) as CSSProperties}>
    <header className="jinamShellTopbar">
      <button type="button" className="jinamSystemBrand" onClick={() => navigate(nav[0]?.key ?? active)} aria-label="Jinam home">
        <img src="/jinam-mark.svg?v=3" alt=""/>
        <span>Jinam</span>
      </button>
      <span className="jinamBrandDivider" aria-hidden="true"/>
      <button type="button" className="jinamBusinessBrand" onClick={() => navigate(nav[0]?.key ?? active)} aria-label={`${businessName} home`}>
        {businessLogo ? <img src={businessLogo} alt={`${businessName} logo`}/> : <strong>{businessName}</strong>}
      </button>
      <button type="button" className={`jinamShellMenuToggle ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(open => !open)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
        <span/><span/><span/>
      </button>
    </header>

    {menuOpen && <button type="button" className="jinamShellBackdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>}

    <aside className={`jinamShellDrawer ${menuOpen ? "open" : ""}`} aria-label={`${businessName} navigation`}>
      <div className="jinamDrawerHeading">
        <small>JINAM</small>
        <strong>{businessName}</strong>
      </div>
      <nav className="moduleMenu jinamModuleMenu" aria-label={`${businessName} modules`}>
        {nav.map(item => <button type="button" className={`nav ${active === item.key ? "active" : ""}`} key={item.key} onClick={() => navigate(item.key)}>
          <span>{item.icon}</span><small><b>{item.label}</b></small>
        </button>)}
      </nav>
      <label className="jinamBusinessSwitch">
        <span>Switch business</span>
        <select aria-label="Switch business" value={businessId} onChange={event => switchBusiness(event.target.value)}>
          {session?.businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}
        </select>
      </label>
    </aside>

    <main className="jinamShellMain">
      {back && <div className="jinamContextBar"><button type="button" className="jinamContextBack" onClick={back.onClick}>← {back.label}</button></div>}
      {children}
    </main>
  </div>;
}
