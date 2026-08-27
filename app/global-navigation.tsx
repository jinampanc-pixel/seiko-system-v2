"use client";
/* Exact business logos are intentionally rendered as supplied assets. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { callSeiko } from "./lib/seiko-api";
import {
  canAccess,
  normalizeMembership,
  THEME_PRESETS,
  type BusinessMembership,
  type FoundationBootstrap,
  type Module,
} from "./lib/foundation";

const NAV_INTENT_KEY = "jinam:navigation-intent";

const fallbackBusinesses: BusinessMembership[] = [
  normalizeMembership({
    businessId: "seiko",
    businessName: "Seiko",
    logoUrl: "/brands/seiko-logo-transparent.png",
    role: "owner",
    modules: ["home", "orders", "labels", "scan", "trace", "production", "inventory", "sales", "delivery", "admin"],
    theme: THEME_PRESETS.seiko,
  }),
  normalizeMembership({
    businessId: "veyn-health",
    businessName: "Veyn Health",
    logoUrl: "/brands/veyn-health-logo.png",
    role: "owner",
    modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"],
    theme: THEME_PRESETS.veyn,
  }),
  normalizeMembership({
    businessId: "meth",
    businessName: "MeTh",
    logoUrl: "/brands/meth-logo.jpg",
    role: "owner",
    modules: ["home", "labels", "scan", "trace", "production", "sales", "delivery", "admin"],
    theme: THEME_PRESETS.meth,
  }),
];

const moduleItems: Array<{ module: Module; label: string; icon: string }> = [
  { module: "home", label: "Home", icon: "⌂" },
  { module: "orders", label: "Orders", icon: "≡" },
  { module: "labels", label: "Labels", icon: "▤" },
  { module: "scan", label: "Scan", icon: "⌗" },
  { module: "trace", label: "Trace", icon: "◎" },
  { module: "production", label: "Production", icon: "•" },
  { module: "inventory", label: "Inventory", icon: "•" },
  { module: "sales", label: "Sales", icon: "•" },
  { module: "delivery", label: "Delivery", icon: "•" },
];

function currentBusinessId() {
  if (typeof window === "undefined") return "seiko";
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}

function cleanBusinesses(items: BusinessMembership[]) {
  return items.filter(item => item.businessId !== "veyn-view" && item.modules.includes("home"));
}

function navigateToRoot(target: Module | "settings") {
  sessionStorage.setItem(NAV_INTENT_KEY, target);
  window.location.assign("/");
}

function BusinessNavigator({ businesses, businessId, onChange }: {
  businesses: BusinessMembership[];
  businessId: string;
  onChange: (businessId: string) => void;
}) {
  const selected = businesses.find(item => item.businessId === businessId) || businesses[0];
  if (!selected) return null;

  return <div className="globalBusinessNavigator">
    <span className={`globalBusinessIcon logo-${selected.businessId}`} aria-hidden="true">
      {selected.logoUrl ? <img src={selected.logoUrl} alt=""/> : <b>{selected.businessName.slice(0, 1)}</b>}
    </span>
    <label className="globalBusinessSelect">
      <span className="srOnly">Switch business</span>
      <select aria-label="Switch business" value={selected.businessId} onChange={event => onChange(event.target.value)}>
        {businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}
      </select>
      <i aria-hidden="true"/>
    </label>
  </div>;
}

function StandaloneNavigation({ businesses, businessId, onBusinessChange }: {
  businesses: BusinessMembership[];
  businessId: string;
  onBusinessChange: (businessId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const membership = businesses.find(item => item.businessId === businessId) || businesses[0];
  if (!membership) return null;

  return <>
    <div className="topbarEnd globalStandaloneNavEnd">
      <button className={`menuToggle ${open ? "active" : ""}`} onClick={() => setOpen(value => !value)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
        <span/><span/><span/>
      </button>
    </div>
    {open && <>
      <button className="menuBackdrop" aria-label="Close menu" onClick={() => setOpen(false)}/>
      <nav className="moduleMenu globalStandaloneMenu" aria-label="Modules">
        <div className="moduleMenuHead"><b>Menu</b><button onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
        {moduleItems.filter(item => canAccess(membership, item.module)).map(item => <button
          type="button"
          className={`nav ${item.module === "labels" ? "active" : ""}`}
          key={item.module}
          onClick={() => navigateToRoot(item.module)}
        ><span>{item.icon}</span><small>{item.label}</small></button>)}
        {canAccess(membership, "admin") && <div className="moduleMenuSettings"><button type="button" className="nav" onClick={() => navigateToRoot("settings")}><span>⚙</span><small>Settings</small></button></div>}
        <BusinessNavigator businesses={businesses} businessId={businessId} onChange={onBusinessChange}/>
      </nav>
    </>}
  </>;
}

export function GlobalNavigation() {
  const [businesses, setBusinesses] = useState<BusinessMembership[]>(fallbackBusinesses);
  const [businessId, setBusinessId] = useState(currentBusinessId);
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [createHeader, setCreateHeader] = useState<HTMLElement | null>(null);
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const standaloneLabels = pathname.startsWith("/labels/create");

  useEffect(() => {
    let cancelled = false;
    callSeiko<FoundationBootstrap>("foundationBootstrap").then(result => {
      if (cancelled || !result.ok || !result.data.businesses?.length) return;
      const next = cleanBusinesses(result.data.businesses.map(normalizeMembership));
      if (!next.length) return;
      setBusinesses(next);
      setBusinessId(current => next.some(item => item.businessId === current) ? current : next[0].businessId);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const rootMenu = document.querySelector<HTMLElement>(".app .topbar .moduleMenu");
      const labelHeader = document.querySelector<HTMLElement>(".labelCreateApp .labelCreateTopbar");
      setMenuHost(current => current === rootMenu ? current : rootMenu);
      setCreateHeader(current => current === labelHeader ? current : labelHeader);

      document.querySelectorAll<HTMLElement>(".moduleMenu .nav small").forEach(label => {
        if (label.textContent?.trim() === "Overview") label.textContent = "Home";
      });

      document.querySelectorAll<HTMLElement>(".compactBusinessPicker,.labelCreateBrand").forEach(logo => {
        logo.setAttribute("role", "button");
        logo.setAttribute("tabindex", "0");
        logo.setAttribute("aria-label", "Go to Home");
        logo.classList.add("globalHomeLogo");
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const goHome = () => {
      sessionStorage.removeItem(NAV_INTENT_KEY);
      window.location.assign("/");
    };
    const click = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const logo = target.closest<HTMLElement>(".globalHomeLogo");
      if (logo) {
        event.preventDefault();
        goHome();
        return;
      }

      const activeNav = target.closest<HTMLButtonElement>(".app .topbar .moduleMenu .nav.active");
      const label = activeNav?.querySelector("small")?.textContent?.trim();
      if (activeNav && (label === "Orders" || label === "Labels")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        navigateToRoot(label.toLowerCase() as "orders" | "labels");
      }
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList.contains("globalHomeLogo") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      goHome();
    };
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown, true);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;
    const intent = sessionStorage.getItem(NAV_INTENT_KEY) as Module | "settings" | null;
    if (!intent) return;
    sessionStorage.removeItem(NAV_INTENT_KEY);
    if (intent === "home") return;

    let attempts = 0;
    const openTarget = () => {
      attempts += 1;
      const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
      if (!toggle) {
        if (attempts < 50) window.setTimeout(openTarget, 40);
        return;
      }
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      window.setTimeout(() => {
        const expected = intent === "settings" ? "Settings" : moduleItems.find(item => item.module === intent)?.label;
        const target = Array.from(document.querySelectorAll<HTMLButtonElement>(".moduleMenu .nav")).find(button => button.querySelector("small")?.textContent?.trim() === expected);
        if (target) target.click();
        else if (attempts < 50) window.setTimeout(openTarget, 40);
      }, 0);
    };
    openTarget();
  }, [pathname]);

  const visibleBusinesses = useMemo(() => cleanBusinesses(businesses), [businesses]);
  const changeBusiness = (nextBusinessId: string) => {
    localStorage.setItem("jinam:selected-business", nextBusinessId);
    setBusinessId(nextBusinessId);
    if (standaloneLabels) {
      const url = new URL(window.location.href);
      url.searchParams.set("business", nextBusinessId);
      url.searchParams.delete("order");
      url.searchParams.delete("purpose");
      window.location.assign(`${url.pathname}?${url.searchParams.toString()}`);
      return;
    }
    sessionStorage.removeItem(NAV_INTENT_KEY);
    window.location.assign("/");
  };

  return <>
    {menuHost && !standaloneLabels && createPortal(<BusinessNavigator businesses={visibleBusinesses} businessId={businessId} onChange={changeBusiness}/>, menuHost)}
    {createHeader && standaloneLabels && createPortal(<StandaloneNavigation businesses={visibleBusinesses} businessId={businessId} onBusinessChange={changeBusiness}/>, createHeader)}
  </>;
}
