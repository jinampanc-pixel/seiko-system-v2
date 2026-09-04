"use client";

import { useEffect, type ReactNode } from "react";
import { useAccess } from "./access-control";
import { AppEnhancements } from "./app-enhancements";
import { MethApplication } from "./meth-app";
import { VeynApplication } from "./veyn-app";

const RESCUE_SEIKO_HOST_PREFIX = "rebuild-seiko-orders-labels-v1-";

export function BusinessApplicationRouter({ children }: { children: ReactNode }) {
  const { businessId } = useAccess();
  const rescueSeikoHost = typeof window !== "undefined" && window.location.hostname.startsWith(RESCUE_SEIKO_HOST_PREFIX);

  useEffect(() => {
    if (!rescueSeikoHost || businessId === "seiko") return;
    localStorage.setItem("jinam:selected-business", "seiko");
    window.location.reload();
  }, [businessId, rescueSeikoHost]);

  if (rescueSeikoHost && businessId !== "seiko") {
    return <div className="app"><div className="surface"><main><section className="page"><div className="panel">Opening SEIKO…</div></section></main></div></div>;
  }

  if (businessId === "veyn-health") return <VeynApplication/>;
  if (businessId === "meth") return <MethApplication/>;

  return <>
    <AppEnhancements/>
    {children}
  </>;
}
