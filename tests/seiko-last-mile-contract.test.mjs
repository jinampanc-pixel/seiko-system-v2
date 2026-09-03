import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const orders = read("app/orders.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const labelDesigner = read("app/label-designer.tsx");
const labelInteractions = read("app/label-designer-interactions.tsx");
const labelFinalization = read("app/label-finalization.tsx");
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

test("workspace row selection clears when focus leaves row-selection controls", () => {
  assert.match(structure, /clearTransientRowSelection/);
  assert.match(structure, /workspaceRowHeader,.workspaceRowHeaderCorner,.workspaceContextMenu/);
  assert.match(structure, /document\.addEventListener\("pointerdown",outside,true\)/);
  assert.match(structure, /document\.addEventListener\("focusin",outside,true\)/);
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

test("normal text boxes fit their visible glyph bounds and drag to the physical right edge", () => {
  assert.match(labelInteractions, /fitSelectedTextBounds/);
  assert.match(labelInteractions, /selectNodeContents\(element\)/);
  assert.match(labelInteractions, /Width mm/);
  assert.match(labelInteractions, /Height mm/);
  assert.match(labelInteractions, /preset\.labelW - textDrag\.width/);
  assert.match(labelInteractions, /setReactInputValue/);
});

test("direct saved-set print waits for task hydration then clicks calibrated Print", () => {
  assert.match(labelInteractions, /open-task-direct-action/);
  assert.match(labelInteractions, /open-task/);
  assert.match(labelInteractions, /labelHeaderCommandBar > button\.primary/);
  assert.match(labelInteractions, /printButton\.click\(\)/);
});

test("normal Print reaches calibrated native preview directly without a popup", () => {
  assert.match(labelFinalization, /iframe\.labelNativePrintFrame/);
  assert.match(labelFinalization, /printWindow\.print\(\)/);
  assert.match(labelFinalization, /labelOnlyPrint\(1\)/);
  assert.doesNotMatch(labelFinalization, /window\.open\(/);
  assert.match(labelFinalization, /jinam:label-print-copies/);
});

test("Order Setup returns to the page it was opened from", () => {
  assert.match(orders, /setView\(existingOrder \? setupReturnView : "workspace"\)/);
  assert.match(orders, /returnView === "workspace" \? "Update workspace" : "Save changes"/);
  assert.match(orders, /onCancel=\{\(\) => setView\(current\.revisions\.length \? setupReturnView : "center"\)\}/);
});
