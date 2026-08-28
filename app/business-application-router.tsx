"use client";

import type { ReactNode } from "react";
import { useAccess } from "./access-control";
import { AppEnhancements } from "./app-enhancements";
import { VeynApplication } from "./veyn-app";

export function BusinessApplicationRouter({ children }: { children: ReactNode }) {
  const { businessId } = useAccess();

  if (businessId === "veyn-health") return <VeynApplication/>;

  return <>
    <AppEnhancements/>
    {children}
  </>;
}
