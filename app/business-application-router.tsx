"use client";

import type { ReactNode } from "react";
import { useAccess } from "./access-control";
import { MethApplication } from "./meth-app";
import { VeynApplication } from "./veyn-app";
import { SeikoPriority0App } from "./seiko-priority0-app";

const RESCUE_SEIKO_HOST_PREFIX = "rebuild-seiko-orders-labels-v1-";

export function BusinessApplicationRouter({ children }: { children: ReactNode }) {
  const { businessId } = useAccess();
  const forceSeiko = typeof window !== "undefined" && (
    window.location.hostname.startsWith(RESCUE_SEIKO_HOST_PREFIX) ||
    new URLSearchParams(window.location.search).get("business") === "seiko"
  );

  if (forceSeiko || businessId === "seiko") return <SeikoPriority0App/>;
  if (businessId === "veyn-health") return <VeynApplication/>;
  if (businessId === "meth") return <MethApplication/>;

  return <>{children}</>;
}
