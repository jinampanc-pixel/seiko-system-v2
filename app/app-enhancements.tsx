"use client";

import { ErpOrderSync } from "./erp-order-sync";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { OrderSetupFinalize } from "./order-setup-finalize";
import { OrderCompactUx } from "./order-compact-ux";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
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
    <OwnerDropdownUx />
    {/* The former OrderSetupPolish layer disabled and cleared the group fallback
        quantity. Stage 2 keeps the owning React controls native and lets the
        finalizer add only presentation/accessibility improvements. */}
    <OrderSetupFinalize />
    <OrderCompactUx />
    <WorkspaceTopPager />
    <WorkspaceShortcuts />
    {/* Keep only the QR renderer and exact physical print adapter from the legacy
        label polish stack. The Stage 2 designer owns its UI and interactions. */}
    <LabelProductionReady />
    <LabelFinalization />
    <GlobalNavigation />
    <SeikoPhase1 />
    <SeikoLibraryAutofill />
    <SeikoPhase2Gate />
    <MethServerSync />
    <SeikoMethSync />
    <SeikoOperationalFinalize />
  </>;
}