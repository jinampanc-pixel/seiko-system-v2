import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const orders = read("app/orders.tsx");
const rowActions = read("app/workspace-row-actions.tsx");
const shortcuts = read("app/workspace-shortcuts.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const workspaceGrid = read("app/workspace-grid.css");
const orderEnhancements = read("app/order-enhancements.css");
const navigationCss = read("app/global-navigation.css");
const access = read("app/access-control.tsx");
const page = read("app/page.tsx");
const labelPolish = read("app/label-designer-polish.tsx");
const listCenter = read("app/seiko-list-center-enhancements.tsx");
const listCss = read("app/seiko-list-center-enhancements.css");
const operationalUx = read("app/seiko-operational-ux.tsx");
const labels = read("app/label-designer.tsx");
const home = read("app/seiko-phase1.tsx");

test("workspace keeps its two header bands together without covering row one", () => {
  assert.match(rowActions, /source-owned workspace now renders its own spreadsheet row headers/);
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(workspaceGrid, /groupedWorkspace thead \{[\s\S]*position: sticky/);
  assert.match(workspaceGrid, /thead tr:nth-child\(2\) th \{[\s\S]*position: relative/);
  assert.doesNotMatch(orderEnhancements, /workspaceResizableHeader\{position:sticky/);
});

test("workspace transient menus close when work continues elsewhere", () => {
  assert.match(shortcuts, /workspaceCompactTools\[open\]/);
  assert.match(shortcuts, /document\.addEventListener\("pointerdown", closeTools, true\)/);
  assert.match(shortcuts, /document\.addEventListener\("scroll", closeTools, true\)/);
  assert.match(structure, /document\.addEventListener\("pointerdown",outside,true\)/);
  assert.match(structure, /window\.addEventListener\("blur",closeTransient\)/);
});

test("Order Center cannot return with invisible stale filters", () => {
  assert.match(orders, /setQuery\(""\); setArchivedOnly\(false\); save\(current, "Order saved", true\)/);
  assert.match(listCenter, /orderFilterSession/);
  assert.match(listCenter, /resetFilterState\(\)/);
  assert.match(listCenter, /setNativeInputValue\(nativeSearch\s*,\s*""\)/);
  assert.match(listCenter, /archivedNative\?\.checked/);
});

test("Order Center status is owned by the contextual menu", () => {
  assert.match(operationalUx, /statusWrap\?\.setAttribute\("hidden", ""\)/);
  assert.match(operationalUx, /orderMenuStatusControl/);
  assert.match(operationalUx, /const select = nativeStatus\.cloneNode\(true\) as HTMLSelectElement/);
  assert.match(operationalUx, /setNativeSelect\(nativeStatus, select\.value\)/);
});

test("Home Clear filters resets all active order-filter state", () => {
  assert.match(home, /const clearFilters=\(\)=>\{setQuery\(""\);setStatus\(""\);setClientType\(""\);setProduct\(""\);setPage\(1\);\};/);
  assert.match(home, /aria-label="Clear all order filters" onClick=\{clearFilters\}>Clear filters/);
});

test("Label Center rows open directly and action menus float above the list", () => {
  assert.match(listCenter, /labelBatchRowClickable/);
  assert.match(listCenter, /row\.addEventListener\("click"/);
  assert.match(listCenter, /open\.hidden\s*=\s*true/);
  assert.match(listCenter, /labelCenterFloatingPanel/);
  assert.match(listCss, /z-index:1200!important/);
});

test("label package applicability is record-specific", () => {
  const start = labels.indexOf("function labelQuantityForRecord");
  const end = labels.indexOf("function orderLabelRows", start);
  const resolver = labels.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(resolver, /orderUsesProductEvidence/);
  assert.match(resolver, /recordValues/);
  assert.doesNotMatch(resolver, /quantityMode === "by_group"[\s\S]{0,240}return quantity/);
});

test("label movement supports visual baseline alignment across font sizes", () => {
  assert.match(labels, /visualBaselineOffset/);
  assert.match(labels, /bestBaseline = \.6/);
  assert.match(labels, /other\.y \+ visualBaselineOffset\(other\)/);
});

test("Product details are divided by data type and specification role", () => {
  assert.match(labels, /category: "Product"/);
  assert.match(labels, /category: "Quantity"/);
  assert.match(labels, /category: "Measurements"/);
  assert.match(labels, /spec\.role === "colour" \? "Colour"/);
  assert.match(labels, /spec\.role === "pattern" \? "Pattern"/);
  assert.match(labels, /spec\.role === "asset" \? "Artwork"/);
  assert.match(labelPolish, /fieldSubGroupHeading/);
});

test("main menu and settings keep access inside a stable full-height structure", () => {
  assert.match(navigationCss, /display:flex!important;[\s\S]*flex-direction:column!important;[\s\S]*100dvh/);
  assert.match(access, /moduleMenu \.moduleMenuSettings/);
  assert.match(access, /jinam:open-access/);
  assert.match(page, /settingsModuleNav/);
  assert.match(page, /Users & access/);
  assert.doesNotMatch(home, /<div><small>SEIKO<\/small><h1>Home<\/h1>/);
});

test("settings dialog has one React owner rather than overlapping injected modules", () => {
  assert.doesNotMatch(home, /seikoAccessSettings/);
  assert.match(operationalUx, /Settings is React-owned/);
  assert.match(page, /settingsAppearanceModule/);
  assert.match(page, /settingsUsersModule/);
});

test("saved label sets expose distinct calibrated print and recorded PDF export actions", () => {
  assert.match(listCenter, /Open \/ edit/);
  assert.match(listCenter, /print\.textContent="Print"/);
  assert.match(listCenter, /pdf\.textContent="Save PDF"/);
  assert.match(listCenter, /open-task-direct-action/);
  assert.match(listCenter, /labels:pdf-records-v1/);
  assert.match(labels, /open-task/);
});