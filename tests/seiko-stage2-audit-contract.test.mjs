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
const erpSync = read("app/erp-order-sync.tsx");
const erpNotice = read("app/erp-sync-notice.tsx");
const finalUx = read("app/seiko-workspace-label-final.css");
const orderDomain = read("app/lib/order-domain.ts");
const ownerDropdown = read("app/owner-dropdown-ux.tsx");
const labelProductionReady = read("app/label-production-ready.tsx");
const operationalUx = read("app/seiko-operational-ux.tsx");
const listCenter = read("app/seiko-list-center-enhancements.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const refinement = read("app/label-workspace-refinement.tsx");

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

test("Home metrics switch one configurable operational list and status changes do not open orders", () => {
  assert.match(home, /HOME_KEY = "jinam:seiko:home-config-v3"/);
  assert.match(home, /Customize dashboard/);
  assert.match(home, /showActiveOrders/);
  assert.match(home, /activeOrderPageSize/);
  assert.match(home, /workMode/);
  assert.match(home, /setWorkMode\(metric\.key\)/);
  assert.match(home, /changeStatus/);
  assert.match(home, /homeOrderStatus/);
  assert.match(home, /homeOrderOpen/);
  assert.match(home, /SCAN SYNC QUEUE/);
  assert.match(home, /setInterval\(load,3000\)/);
  assert.match(home, /All client types/);
  assert.match(home, /All products/);
  assert.match(home, /Clear filters/);
  assert.match(home, /quickAccess/);
  assert.doesNotMatch(home, /PERSON \/ RECORD ENTRIES/);
  assert.doesNotMatch(home, /quickAccess: \{ Orders:/);
  assert.match(orderDomain, /ORDER_STATUSES/);
  for (const status of ["Production", "QC 1", "Packing", "QC 2"]) assert.match(orderDomain, new RegExp(status));
});

test("workspace row and column operations are state-backed and page size is truly editable", () => {
  assert.match(enhancements, /<WorkspaceRowMenu \/>/);
  assert.match(enhancements, /<WorkspaceStructureInteractions \/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \/>/);
  assert.match(rowMenu, /workspaceRowMenuTrigger/);
  assert.match(rowMenu, /Put on hold/);
  assert.match(rowMenu, /Delete row/);
  assert.match(orders, /data-sheet-action="undo"/);
  assert.match(orders, /data-sheet-action="redo"/);
  assert.match(orders, /seiko:workspace-reorder-rows/);
  assert.match(orders, /seiko:workspace-reorder-columns/);
  assert.match(orderDomain, /columnOrder/);
  assert.match(structure, /workspaceRowHeader/);
  assert.match(structure, /workspaceMovableColumnHeader/);
  assert.match(structure, /event\.shiftKey/);
  assert.match(structure, /event\.ctrlKey\s*\|\|\s*event\.metaKey/);
  assert.match(structure, /draggable=true/);
  assert.match(structure, /workspaceStructureSelectedColumn/);
  assert.match(orders, /data-column-id=\{column\.id\}/);
  assert.match(orders, /event\.key==="Enter"/);
  assert.match(orders, /aria-label="Rows per page"/);
  assert.match(orders, /pageSizeDraft/);
  assert.match(pager, /setInputValue/);
  assert.match(pager, /FocusEvent\("focusout"/);
  assert.doesNotMatch(pager, /setRealPageSize/);
});

test("workspace menu owns order status, save and secondary order actions", () => {
  assert.match(orders, /workspaceNativeMenuStatus/);
  assert.match(orders, /workspaceMenuSaveNow/);
  assert.doesNotMatch(orders, />Put order on hold<\/button>/);
  assert.match(orders, /Archive order/);
  assert.match(orders, /Delete order/);
  assert.match(orders, /ORDER_STATUSES\.map/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(orders, /workspaceBackButton/);
  assert.doesNotMatch(orders, /className="workspaceSheetBar"/);
  assert.match(orders, /workspaceCompactTools/);
  assert.match(orders, /columnResizeHandle/);
  assert.match(orders, /data-sheet-action="undo"/);
  assert.doesNotMatch(orders, />Undo last change<\/button>/);
  assert.doesNotMatch(orders, />Redo last change<\/button>/);
  assert.doesNotMatch(orders, /setLabelMenuOpen/);
  assert.match(shortcuts, /key === "s"/);
  assert.match(shortcuts, /clickMenuAction\(page, "Save & close"\)/);
  assert.match(shortcuts, /clickMenuAction\(page, "Labels"\)/);
  assert.match(shortcuts, /key === "f"/);
  assert.match(shortcuts, /key === "x"/);
  assert.match(shortcuts, /event\.key === "F2"/);
  assert.doesNotMatch(operationalUx, /className = "workspaceMenuOperational"/);
});

test("Order Center keeps status in the contextual menu, rich workflow filters and archived state inside filters", () => {
  assert.match(operationalUx, /statusWrap\?\.setAttribute\("hidden", ""\)/);
  assert.match(operationalUx, /orderMenuStatusControl/);
  assert.match(operationalUx, /const select = nativeStatus\.cloneNode\(true\) as HTMLSelectElement/);
  assert.match(operationalUx, /setNativeSelect\(nativeStatus, select\.value\)/);
  assert.doesNotMatch(operationalUx, /appendMetaItem\(meta, "Status", order\.status\)/);
  assert.match(operationalUx, /orderProductSummary/);
  assert.match(operationalUx, /quantityForRecord/);
  assert.match(operationalUx, /resolvedSpecification/);
  assert.match(operationalUx, /orderProductHoverCard/);
  assert.match(listCenter, /ORDER_STATUSES/);
  assert.match(listCenter, /Archived only/);
  assert.match(listCenter, /orderArchivedNativeHidden/);
});

test("label manual arrange supports fine free movement and alignment to other elements", () => {
  assert.match(labelDesigner, /Math\.round\(x \* 4\) \/ 4/);
  assert.match(labelDesigner, /Math\.round\(y \* 4\) \/ 4/);
  assert.match(labelDesigner, /e\.shiftKey/);
  assert.match(labelDesigner, /e\.altKey/);
  assert.match(labelDesigner, /other\.x \+ other\.w \/ 2/);
  assert.match(labelDesigner, /other\.y \+ other\.h \/ 2/);
  assert.match(labelDesigner, /bestX < \.36/);
  assert.match(labelDesigner, /bestY < \.36/);
});

test("label record hover uses resolved package products and actual person fields only", () => {
  assert.match(labelDesigner, /Products: \${record\.values\.product_summary}/);
  assert.match(labelDesigner, /key\.startsWith\("field:"\)/);
  assert.match(labelDesigner, /field_name:\${key}/);
  assert.doesNotMatch(labelDesigner, /\[record\.name, record\.group, sourceMode === "person"/);
});

test("Save label set is a direct primary action and Ctrl or Cmd S asks what to save", () => {
  assert.match(labelDesigner, /labelHeaderSaveSet/);
  assert.match(labelDesigner, /Save label set/);
  assert.match(refinement, /openLabelSaveChoice/);
  assert.match(refinement, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(refinement, /Save label set/);
  assert.match(refinement, /Save layout/);
  assert.match(refinement, /labelHeaderSaveSet/);
  assert.match(refinement, /labelHeaderMore/);
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

test("label creation stays automatic by default while direct placement remains precise", () => {
  assert.match(labelDesigner, /const \[advanced, setAdvanced\] = useState\(false\)/);
  assert.doesNotMatch(labelDesigner, /Manual layout|Automatic layout/);
  assert.match(labelDesigner, /const step = event\.shiftKey \? 1 : \.25/);
  assert.match(labelDesigner, /ArrowLeft/);
  assert.match(labelDesigner, /ArrowRight/);
  assert.match(labelDesigner, /if \(!advanced\) \{ setItems\(arranged\); setAdvanced\(true\); \}/);
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

test("Label Information exposes only configured order/workspace product fields", () => {
  assert.doesNotMatch(labelDesigner, /Applicable product/);
  assert.doesNotMatch(labelDesigner, /packageSlots/);
  assert.match(labelDesigner, /product_name:\$\{product\.id\}/);
  assert.match(labelDesigner, /product_quantity:\$\{product\.id\}/);
  assert.match(labelDesigner, /filter\(item => !item\.field\?\.startsWith\("package_product:"\)\)/);
});

test("label package contents use the shared order quantity resolver and exclude zero quantities", () => {
  assert.match(labelDesigner, /labelQuantityForRecord/);
  assert.match(labelDesigner, /quantityForRecord\(product, record, recordIndex === 0\)/);
  assert.match(labelDesigner, /orderUsesProductEvidence/);
  assert.match(labelDesigner, /groupRuleMatches\(rule\.match, groupValue\)/);
  assert.match(labelDesigner, /\(Number\(row\.qty\) \|\| 0\) <= 0/);
  assert.match(labelDesigner, /package_products: JSON\.stringify\(packageProductNames\)/);
  assert.match(labelDesigner, /contains_product/);
  assert.match(labelDesigner, /Products with a resolved quantity of 0 are excluded/);
});

test("label information, header commands and preview follow the accepted order-derived model", () => {
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /Each physical item/);
  assert.match(labelDesigner, /Custom selection/);
  assert.match(labelDesigner, /labelPreviewSample/);
  assert.match(labelDesigner, /recordPreviewText\(record, sourceMode\)/);
  assert.doesNotMatch(labelDesigner, /customerUpdateChoice/);
  assert.match(labelDesigner, /labelHeaderCommandBar/);
  assert.match(labelDesigner, /labelHeaderMoreMenu/);
  assert.match(labelDesigner, /Saved layouts/);
  assert.match(labelDesigner, /Saved label sets/);
  assert.match(labelDesigner, />Print<\/button>/);
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

test("label elements can be replaced, moved and resized without redundant arrow controls", () => {
  assert.doesNotMatch(labelDesigner, /fieldOrderControls/);
  assert.doesNotMatch(labelDesigner, />↑<\/button>/);
  assert.doesNotMatch(labelDesigner, />↓<\/button>/);
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
});
