"use client";

import { ErpOrderSync } from "./erp-order-sync";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { OrderSetupPolish } from "./order-setup-polish";
import { OrderSetupFinalize } from "./order-setup-finalize";
import { OrderCompactUx } from "./order-compact-ux";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { LabelFlowPolish } from "./label-flow-polish";
import { LabelDesignerPolish } from "./label-designer-polish";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
import { LabelDesignerInteractions } from "./label-designer-interactions";
import { GlobalNavigation } from "./global-navigation";

/**
 * Small compatibility/enhancement adapters that sit above the primary React UI.
 *
 * Keep this list deliberate and ordered. New business logic must live in its
 * owning React module rather than being added here. These adapters exist for
 * backwards-compatible UX improvements while the older screens are gradually
 * absorbed into their owning components.
 */
export function AppEnhancements() {
  return <>
    <ErpOrderSync />
    <OwnerDropdownUx />
    <OrderSetupPolish />
    <OrderSetupFinalize />
    <OrderCompactUx />
    <WorkspaceTopPager />
    <WorkspaceShortcuts />
    <LabelFlowPolish />
    <LabelDesignerPolish />
    <LabelProductionReady />
    <LabelFinalization />
    <LabelDesignerInteractions />
    <GlobalNavigation />
  </>;
}
