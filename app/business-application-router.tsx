"use client";

import type { ReactNode } from "react";
import { useAccess } from "./access-control";
import { MethApplication } from "./meth-app";
import { VeynApplication } from "./veyn-app";
import { SeikoPriority0App } from "./seiko-priority0-app";

export function BusinessApplicationRouter({ children }: { children: ReactNode }) {
  const { businessId } = useAccess();

  if (businessId === "veyn-health") return <VeynApplication/>;
  if (businessId === "meth") return <MethApplication/>;
  if (businessId === "seiko") return <SeikoPriority0App/>;

  return <>{children}</>;
}
