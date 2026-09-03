"use client";

import { ErpOrderSync } from "./erp-order-sync";
import { ErpSyncNotice } from "./erp-sync-notice";
import { OwnerDropdownUx } from "./owner-dropdown-ux";
import { OrderSetupPolish } from "./order-setup-polish";
import { OrderSetupFinalize } from "./order-setup-finalize";
import { OrderCompactUx } from "./order-compact-ux";
import { WorkspaceTopPager } from "./workspace-top-pager";
import { WorkspaceShortcuts } from "./workspace-shortcuts";
import { WorkspaceRowMenu } from "./workspace-row-menu";
import { WorkspaceStructureInteractions } from "./workspace-structure-interactions";
import { SeikoCloseConfirm } from "./seiko-close-confirm";
import { LabelFlowPolish } from "./label-flow-polish";
import { LabelDesignerPolish } from "./label-designer-polish";
import { LabelProductionReady } from "./label-production-ready";
import { LabelFinalization } from "./label-finalization";
import { LabelDesignerInteractions } from "./label-designer-interactions";
import { LabelFieldCompact } from "./label-field-compact";
import { LabelWorkspaceRefinement } from "./label-workspace-refinement";
import { PackingWorkflowRuntimeFixes } from "./packing-workflow-runtime-fixes";
import { GlobalNavigation } from "./global-navigation";
import { SeikoPhase1 } from "./seiko-phase1";
import { SeikoPhase2Gate } from "./seiko-phase2-gate";
import { SeikoLibraryAutofill } from "./seiko-library-autofill";
import { SeikoListCenterEnhancements } from "./seiko-list-center-enhancements";
import { SeikoOperationalUx } from "./seiko-operational-ux";
import { SeikoInterfaceFixes } from "./seiko-interface-fixes";
import { SeikoMethSync } from "./seiko-meth-sync";
import { MethServerSync } from "./meth-server-sync";
import { SeikoReviewStabilization } from "./seiko-review-stabilization";
import { SeikoFinalLabelSizing } from "./seiko-final-label-sizing";
import { SeikoFinalUxPass } from "./seiko-final-ux-pass";
import { SeikoFinalOrderRouting } from "./seiko-final-order-routing";

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
    <WorkspaceRowMenu />
    <WorkspaceStructureInteractions />
    <SeikoCloseConfirm />
    <LabelFlowPolish />
    <LabelDesignerPolish />
    <LabelProductionReady />
    <LabelFinalization />
    <SeikoInterfaceFixes />
    <LabelDesignerInteractions />
    <LabelFieldCompact />
    <LabelWorkspaceRefinement />
    <PackingWorkflowRuntimeFixes />
    <GlobalNavigation />
    <SeikoPhase1 />
    <SeikoLibraryAutofill />
    <SeikoPhase2Gate />
    <SeikoListCenterEnhancements />
    <SeikoOperationalUx />
    <MethServerSync />
    <SeikoMethSync />
    <SeikoReviewStabilization />
    <SeikoFinalLabelSizing />
    <SeikoFinalUxPass />
    <SeikoFinalOrderRouting />
  </>;
}