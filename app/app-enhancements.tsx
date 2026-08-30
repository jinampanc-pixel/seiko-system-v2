"use client";

import { ErpOrderSync } from "./erp-order-sync";
import { ErpSyncNotice } from "./erp-sync-notice";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { OrderSetupPolish } from "./order-setup-polish";
import { OrderSetupFinalize } from "./order-setup-finalize";
import { OrderCompactUx } from "./order-compact-ux";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { WorkspaceRowActions } from "./workspace-row-actions";
import { SeikoCloseConfirm } from "./seiko-close-confirm";
import { LabelFlowPolish } from "./label-flow-polish";
import { LabelDesignerPolish } from "./label-designer-polish";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
import { LabelDesignerInteractions } from "./label-designer-interactions";
import { GlobalNavigation } from "./global-navigation";
import { SeikoPhase1 } from "./seiko-phase1";
import { SeikoPhase2Gate } from "./seiko-phase2-gate";
import { SeikoLibraryAutofill } from "./seiko-library-autofill";
import { SeikoMethSync } from "./seiko-meth-sync";
import { MethServerSync } from "./meth-server-sync";

export function AppEnhancements() {
  return <>
    <ErpOrderSync />
    <ErpSyncNotice />
    <OwnerDropdownUx />
    <OrderSetupPolish />
    <OrderSetupFinalize />
    <OrderCompactUx />
    <WorkspaceTopPager />
    <WorkspaceShortcuts />
    <WorkspaceRowActions />
    <SeikoCloseConfirm />
    <LabelFlowPolish />
    <LabelDesignerPolish />
    <LabelProductionReady />
    <LabelFinalization />
    <LabelDesignerInteractions />
    <GlobalNavigation />
    <SeikoPhase1 />
    <SeikoLibraryAutofill />
    <SeikoPhase2Gate />
    <MethServerSync />
    <SeikoMethSync />
  </>;
}
