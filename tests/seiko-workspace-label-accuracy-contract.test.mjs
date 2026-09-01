import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = path => existsSync(new URL(`../${path}`, import.meta.url));
const home = read("app/seiko-phase1.tsx");
const orders = read("app/orders.tsx");
const domain = read("app/lib/order-domain.ts");
const shortcuts = read("app/workspace-shortcuts.tsx");
const labels = read("app/label-designer.tsx");
const labelRefinement = read("app/label-workspace-refinement.tsx");
const orderCss = read("app/order-enhancements.css");

test("Home clear filters is always a working reset", () => {
  assert.match(home, /aria-label="Clear all order filters"/);
  assert.match(home, /const clearFilters=\(\)=>\{setQuery\(""\);setStatus\(""\);setClientType\(""\);setProduct\(""\);setPage\(1\);\};/);
  assert.match(home, /aria-label="Clear all order filters" onClick=\{clearFilters\}>Clear filters/);
  assert.doesNotMatch(home, /disabled=\{!activeFilterCount\} onClick=\{clearFilters\}/);
});

test("contextual Back navigation uses the locked shared style", () => {
  assert.match(home, /startsWith\("← Back"\)/);
  assert.match(home, /contextBackButton/);
  assert.match(orders, /workspaceBackButton contextBackButton/);
  assert.match(orderCss, /\.contextBackButton,\.workspaceBackButton/);
});

test("workspace separates order actions from spreadsheet actions", () => {
  assert.doesNotMatch(orders, /className="workspaceSheetBar"/);
  assert.match(orders, /workspaceCompactTools/);
  assert.match(orders, /data-sheet-action="undo"/);
  assert.match(orders, /data-sheet-action="redo"/);
  assert.doesNotMatch(orders, />Put order on hold<\/button>/);
  assert.doesNotMatch(orders, />Undo last change<\/button>/);
  assert.match(shortcuts, /data-sheet-action/);
});

