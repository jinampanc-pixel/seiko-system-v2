"use client";

import { ErpOrderSync } from "./erp-order-sync";
import { OrderCompactUx } from "./order-compact-ux";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
import { LabelV2Accessibility } from "./label-v2-accessibility";
import { SeikoOperationalFinalize } from "./seiko-operational-finalize";
import { GlobalNavigation } from "./global-navigation";
import { SeikoPhase1 } from "./seiko-phase1";
import { SeikoPhase2Gate } from "./seiko-phase2-gate";
import { SeikoLibraryAutofill } from "./seiko-library-autofill";
import { SeikoMethSync } from "./seiko-meth-sync";
import { MethServerSync } from "./meth-server-sync";

export function AppEnhancements() {
  return <>
    <ErpOrderSync />
    {/* Stage 2 deliberately removes the older order-setup policy DOM layers.
        Group quantities are now default + exceptions, and fixed system modes use
        native selects instead of removable/aliasable owner dropdowns. */}
    <OrderCompactUx />
    <WorkspaceTopPager />
    <WorkspaceShortcuts />
    {/* Keep only the QR renderer and exact physical print adapter from the legacy
        label polish stack. The Stage 2 designer owns its UI and interactions. */}
    <LabelProductionReady />
    <LabelFinalization />
    <LabelV2Accessibility />
    <GlobalNavigation />
    <SeikoPhase1 />
    <SeikoLibraryAutofill />
    <SeikoPhase2Gate />
    <MethServerSync />
    <SeikoMethSync />
    <SeikoOperationalFinalize />
  </>;
}