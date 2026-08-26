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
import "./label-dropdown-final.css";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { OrderSetupPolish } from "./order-setup-polish";
import { OrderSetupFinalize } from "./order-setup-finalize";
import { OrderCompactUx } from "./order-compact-ux";
import { ErpOrderSync } from "./erp-order-sync";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { LabelFlowPolish } from "./label-flow-polish";
import { LabelDesignerPolish } from "./label-designer-polish";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
import { LabelDropdownFinal } from "./label-dropdown-final";

export const metadata: Metadata = {
  title: "Jinam Foundation",
  description: "Business-separated operations and traceability for Jinam.",
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  applicationName: "Jinam Foundation",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Jinam" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ErpOrderSync/><OwnerDropdownUx/><OrderSetupPolish/><OrderSetupFinalize/><OrderCompactUx/><WorkspaceTopPager/><WorkspaceShortcuts/><LabelFlowPolish/><LabelDesignerPolish/><LabelProductionReady/><LabelFinalization/><LabelDropdownFinal/>{children}</body></html>;
}
