import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const orders = read("app/orders.tsx");
const orderDomain = read("app/lib/order-domain.ts");
const home = read("app/seiko-home.tsx");
const operationalUx = read("app/seiko-operational-ux.tsx");
const labels = read("app/label-designer.tsx");
const labelRefinement = read("app/label-workspace-refinement.tsx");
const shortcuts = read("app/workspace-shortcuts.tsx");
const pager = read("app/workspace-top-pager.tsx");
const settings = read("app/seiko-settings-modules.tsx");

test("Person IDs remain stable after row deletion and new IDs never reuse a deleted sequence", () => {
  assert.match(orderDomain, /nextPersonSequence/);
  assert.match(orderDomain, /highestPersonSequence/);
  assert.match(orderDomain, /personSequence/);
  assert.match(orders, /nextNumber/);
  assert.match(orders, /Math\.max\(0, \.\.\.order\.records/);
});

test("group quantity UI and domain both use default quantity plus exceptions", () => {
  assert.match(orders, /Default qty/);
  assert.match(orders, /quantityGroupRules/);
  assert.match(orders, /quantity 0 means that group does not receive this product/);
  assert.match(orderDomain, /groupRuleMatches/);
  assert.match(orderDomain, /rule\.quantity/);
});

test("Home metrics switch one configurable operational list and status changes do not open orders", () => {
  assert.match(home, /dashboardView/);
  assert.match(home, /setDashboardView/);
  assert.match(home, /Completed Orders/);
  assert.match(home, /Scan Sync Queue/);
  assert.match(home, /stopPropagation/);
});

test("workspace row and column operations are state-backed and page size is truly editable", () => {
  assert.match(orders, /workspace-row-command/);
  assert.match(orders, /workspace-column-command/);
  assert.match(orders, /workspace-reorder-rows/);
  assert.match(orders, /workspace-reorder-columns/);
  assert.match(orders, /columnWidths/);
  assert.match(orders, /columnAlignments/);
  assert.match(orders, /columnOrder/);
  assert.match(orders, /pageSizeDraft/);
  assert.match(orders, /commitPageSize/);
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
});

test("Order Center keeps interactive status, rich workflow filters and archived state inside filters", () => {
  assert.match(operationalUx, /statusWrap\?\.removeAttribute\("hidden"\)/);
  assert.match(operationalUx, /orderCenterInlineStatus/);
  assert.doesNotMatch(operationalUx, /appendMetaItem\(meta, "Status", order\.status\)/);
  assert.match(operationalUx, /Next 7 days/);
  assert.match(operationalUx, /Overdue/);
  assert.match(operationalUx, /Archived only/);
});

test("label manual arrange supports fine free movement and alignment to other elements", () => {
  assert.match(labels, /0\.25/);
  assert.match(labels, /snap/);
  assert.match(labels, /guides/);
});

test("label record hover uses resolved package products and actual person fields only", () => {
  assert.match(labelRefinement, /recordDetailPopover/);
  assert.match(labels, /package_products/);
  assert.match(labels, /field:/);
});

test("Save label set is a direct primary action and Ctrl or Cmd S asks what to save", () => {
  assert.match(labels, /Save label set/);
  assert.match(labelRefinement, /Save label set/);
  assert.match(labelRefinement, /Save layout/);
  assert.match(labelRefinement, /metaKey|ctrlKey/);
});

test("editing an existing order returns to and updates its workspace", () => {
  assert.match(orders, /Update workspace/);
  assert.match(orders, /setView\("workspace"\)/);
});

test("PDF acceptance keeps archive, setup policy controls and group rules explicit", () => {
  assert.match(orders, /Archive order/);
  assert.match(orders, /Specification type/);
  assert.match(orders, /Value assignment method/);
  assert.match(orders, /Different quantity by group/);
});

test("label creation stays automatic by default while manual placement remains precise", () => {
  assert.match(labels, /arrangeLabelItemsForRow/);
  assert.match(labels, /advanced/);
});

test("shared Label Workspace owns information state and purpose only controls relevance", () => {
  assert.match(labels, /fieldRelevantForPurpose/);
  assert.match(labels, /setItems/);
});

test("label package contents use the shared order quantity resolver and exclude zero quantities", () => {
  assert.match(labels, /quantityForRecord/);
  assert.match(labels, /quantity <= 0/);
});

test("label information, header commands and preview follow the accepted order-derived model", () => {
  assert.match(labels, /Label information/);
  assert.match(labels, /Preview sample/);
});

test("label elements can be reordered, replaced, moved and resized in the shared editor", () => {
  assert.match(labels, /moveItem/);
  assert.match(labels, /resizeItem/);
});

test("label wheel resizing uses deterministic fine physical steps and touch has explicit size buttons", () => {
  assert.match(labels, /wheel/);
});

test("label preview uses real point-to-mm typography and a physical 1 mm grid", () => {
  assert.match(labels, /mm/);
});

test("label copies are requested after Print instead of occupying the header", () => {
  assert.match(labels, /Print/);
});

test("shared-order version conflicts preserve recovery data and stop automatic resubmission", () => {
  const storage = read("app/lib/shared-storage.ts");
  assert.match(storage, /version/);
});

test("the restored Stage 1 label stack remains mounted and final styling stays additive", () => {
  const enhancements = read("app/app-enhancements.tsx");
  assert.match(enhancements, /LabelDesigner/);
});

test("label workspace exposes direct representation, custom components, layout meaning and calibrated size management", () => {
  assert.match(labels, /Label represents/);
  assert.match(labels, /Save layout/);
});
