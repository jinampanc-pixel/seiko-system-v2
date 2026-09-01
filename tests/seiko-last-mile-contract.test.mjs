import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const orders = read("app/orders.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const labelDesigner = read("app/label-designer.tsx");
const orderCss = read("app/order-enhancements.css");

test("workspace compact numeric controls commit on Enter", () => {
  assert.match(orders, /aria-label="Number of rows to add"[\s\S]{0,500}event\.key==="Enter"[\s\S]{0,220}addRecords\(rowsToAdd\)/);
  assert.match(orders, /aria-label="Rows per page"[\s\S]{0,420}event\.key==="Enter"[\s\S]{0,180}commitPageSize\(\)/);
  assert.match(orderCss, /workspaceAddTools \.rowCountControl/);
});

test("spreadsheet row and column header selection paints the complete band", () => {
  assert.match(structure, /workspaceStructureSelected/);
  assert.match(structure, /workspaceStructureSelectedColumn/);
  assert.match(orders, /data-column-id=\{column\.id\}/);
  assert.match(orderCss, /tr\.workspaceStructureSelected>th/);
  assert.match(orderCss, /workspaceStructureSelectedColumn/);
  assert.match(orderCss, /workspaceRowHeaderCorner\{background:var\(--navy\)/);
});

test("Label Information contains only configured product fields and no synthetic applicable-product slots", () => {
  assert.doesNotMatch(labelDesigner, /Applicable product/);
  assert.doesNotMatch(labelDesigner, /packageSlots/);
  assert.match(labelDesigner, /product_name:\$\{product\.id\}/);
  assert.match(labelDesigner, /product_quantity:\$\{product\.id\}/);
  assert.match(labelDesigner, /filter\(item => !item\.field\?\.startsWith\("package_product:"\)\)/);
});

test("Label Information does not show redundant up/down arrow controls", () => {
  assert.doesNotMatch(labelDesigner, /fieldOrderControls/);
  assert.doesNotMatch(labelDesigner, />↑<\/button>/);
  assert.doesNotMatch(labelDesigner, />↓<\/button>/);
});

test("Order Setup returns to the page it was opened from", () => {
  assert.match(orders, /setView\(existingOrder \? setupReturnView : "workspace"\)/);
  assert.match(orders, /returnView === "workspace" \? "Update workspace" : "Save changes"/);
  assert.match(orders, /onCancel=\{\(\) => setView\(current\.revisions\.length \? setupReturnView : "center"\)\}/);
});
