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
const rowActions = read("app/workspace-row-actions.tsx");
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

test("workspace row operations are deliberate and pagination has one state source", () => {
  assert.match(enhancements, /<WorkspaceRowActions \/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \/>/);
  assert.match(rowActions, /Shift-click selects a range/);
  assert.match(rowActions, /Delete selected/);
  assert.match(rowActions, /Add \$\{count\} rows\?/);
  assert.match(rowActions, /workspaceSelectHead/);
  assert.match(rowActions, /workspaceSelectCell/);
  assert.match(orders, /Undo last change/);
  assert.match(orders, /Redo last change/);
  assert.match(pager, /realPager/);
  assert.match(pager, /setRealPageSize/);
  assert.match(pager, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});

test("workspace menu keeps routine actions visible and More contains only secondary order actions", () => {
  assert.match(orders, /workspaceStatusControl/);
  assert.match(orders, /workspaceLabelsButton/);
  assert.doesNotMatch(orders, /workspaceLabelsSplit/);
  assert.match(orders, /workspaceQuickSave/);
  assert.match(orders, /aria-label="More order actions"/);
  assert.match(orders, />Labels<\/button>/);
  assert.doesNotMatch(orders, /className="orderMenuStatus"/);
  assert.doesNotMatch(orders, /className="orderMenuSectionLabel"/);
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

test("label creation stays simple by default while advanced placement remains precise", () => {
  assert.match(labelDesigner, /const \[advanced, setAdvanced\] = useState\(false\)/);
  assert.doesNotMatch(labelPolish, /toggle\.click\(\)/);
  assert.match(labelPolish, /toggle\.hidden = false/);
  assert.match(labelDesigner, /const step = event\.shiftKey \? 1 : \.25/);
  assert.match(labelDesigner, /ArrowLeft/);
  assert.match(labelDesigner, /ArrowRight/);
});

test("label information and preview follow the PDF acceptance model", () => {
  assert.match(labelDesigner, /Label represents/);
  assert.match(labelDesigner, /Each physical item/);
  assert.match(labelDesigner, /Custom selection/);
  assert.match(labelDesigner, /labelPreviewSample/);
  assert.match(labelDesigner, /Object\.values\(record\.values\)\.join/);
  assert.doesNotMatch(labelDesigner, /customerUpdateChoice/);
  assert.match(labelPolish, /Layout Library/);
  assert.match(labelPolish, /labelSetSave/);
  assert.doesNotMatch(labelProductionReady, /\["style","Style"\]/);
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

test("label printing supports explicit copies and avoids blocking popup alerts", () => {
  assert.match(labelFinalization, /labelPrintCopies/);
  assert.match(labelFinalization, /Copies/);
  assert.match(labelFinalization, /flatMap\(label => Array\.from\(\{ length: copies \}/);
  assert.doesNotMatch(labelFinalization, /window\.alert\(/);
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
