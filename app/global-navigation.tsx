"use client";
/* Exact business logos are intentionally rendered as supplied assets. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
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
type NavIntent = Module | "settings" | "meth jobs" | "clients" | "products" | "billing" | "users & access";

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

const standaloneItems: Array<{ intent: NavIntent; label: string; icon: string; module?: Module }> = [
  { intent: "home", label: "Home", icon: "⌂", module: "home" },
  { intent: "orders", label: "Orders", icon: "≡", module: "orders" },
  { intent: "labels", label: "Labels", icon: "▤", module: "labels" },
  { intent: "scan", label: "Scan", icon: "⌗", module: "scan" },
  { intent: "trace", label: "Trace", icon: "◎", module: "trace" },
  { intent: "production", label: "Production", icon: "•", module: "production" },
  { intent: "meth jobs", label: "MeTh jobs", icon: "↔" },
  { intent: "clients", label: "Clients", icon: "◎" },
  { intent: "products", label: "Products", icon: "◇" },
  { intent: "billing", label: "Billing", icon: "₹" },
];

function currentBusinessId() {
  if (typeof window === "undefined") return "seiko";
  const params = new URLSearchParams(window.location.search);
  return params.get("business") || localStorage.getItem("jinam:selected-business") || "seiko";
}

function cleanBusinesses(items: BusinessMembership[]) {
  return items.filter(item => item.businessId !== "veyn-view" && item.modules.includes("home"));
}

function rootUrl(businessId = currentBusinessId()) {
  return `/?business=${encodeURIComponent(businessId)}`;
}

function goToRoot(intent: NavIntent) {
  if (intent === "home") sessionStorage.removeItem(NAV_INTENT_KEY);
  else sessionStorage.setItem(NAV_INTENT_KEY, intent);
  window.location.assign(rootUrl());
}

function setReactSelectValue(select: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function BusinessNavigator({ businesses, businessId, onChange }: {
  businesses: BusinessMembership[];
  businessId: string;
  onChange: (businessId: string) => void;
}) {
  const selected = businesses.find(item => item.businessId === businessId) || businesses[0];
  if (!selected) return null;
  return <div className="globalBusinessNavigator" title="Switch business">
    <span className={`globalBusinessIcon logo-${selected.businessId}`} aria-hidden="true">
      {selected.logoUrl ? <img src={selected.logoUrl} alt=""/> : <b>{selected.businessName.slice(0, 1)}</b>}
    </span>
    <span className="globalBusinessName">{selected.businessName}</span>
    <span className="globalBusinessChevron" aria-hidden="true"/>
    <select aria-label="Switch business" value={selected.businessId} onChange={event => onChange(event.target.value)}>
      {businesses.map(item => <option key={item.businessId} value={item.businessId}>{item.businessName}</option>)}
    </select>
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
  const visible = standaloneItems.filter(item => !item.module || canAccess(membership, item.module));

  return <>
    <div className="topbarEnd globalStandaloneNavEnd">
      <button className={`menuToggle ${open ? "active" : ""}`} onClick={() => setOpen(value => !value)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
        <span/><span/><span/>
      </button>
    </div>
    {open && <>
      <button className="menuBackdrop" aria-label="Close menu" onClick={() => setOpen(false)}/>
      <nav className="moduleMenu globalStandaloneMenu" aria-label="Modules">
        <BusinessNavigator businesses={businesses} businessId={businessId} onChange={onBusinessChange}/>
        <div className="moduleMenuHead"><b>Menu</b><button onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
        {visible.map(item => <button type="button" className={`nav ${item.intent === "labels" ? "active" : ""}`} key={item.intent} onClick={() => goToRoot(item.intent)}>
          <span>{item.icon}</span><small>{item.label}</small>
        </button>)}
        {canAccess(membership, "admin") && <div className="moduleMenuSettings">
          <button type="button" className="nav" onClick={() => goToRoot("settings")}><span>⚙</span><small>Settings</small></button>
          <button type="button" className="nav" onClick={() => goToRoot("users & access")}><span>◎</span><small>Users &amp; access</small></button>
        </div>}
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
    const syncHosts = () => {
      setMenuHost(document.querySelector<HTMLElement>(".app .topbar .moduleMenu"));
      setCreateHeader(document.querySelector<HTMLElement>(".labelCreateApp .labelCreateTopbar"));
    };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;
    const requestedBusiness = new URLSearchParams(window.location.search).get("business");
    if (!requestedBusiness) return;
    const timer = window.setTimeout(() => {
      const select = document.querySelector<HTMLSelectElement>(".app .compactBusinessPicker select");
      if (select && Array.from(select.options).some(option => option.value === requestedBusiness) && select.value !== requestedBusiness) {
        setReactSelectValue(select, requestedBusiness);
      }
      localStorage.setItem("jinam:selected-business", requestedBusiness);
      setBusinessId(requestedBusiness);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/") return;
    const intent = sessionStorage.getItem(NAV_INTENT_KEY) as NavIntent | null;
    if (!intent) return;
    sessionStorage.removeItem(NAV_INTENT_KEY);
    const timer = window.setTimeout(() => {
      const toggle = document.querySelector<HTMLButtonElement>(".app .topbar .menuToggle");
      if (!toggle) return;
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      window.setTimeout(() => {
        const expected = intent === "home" ? "Home" : intent.split(" ").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".app .topbar .moduleMenu .nav"));
        const target = buttons.find(button => {
          const label = button.querySelector("small")?.textContent?.trim() || "";
          return label.toLowerCase() === expected.toLowerCase() || (intent === "home" && label === "Overview");
        });
        if (target) target.click();
        else if (toggle.getAttribute("aria-expanded") === "true") toggle.click();
      }, 30);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const visibleBusinesses = cleanBusinesses(businesses);
  const changeBusiness = (nextBusinessId: string) => {
    localStorage.setItem("jinam:selected-business", nextBusinessId);
    setBusinessId(nextBusinessId);
    sessionStorage.removeItem(NAV_INTENT_KEY);
    if (standaloneLabels) {
      const url = new URL(window.location.href);
      url.searchParams.set("business", nextBusinessId);
      url.searchParams.delete("order");
      url.searchParams.delete("purpose");
      window.location.assign(`${url.pathname}?${url.searchParams.toString()}`);
      return;
    }
    const rootSelect = document.querySelector<HTMLSelectElement>(".app .compactBusinessPicker select");
    if (rootSelect && Array.from(rootSelect.options).some(option => option.value === nextBusinessId)) setReactSelectValue(rootSelect, nextBusinessId);
    else window.location.assign(rootUrl(nextBusinessId));
  };

  return <>
    {menuHost && !standaloneLabels && createPortal(<BusinessNavigator businesses={visibleBusinesses} businessId={businessId} onChange={changeBusiness}/>, menuHost)}
    {createHeader && standaloneLabels && createPortal(<StandaloneNavigation businesses={visibleBusinesses} businessId={businessId} onBusinessChange={changeBusiness}/>, createHeader)}
  </>;
}
