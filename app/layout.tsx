import type { Metadata } from "next";
import "./globals.css";
import "./logo-fixes.css";
import "./label-designer.css";
import "./label-no-order.css";
import "./label-records.css";
import "./production.css";
import "./integrated-theme.css";
import "./orders.css";
import "./order-enhancements.css";
import "./workspace-grid.css";
import "./app-ui-system.css";
import "./ui-regression-fixes.css";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { ErpOrderSync } from "./erp-order-sync";

export const metadata: Metadata = {
  title: "Jinam Foundation",
  description: "Business-separated operations and traceability for Jinam.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "Jinam Foundation",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Jinam" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ErpOrderSync/><OwnerDropdownUx/>{children}</body></html>;
}
