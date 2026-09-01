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
  assert.match(home, /clearFilters\(\);setFiltersOpen\(false\)/);
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
  assert.match(labels, /Package product \$\{slot\}/);
  assert.match(labels, /source === "person" && \(key === "product" \|\| exactProductField\)/);
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
