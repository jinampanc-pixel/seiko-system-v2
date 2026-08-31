import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const orders = read("app/orders.tsx");
const setupPolish = read("app/order-setup-polish.tsx");
const setupFinalize = read("app/order-setup-finalize.tsx");
const labelDesigner = read("app/label-designer.tsx");
const labelPolish = read("app/label-designer-polish.tsx");
const labelFinalization = read("app/label-finalization.tsx");
const enhancements = read("app/app-enhancements.tsx");
const layout = read("app/layout.tsx");
const pager = read("app/workspace-top-pager.tsx");
const rowMenu = read("app/workspace-row-menu.tsx");
const shortcuts = read("app/workspace-shortcuts.tsx");
const home = read("app/seiko-phase1.tsx");
const homeCss = read("app/seiko-phase1.css");
const erpSync = read("app/erp-order-sync.tsx");
const erpNotice = read("app/erp-sync-notice.tsx");
const finalUx = read("app/seiko-workspace-label-final.css");
const orderDomain = read("app/lib/order-domain.ts");
const ownerDropdown = read("app/owner-dropdown-ux.tsx");
const labelProductionReady = read("app/label-production-ready.tsx");

test("Person IDs remain stable after row deletion and new IDs never reuse a deleted sequence", () => {
  assert.doesNotMatch(orders, /renumberRecords/);
  assert.match(orders, /Math\.max\(0, \.\.\.order\.records\.map\(record => Number\(record\.personId\.match/);
  assert.match(orders, /commitRecords\(order\.records\.filter\(item => item\.recordId !== record\.recordId\)\)/);
});

test("group quantity UI and domain both use default quantity plus exceptions", () => {
  assert.match(orderDomain, /return Math\.max\(0, Number\(product\.defaultQuantity\) \|\| 0\)/);
  assert.match(orderDomain, /split\(\/\[;,\\n\]\//);
  assert.match(orders, /min="0" placeholder="Quantity" value=\{rule\.quantity \?\? ""\}/);
  assert.match(orders, /quantity 0 means that group does not receive this product/);
  assert.doesNotMatch(setupPolish, /quantitySelect\.value === "by_group" \|\| quantitySelect\.value === "per_person"/);
  assert.match(setupFinalize, /Set the normal quantity once, then add only the groups that differ/);
});

test("Home is a configurable interactive dashboard plus configurable quick access", () => {
  assert.match(home, /HOME_KEY = "jinam:seiko:home-config-v2"/);
  assert.match(home, /Customize dashboard/);
  assert.match(home, /showActiveOrders/);
  assert.match(home, /activeOrderPageSize/);
  assert.match(home, /Filter active orders/);
  assert.match(home, /All client types/);
  assert.match(home, /All products/);
  assert.match(home, /quickAccess/);
  assert.match(home, /openSeikoModule\(metric\.module\)/);
  assert.match(home, /seikoDashboardActivityRow/);
  assert.match(homeCss, /\.seikoDashboardMetrics/);
  assert.match(homeCss, /\.overview>\.moduleGrid::before\{content:"Quick access"/);
});

test("workspace row operations are deliberate and pagination has one state source", () => {
  assert.match(enhancements, /<WorkspaceRowMenu \/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \/>/);
  assert.match(rowMenu, /workspaceRowMenuTrigger/);
  assert.match(rowMenu, /Row actions/);
  assert.match(rowMenu, /Put on hold/);
  assert.match(rowMenu, /Delete row/);
  assert.match(rowMenu, /role", "menuitem"/);
  assert.match(rowMenu, /event\.key === "Escape"/);
  assert.match(rowMenu, /pointerdown/);
  assert.match(orders, /Undo last change/);
  assert.match(orders, /Redo last change/);
  assert.match(pager, /realPager/);
  assert.match(pager, /setRealPageSize/);
  assert.match(pager, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});

test("workspace keeps primary Save visible and routes secondary Labels through More", () => {
  assert.match(orders, /workspaceStatusControl/);
  assert.doesNotMatch(orders, /workspaceLabelsButton/);
  assert.match(orders, /workspaceQuickSave/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(orders, /onOpenLabelBatches\(\);}}>Labels<\/button>/);
  assert.match(shortcuts, /key === "s"/);
  assert.match(shortcuts, /clickMenuAction\(page, "Save & close"\)/);
  assert.match(shortcuts, /clickMenuAction\(page, "Labels"\)/);
  assert.match(shortcuts, /key === "f"/);
  assert.match(shortcuts, /key === "x"/);
  assert.match(shortcuts, /event\.key === "F2"/);
});

test("editing an existing order returns to and updates its workspace", () => {
  assert.match(orders, /setView\(current\.revisions\.length \? "workspace" : "center"\)/);
  assert.match(orders, /order\.revisions\.length \? "Update workspace" : "Create workspace"/);
});

test("PDF acceptance keeps archive, setup policy controls and group rules explicit", () => {
  assert.match(orders, /Archived orders/);
  assert.match(orders, /orderArchiveButton/);
  assert.match(setupFinalize, /Group values or range, e.g. 1-7/);
  assert.match(orderDomain, /range = value\.match/);
  assert.doesNotMatch(ownerDropdown, /enhanceEditableSelect/);
});

test("label creation stays automatic by default while manual placement remains precise", () => {
  assert.match(labelDesigner, /const \[advanced, setAdvanced\] = useState\(false\)/);
  assert.match(labelDesigner, /Manual layout/);
  assert.match(labelDesigner, /Automatic layout/);
  assert.match(labelDesigner, /const step = event\.shiftKey \? 1 : \.25/);
  assert.match(labelDesigner, /ArrowLeft/);
  assert.match(labelDesigner, /ArrowRight/);
  assert.match(labelDesigner, /setItems\(arrangeLabelItems\(items, preset\)\)/);
});

test("shared Label Workspace owns information state and purpose only controls relevance", () => {
  assert.match(labelDesigner, /labelInfoSelectedStripReact/);
  assert.match(labelDesigner, /onClick=\{\(\) => toggleField\(item\.field \|\| "", label\)\}/);
  assert.match(labelDesigner, /if \(selectedId === existing\.id\) setSelectedId\(""\)/);
  assert.match(labelDesigner, /fieldRelevantForPurpose/);
  assert.match(labelDesigner, /purpose === "packing"/);
  assert.match(labelDesigner, /purpose === "production"/);
  assert.match(labelDesigner, /purpose === "inventory"/);
  assert.match(labelDesigner, /if \(key === "group"\) return false/);
  assert.match(labelDesigner, /product_name:\$\{product\.id\}/);
  assert.match(labelDesigner, /product_quantity:\$\{product\.id\}/);
  assert.doesNotMatch(labelPolish, /selectedFieldChipRemove/);
});

test("label information and preview follow the accepted order-derived model", () => {
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /Each physical item/);
  assert.match(labelDesigner, /Custom selection/);
  assert.match(labelDesigner, /labelPreviewSample/);
  assert.match(labelDesigner, /Object\.values\(record\.values\)\.join/);
  assert.doesNotMatch(labelDesigner, /customerUpdateChoice/);
  assert.match(labelDesigner, /labelWorkspaceMoreMenu/);
  assert.match(labelDesigner, /Saved layouts/);
  assert.match(labelDesigner, /Saved label sets/);
  assert.match(labelDesigner, /labelSetSave/);
  assert.doesNotMatch(labelProductionReady, /\["style","Style"\]/);
  assert.match(labelDesigner, /recordFilterBar/);
  assert.match(labelDesigner, /recordFilterField/);
  assert.match(labelDesigner, /recordSort/);
  assert.match(labelDesigner, /withTracePositions/);
  assert.match(labelDesigner, /trace_order_position/);
  assert.match(labelDesigner, /trace_person_position/);
  assert.match(labelDesigner, /trace_product_position/);
  assert.match(labelDesigner, /trace_field:/);
  assert.match(labelDesigner, /Show of total/);
});

test("label elements can be reordered, replaced, moved and resized in the shared editor", () => {
  assert.match(labelDesigner, /moveFieldItem/);
  assert.match(labelDesigner, /Move \$\{option\.label\} up/);
  assert.match(labelDesigner, /Move \$\{option\.label\} down/);
  assert.match(labelDesigner, /<span>Information<\/span><select value=\{selected\.field/);
  assert.match(labelDesigner, /<span>X mm<\/span>/);
  assert.match(labelDesigner, /<span>Y mm<\/span>/);
  assert.match(labelDesigner, /<span>Width mm<\/span>/);
  assert.match(labelDesigner, /<span>Height mm<\/span>/);
  assert.match(labelDesigner, /const arranged = advanced \? items : arrangeLabelItems\(items, preset\)/);
  assert.match(labelDesigner, /data-record-preview=/);
  assert.match(finalUx, /record:hover::after/);
});

test("label wheel resizing uses deterministic fine physical steps and touch has explicit size buttons", () => {
  assert.match(labelDesigner, /const resizeElement = useCallback/);
  assert.match(labelDesigner, /const step = coarse \? 1 : \.25/);
  assert.match(labelDesigner, /const threshold = 72/);
  assert.match(labelDesigner, /event\.deltaMode === 1/);
  assert.match(labelDesigner, /data-font-pt=/);
  assert.match(labelDesigner, /data-size-readout=/);
  assert.match(labelDesigner, /labelPrecisionControls/);
  assert.match(labelDesigner, /− Shrink/);
  assert.match(labelDesigner, /Stretch \+/);
  assert.match(finalUx, /@media\(pointer:coarse\)/);
  assert.match(finalUx, /\.labelPrecisionControls\{display:grid\}/);
});

test("label preview uses real point-to-mm typography and a physical 1 mm grid", () => {
  assert.match(labelFinalization, /const MM_PER_PT = 25\.4 \/ 72/);
  assert.match(labelFinalization, /actualPxPerMm = rect\.width \/ labelWidthMm/);
  assert.match(labelFinalization, /--label-mm-px/);
  assert.match(labelFinalization, /pointSize \* MM_PER_PT \* actualPxPerMm/);
  assert.match(labelFinalization, /logicalFont \* MM_PER_PT/);
  assert.doesNotMatch(labelFinalization, /DESIGN_PX_PER_MM/);
  assert.match(finalUx, /var\(--label-mm-px,8px\)/);
  assert.match(finalUx, /max-width:960px/);
});

test("label copies are requested after Print instead of occupying the header", () => {
  assert.match(labelFinalization, /function askPrintCopies/);
  assert.match(labelFinalization, /labelPrintCopiesDialog/);
  assert.match(labelFinalization, /function labelOnlyPrint\(copies = 1\)/);
  assert.match(labelFinalization, /askPrintCopies\(selected, copies => labelOnlyPrint\(copies\)\)/);
  assert.match(labelFinalization, /flatMap\(label => Array\.from\(\{ length: copies \}/);
  assert.doesNotMatch(labelFinalization, /function syncPrintCopies/);
  assert.doesNotMatch(labelFinalization, /window\.alert\(/);
  assert.match(finalUx, /\.labelPrintCopies\{display:none!important\}/);
});

test("shared-order version conflicts preserve recovery data and stop automatic resubmission", () => {
  assert.match(erpSync, /erp-conflict-active/);
  assert.match(erpSync, /hasActiveConflict/);
  assert.match(erpSync, /if \(hasActiveConflict\(activeBusiness, localOrder\.orderId\)\) continue/);
  assert.match(erpSync, /localStorage\.setItem\(recoveryKey/);
  assert.match(enhancements, /<ErpSyncNotice \/>/);
  assert.match(erpNotice, /Reload latest shared version/);
  assert.match(erpNotice, /recovery copy/);
});

test("the restored Stage 1 label stack remains mounted and final styling stays additive", () => {
  for (const component of ["LabelFlowPolish", "LabelDesignerPolish", "LabelProductionReady", "LabelFinalization", "LabelDesignerInteractions"]) {
    assert.match(enhancements, new RegExp(`<${component} \\/>`));
  }
  assert.doesNotMatch(enhancements, /LabelV2Accessibility/);
  assert.match(layout, /seiko-stage2-safe\.css/);
  assert.match(layout, /seiko-workspace-label-final\.css/);
  assert.doesNotMatch(layout, /seiko-operational-v2\.css/);
  assert.doesNotMatch(layout, /seiko-stage2-repair\.css/);
});

test("label workspace exposes direct representation, custom components, layout meaning and calibrated size management", () => {
  const createRoute = read("app/labels/create/page.tsx");
  const polish = read("app/label-designer-polish.tsx");
  assert.doesNotMatch(createRoute, /DesignerSourceLock/);
  assert.match(createRoute, /initialSourceMode=\{selectedRepresentation\.sourceMode\}/);
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /labelCustomComponents/);
  for (const component of ["Information field", "Free text", "QR code", "Barcode", "Sequence"]) assert.match(labelDesigner, new RegExp(component));
  assert.match(labelDesigner, /editingSizeId/);
  assert.match(labelDesigner, /Copy & edit/);
  assert.match(labelDesigner, /requiredRoll/);
  assert.match(labelDesigner, /fieldRelevantForPurpose/);
  assert.match(polish, /labelSaveMeaning/);
  assert.match(polish, /Layout.*reusable physical design/);
  assert.match(polish, /labelInfoSearchToggle/);
});
