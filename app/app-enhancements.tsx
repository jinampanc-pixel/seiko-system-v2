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
import { SeikoPhase1 } from "./seiko-phase1";
import { SeikoPhase2Gate } from "./seiko-phase2-gate";
import { SeikoLibraryAutofill } from "./seiko-library-autofill";
import { SeikoMethSync } from "./seiko-meth-sync";
import { MethServerSync } from "./meth-server-sync";

/**
 * Rescue-branch enhancement registry.
 *
 * Orders/Workspace retain only the small adapters that still provide behaviour
 * not yet owned by the React source. Label, list-center, operational and menu
 * patch layers are deliberately not mounted: the React components are the
 * single interaction owners while Orders + Packing Labels are stabilised.
 */
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
    <SeikoPhase1 />
    <SeikoLibraryAutofill />
    <SeikoPhase2Gate />
    <MethServerSync />
    <SeikoMethSync />
  </>;
}
