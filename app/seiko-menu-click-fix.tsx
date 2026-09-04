"use client";

import { useEffect } from "react";

const NAV_INTENT_KEY = "jinam:navigation-intent";

const targetByLabel: Record<string, string> = {
  Home: "home",
  Overview: "home",
  Orders: "orders",
  Labels: "labels",
  Scan: "scan",
  Trace: "trace",
  Production: "production",
  Inventory: "inventory",
  Sales: "sales",
  Delivery: "delivery",
  Settings: "settings",
};

function currentBusiness() {
  return new URLSearchParams(window.location.search).get("business")
    || localStorage.getItem("jinam:selected-business")
    || "seiko";
}

export function SeikoMenuClickFix() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(".app .topbar .moduleMenu .nav, .globalStandaloneMenu .nav");
      if (!button) return;
      const label = button.querySelector("small")?.textContent?.trim() || button.textContent?.trim() || "";
      const intent = targetByLabel[label];
      if (!intent) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      sessionStorage.setItem(NAV_INTENT_KEY, intent);
      const business = currentBusiness();
      window.location.assign(`/?business=${encodeURIComponent(business)}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
