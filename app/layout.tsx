import type { Metadata } from "next";
import "./globals.css";
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
import "./control-consistency.css";
import "./access-control.css";
import "./modern-auth.css";
import "./jinam-shell.css";
import "./veyn-app.css";
import "./veyn-functional.css";
import "./phase1-visual.css";
import { AccessProvider } from "./access-control";
import { BusinessApplicationRouter } from "./business-application-router";

export const metadata: Metadata = {
  title: "Jinam",
  description: "One secure platform for the separate SEIKO, véyn health and MeTh business applications.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "Jinam",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Jinam" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AccessProvider><BusinessApplicationRouter>{children}</BusinessApplicationRouter></AccessProvider></body></html>;
}
