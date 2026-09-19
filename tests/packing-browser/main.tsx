import "../../app/globals.css";
import "../../app/logo-fixes.css";
import "../../app/label-designer.css";
import "../../app/label-designer-polish.css";
import "../../app/label-production-ready.css";
import "../../app/label-finalization.css";
import "../../app/label-no-order.css";
import "../../app/label-records.css";
import "../../app/production.css";
import "../../app/integrated-theme.css";
import "../../app/orders.css";
import "../../app/order-enhancements.css";
import "../../app/workspace-grid.css";
import "../../app/app-ui-system.css";
import "../../app/ui-regression-fixes.css";
import "../../app/order-setup-polish.css";
import "../../app/order-compact-ux.css";
import "../../app/brand-header-final.css";
import "../../app/label-flow-polish.css";
import "../../app/label-controls.css";
import "../../app/label-print-safety.css";
import "../../app/global-navigation.css";
import "../../app/control-consistency.css";
import "../../app/access-control.css";
import "../../app/modern-auth.css";
import "../../app/jinam-shell.css";
import "../../app/channel-connections.css";
import "../../app/meth-commerce-settings.css";
import "../../app/seiko-meth.css";
import "../../app/veyn-app.css";
import "../../app/veyn-functional.css";
import "../../app/phase1-visual.css";
import "../../app/seiko-phase1.css";
import "../../app/seiko-phase2.css";
import "../../app/seiko-stage2-safe.css";
import "../../app/seiko-workspace-label-final.css";
import "../../app/seiko-list-center-enhancements.css";
import "../../app/seiko-refinement.css";
import "../../app/seiko-operational-ux.css";
import "../../app/seiko-interface-fixes.css";
import "../../app/packing-workspace-audit.css";
import "../../app/packing-workflow-final.css";
import "../../app/seiko-stable.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { PackingPersonLabelDesigner } from "../../app/packing-person-label-designer";
import SavedLabelPrintPage from "../../app/labels/print/page";
import fixture from "../../tests/fixtures/packing-quantity-regression.json";
const order = {
  orderId:"quantity-regression",status:"Active",archived:false,
  details:{orderNo:"2026-09-001",clientName:"Packing label validation",clientType:"School / Institution"},
  products:fixture.products.map(name=>({id:name,name,quantityMode:"per_person",defaultQuantity:0,orderTotal:0,quantityGroupRules:[],specifications:[]})),
  fields:[{id:"name",name:"Name",type:"text",options:[],required:false}],measurements:[],
  records:fixture.quantities.map((row,index)=>({recordId:`person-${index}`,personId:`P-${index}`,values:Object.fromEntries([["field:name",`Person ${index+1}`],...fixture.products.map((id,i)=>[`product:${id}:qty`,row[i]])])})),revisions:[],updatedAt:""
};
window.print=()=>{(window as any).printCalls=((window as any).printCalls||0)+1;};
localStorage.setItem("jinam:seiko:orders-v1", JSON.stringify([order]));
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("task") ? <SavedLabelPrintPage/> : <div className="businessAppShell"><main className="businessAppMain"><PackingPersonLabelDesigner businessId="seiko" order={order as any} canManageSizes={false}/></main></div>);
