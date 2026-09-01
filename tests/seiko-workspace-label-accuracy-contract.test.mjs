import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("app/seiko-phase1.tsx");
const orders = read("app/orders.tsx");
const domain = read("app/lib/order-domain.ts");
const shortcuts = read("app/workspace-shortcuts.tsx");
const labels = read("app/label-designer.tsx");

test("Home clear filters is always a working reset", () => {
  assert.match(home, /aria-label="Clear all order filters"/);
  assert.match(home, /clearFilters\(\);setFiltersOpen\(false\)/);
  assert.doesNotMatch(home, /disabled=\{!activeFilterCount\} onClick=\{clearFilters\}/);
});

test("workspace separates order actions from spreadsheet actions", () => {
  assert.match(orders, /workspaceSheetBar/);
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
  assert.match(labels, /Applicable product/);
  assert.match(labels, /source === "person" && \(key === "product" \|\| exactProductField\)/);
});