test("workspace column widths and display preferences are persisted", () => {
  assert.match(domain, /columnWidths\?: Record<string, number>/);
  assert.match(domain, /hiddenColumns\?: string\[\]/);
  assert.match(domain, /columnAlignments\?: Record<string/);
  assert.match(orders, /columnResizeHandle/);
  assert.match(orders, /startColumnResize/);
  assert.match(orders, /persistWorkspace\(\{ columnWidths:/);
  assert.match(orders, /workspaceRowNumberCol/);
  assert.match(orderCss, /\.workspaceRowNumberCol\{width:44px!important\}/);
});

test("label Value filter is writable and fuzzy-searches resolved values", () => {
  assert.match(labels, /type="search" list="label-record-filter-values"/);
  assert.match(labels, /Type to filter values/);
  assert.match(labels, /\.toLowerCase\(\)\.includes\(filterNeedle\)/);
});

test("person package layouts use record-resolved applicable product slots", () => {
  assert.match(labels, /package_product:\$\{slot\}:name/);
  assert.match(labels, /package_product:\$\{slot\}:quantity/);
  assert.match(labels, /package_product:\$\{slot\}:details/);
  assert.match(labels, /labelQuantityForRecord/);
  assert.match(labels, /orderUsesProductEvidence/);
  assert.match(labels, /valuesWithNormalizedMeasurements/);
  assert.match(labels, /normalizedMeasurementValues\(order, candidate\.values\)/);
  assert.doesNotMatch(labels, /Use <b>Applicable product<\/b> slots/);
  assert.match(labels, /Applicable product \$\{slot\}/);
  assert.doesNotMatch(labels, /source === "person" && \(key === "product" \|\| exactProductField\)/);
  assert.match(labels, /specificProductValues/);
  assert.match(labels, /product_name:\$\{productId\}/);
  assert.match(labels, /product_quantity:\$\{productId\}/);
});

test("workspace row and column headers expose state-backed context actions", () => {
  const structure = read("app/workspace-structure-interactions.tsx");
  assert.match(structure, /contextmenu/);
  assert.match(structure, /seiko:workspace-row-command/);
  assert.match(structure, /seiko:workspace-column-command/);
  assert.match(orders, /seiko:workspace-row-command/);
  assert.match(orders, /seiko:workspace-column-command/);
});

test("label measurement normalization never borrows another product value", () => {
  assert.doesNotMatch(labels, /candidates\[0\]/);
  assert.match(labels, /targets\.length === 1/);
  assert.match(labels, /packageBaseValues\(first\.values\)/);
  assert.doesNotMatch(labels, /Object\.assign\(\{\}, \.\.\.packageItems\.map/);
});

test("packing preview keeps only relevant fields and uses concise record identity", () => {
  assert.match(labels, /allowed = new Set\(fieldOptions\.map/);
  assert.match(labels, /sourceMode === "person" && record\.values\.group/);
  assert.doesNotMatch(labels, /record\.name\}\{record\.product \?/);
});

test("label canvas is directly editable without an Arrange or Finish arranging mode", () => {
  assert.doesNotMatch(labelRefinement, /addArrangeControl/);
  assert.doesNotMatch(labelRefinement, /Finish arranging|Arrange label/);
  assert.doesNotMatch(labels, /Automatic layout|Manual layout/);
  assert.match(labels, /if \(!advanced\) \{ setItems\(arranged\); setAdvanced\(true\); \}/);
  assert.match(labels, /const down = \(e: ReactPointerEvent, item: Item\)/);
});

test("temporary in-chat patch machinery is absent from the accepted branch", () => {
  assert.equal(exists(".github/scripts/finalize-seiko-label-acceptance.py"), false);
  assert.equal(exists(".github/scripts/fix-seiko-sept1-runtime.py"), false);
  assert.equal(exists(".github/workflows/finalize-seiko-label-acceptance.yml"), false);
  assert.equal(exists(".github/workflows/fix-label-direct-edit-and-applicability.yml"), false);
  assert.equal(exists(".github/workflows/run-seiko-sept1-runtime.yml"), false);
});

test("native workspace headers do not get a duplicate legacy row-number column", () => {
  const rowActions = read("app/workspace-row-actions.tsx");
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(rowActions, /workspaceRowHeaderHead,\.workspaceRowHeaderCell/);
  assert.match(rowActions, /page\.querySelector\("\.workspaceBulkBar"\)\?\.remove\(\)/);
});

test("workspace transient tools and context menus dismiss outside their interaction", () => {
  const structure = read("app/workspace-structure-interactions.tsx");
  assert.match(shortcuts, /workspaceCompactTools\[open\]/);
  assert.match(shortcuts, /document\.addEventListener\("pointerdown", closeTools, true\)/);
  assert.match(shortcuts, /document\.addEventListener\("scroll", closeTools, true\)/);
  assert.match(structure, /document\.addEventListener\("pointerdown",outside,true\)/);
  assert.match(structure, /document\.addEventListener\("scroll",closeTransient,true\)/);
});

test("returning to Order Center and Clear all cannot retain invisible filters", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  assert.match(orders, /setQuery\(""\); setArchivedOnly\(false\); save\(current, "Order saved", true\)/);
  assert.match(listCenter, /resetFilterState\(\)/);
  assert.match(listCenter, /setNativeInputValue\(nativeSearch, ""\)/);
  assert.match(listCenter, /if \(archivedNative\?\.checked\) archivedNative\.click\(\)/);
});

test("Label Center uses clickable rows and floating secondary menus", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  const listCss = read("app/seiko-list-center-enhancements.css");
  assert.match(listCenter, /labelBatchRowClickable/);
  assert.match(listCenter, /open\.hidden = true/);
  assert.doesNotMatch(listCenter, /openAction\.textContent = "Open label set"/);
  assert.match(listCenter, /labelCenterFloatingPanel/);
  assert.match(listCss, /position:fixed!important;z-index:1200!important/);
});

test("group/default quantities cannot bypass record-level product applicability", () => {
  const start = labels.indexOf("function labelQuantityForRecord");
  const end = labels.indexOf("function orderLabelRows", start);
  const resolver = labels.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(resolver, /orderUsesProductEvidence/);
  assert.match(resolver, /evidenceColumns\.some\(column => hasLabelValue\(recordValues\[column\.id\]\)\) \? quantity : 0/);
  assert.doesNotMatch(resolver, /quantityMode === "by_group"[\s\S]{0,240}return quantity/);
});



test("Order Setup return path and label workspace header are source-owned", () => {
  const listCenter = read("app/seiko-list-center-enhancements.tsx");
  const create = read("app/labels/create/page.tsx");
  assert.match(orders, /setupReturnView/);
  assert.match(listCenter, /order-setup-origin/);
  assert.match(orders, /returnView === "workspace" \? "← Back to Workspace" : "← Back to Orders"/);
  assert.match(orders, /<Field label="Order date" type="date"/);
  assert.doesNotMatch(orders, /className="orderDateEditor"/);
  assert.match(create, /backLabel="← Back to label setup"/);
  assert.match(labels, /labelWorkspaceBackRow/);
  assert.match(labels, /className="labelHeaderMenuButton"/);
  assert.match(labels, /labelHeaderMenuPrimary/);
  assert.doesNotMatch(labels, /className="primary labelHeaderSaveSet"/);
});

test("workspace add rows and expanded label information stay compact", () => {
  const finalCss = read("app/seiko-workspace-label-final.css");
  assert.match(orders, /rowCountLabel">Add rows/);
  assert.match(orders, /className="workspaceRowTotal"/);
  assert.match(finalCss, /grid-template-columns:auto 48px 52px/);
  assert.match(finalCss, /fieldChoice\.chosen\.fieldChoiceExpanded/);
  assert.match(finalCss, /grid-template-columns:minmax\(150px,1fr\) auto auto/);
});
