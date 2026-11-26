import {APP_ICONS} from "./lib/app-icons";
import type { Metadata } from "next";
import "./globals.css";
import "./business-assistant.css";
import "./logo-fixes.css";
import "./label-designer.css";
import "./label-designer-polish.css";
import "./label-production-ready.css";
import "./label-finalization.css";
import "./label-no-order.css";
import "./label-records.css";
import "./production.css";
import "./integrated-theme.css";
import "./orders.css";
import "./order-enhancements.css";
import "./workspace-grid.css";
import "./app-ui-system.css";
import "./ui-regression-fixes.css";
import "./order-setup-polish.css";
import "./order-compact-ux.css";
import "./brand-header-final.css";
import "./label-flow-polish.css";
import "./label-controls.css";
import "./label-print-safety.css";
import "./global-navigation.css";
import "./access-control.css";
import "./modern-auth.css";
import "./jinam-shell.css";
import "./channel-connections.css";
import "./meth-commerce-settings.css";
import "./seiko-meth.css";
import "./veyn-app.css";
import "./veyn-functional.css";
import "./phase1-visual.css";
import "./seiko-phase1.css";
import "./seiko-phase2.css";
import "./seiko-stage2-safe.css";
import "./seiko-workspace-label-final.css";
import "./seiko-list-center-enhancements.css";
import "./seiko-refinement.css";
import "./seiko-operational-ux.css";
import "./seiko-interface-fixes.css";
import "./packing-workspace-audit.css";
import "./packing-workflow-final.css";
import "./seiko-stable.css";
import "./seiko-brand-theme.css";
import "./control-consistency.css";
import "./mobile-ux.css";
import { PersonLookup } from "./person-lookup";
import { AccessProvider } from "./access-control";
import { BusinessApplicationRouter } from "./business-application-router";

export const metadata: Metadata = {
  title: "SEIKO TAILORS",
  description: "SEIKO TAILORS order, measurement, production and billing workspace.",
  icons: { icon: [{ url: APP_ICONS.svg, type: "image/svg+xml" }, { url: APP_ICONS.small, sizes: "32x32", type: "image/png" }], shortcut: APP_ICONS.svg, apple: [{url:APP_ICONS.apple,sizes:"180x180",type:"image/png"}] },
  manifest: "/manifest.webmanifest?v=5",
  applicationName: "SEIKO TAILORS",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SEIKO TAILORS" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/></head><body><AccessProvider><PersonLookup/><BusinessApplicationRouter>{children}</BusinessApplicationRouter></AccessProvider></body></html>;
}