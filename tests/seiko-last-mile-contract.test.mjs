import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const orders = read("app/orders.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const operationalUx = read("app/seiko-operational-ux.tsx");
const labelDesigner = read("app/label-designer.tsx");
const labelInteractions = read("app/label-designer-interactions.tsx");
const labelFinalization = read("app/label-finalization.tsx");
const savedLabelPrintPage = read("app/labels/print/page.tsx");
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

test("workspace row drag/drop accepts the whole row and delete uses an in-app confirmation", () => {
  assert.match(structure, /row\.addEventListener\("dragover",dragover\)/);
  assert.match(structure, /row\.addEventListener\("drop",drop\)/);
  assert.match(structure, /application\/x-seiko-rows/);
  assert.match(structure, /confirmDelete/);
  assert.match(structure, /seikoConfirmLayer/);
  assert.match(structure, /void deleteRows\(ids\)/);
  assert.doesNotMatch(structure, /window\.confirm|\bconfirm\(`/);
});

test("order product hover popout closes deterministically and cannot leak into Workspace", () => {
  assert.match(operationalUx, /scheduleProductHoverClose/);
  assert.match(operationalUx, /productHoverCloseTimer/);
  assert.match(operationalUx, /enhanceWorkspace[\s\S]{0,240}removeProductHover\(\)/);
  assert.match(operationalUx, /document\.addEventListener\("pointerdown", outside, true\)/);
  assert.match(operationalUx, /document\.addEventListener\("scroll", close, true\)/);
  assert.match(operationalUx, /event\.key==="Escape"/);
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

test("React is the sole pointer owner for label dragging", () => {
  assert.match(labelDesigner, /setPointerCapture\(e\.pointerId\)/);
  assert.match(labelDesigner, /hasPointerCapture\(e\.pointerId\)/);
  assert.match(labelDesigner, /dragging\.current/);
  assert.match(labelDesigner, /update\(item\.id, \{ x, y \}\)/);
  assert.doesNotMatch(labelInteractions, /document\.addEventListener\("pointermove"/);
  assert.doesNotMatch(labelInteractions, /const beginDrag/);
  assert.doesNotMatch(labelInteractions, /const updateDrag/);
});

test("selected text boxes fit inked glyph bounds instead of CSS line boxes", () => {
  assert.match(labelInteractions, /measureGlyphs/);
  assert.match(labelInteractions, /context\.measureText\(text\)/);
  assert.match(labelInteractions, /actualBoundingBoxAscent/);
  assert.match(labelInteractions, /actualBoundingBoxDescent/);
  assert.match(labelInteractions, /safeWidthMm = glyphs\.width \/ pxPerMm \+ 0\.03/);
  assert.match(labelInteractions, /safeHeightMm = glyphs\.height \/ pxPerMm \+ 0\.03/);
  assert.doesNotMatch(labelInteractions, /selectNodeContents/);
});

test("Label Center Print and Save PDF route to print-only hydration instead of Open edit", () => {
  assert.match(labelFinalization, /labelCenterActionMenu \.seikoRowActionPanel button/);
  assert.match(labelFinalization, /routeSavedSetPrint/);
  assert.match(labelFinalization, /\/labels\/print\?/);
  assert.match(savedLabelPrintPage, /sessionStorage\.setItem\(openTaskKey\(businessId\), selectedTask\.id\)/);
  assert.match(savedLabelPrintPage, /jinam:labels:print/);
  assert.match(savedLabelPrintPage, /LabelDesigner/);
});

test("normal Print opens native browser print with calibrated output and no intermediate preview", () => {
  assert.match(labelFinalization, /labelNativePrintRoot/);
  assert.match(labelFinalization, /@page\{size:\$\{preset\.rollW\}mm \$\{pitch\}mm;margin:0\}/);
  assert.match(labelFinalization, /document\.body\.appendChild\(runtime\.root\)/);
  assert.match(labelFinalization, /document\.documentElement\.classList\.add\("jinamLabelPrinting"\)/);
  assert.match(labelFinalization, /window\.print\(\)/);
  assert.match(labelFinalization, /beforeprint/);
  assert.match(labelFinalization, /afterprint/);
  assert.doesNotMatch(labelFinalization, /labelPrintPreviewLayer/);
  assert.doesNotMatch(labelFinalization, /window\.open\(/);
  assert.doesNotMatch(labelFinalization, /iframe/);
  assert.doesNotMatch(labelFinalization, /setTimeout\(cleanup, 0\)/);
});

test("Order Setup returns to the page it was opened from", () => {
  assert.match(orders, /setView\(existingOrder \? setupReturnView : "workspace"\)/);
  assert.match(orders, /returnView === "workspace" \? "Update workspace" : "Save changes"/);
  assert.match(orders, /onCancel=\{\(\) => setView\(current\.revisions\.length \? setupReturnView : "center"\)\}/);
});
