import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const orders = read("app/orders.tsx");
const rowActions = read("app/workspace-row-actions.tsx");
const shortcuts = read("app/workspace-shortcuts.tsx");
const structure = read("app/workspace-structure-interactions.tsx");
const listCenter = read("app/seiko-list-center-enhancements.tsx");
const listCss = read("app/seiko-list-center-enhancements.css");
const operationalUx = read("app/seiko-operational-ux.tsx");
const operationalCss = read("app/seiko-operational-ux.css");
const labels = read("app/label-designer.tsx");
const home = read("app/seiko-phase1.tsx");

test("workspace has one authoritative header system", () => {
  assert.match(rowActions, /source-owned workspace now renders its own spreadsheet row headers/);
  assert.match(rowActions, /workspaceRowHeaderCorner/);
  assert.match(operationalCss, /table-layout:fixed!important/);
  assert.match(operationalCss, /workspaceRowNumberCol\{width:44px!important/);
  assert.match(operationalCss, /thead tr:nth-child\(2\)>th\{top:30px!important/);
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
  assert.match(listCenter, /setNativeInputValue\(nativeSearch, ""\)/);
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
  assert.match(listCenter, /open\.hidden = true/);
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
