"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAccess } from "./access-control";
import { AppEnhancements } from "./app-enhancements";
import { MethApplication } from "./meth-app";
import { VeynApplication } from "./veyn-app";

export function BusinessApplicationRouter({ children }: { children: ReactNode }) {
  const { businessId } = useAccess();
  const pathname = usePathname();

  if (pathname === "/backups") return <>{children}</>;

  if (businessId === "veyn-health") return <VeynApplication/>;
  if (businessId === "meth") return <MethApplication/>;

  return <>
    <AppEnhancements/>
    {children}
  </>;
}
