import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workspace = read("app/workspace-row-actions.tsx");
const centers = read("app/seiko-list-center-enhancements.tsx");
const labels = read("app/label-designer.tsx");
const enhancements = read("app/app-enhancements.tsx");
const layout = read("app/layout.tsx");

test("order workspace uses spreadsheet row headers rather than checkbox selectors", () => {
  assert.match(workspace, /workspaceRowSelector/);
  assert.match(workspace, /workspaceSelectCorner/);
  assert.match(workspace, /Shift-click a range/);
  assert.match(workspace, /Ctrl\/Cmd-click to add or remove rows/);
  assert.doesNotMatch(workspace, /recordSelectToggle/);
  assert.doesNotMatch(workspace, /workspaceSelectAll/);
});

test("order center has detailed filters and a three-dot action menu for each order", () => {
  for (const field of ["Status", "Client type", "Product", "Records", "Delivery"]) assert.match(centers, new RegExp(field));
  assert.match(centers, /Due in next 7 days/);
  assert.match(centers, /Overdue/);
  assert.match(centers, /orderCenterActionMenu/);
  assert.match(centers, /Create labels/);
  assert.match(centers, /Archive order/);
  assert.match(centers, /Restore order/);
});

test("label center has consistent three-dot menus for saved sets and source records", () => {
  assert.match(centers, /\.labelLauncher/);
  assert.match(centers, /labelBatchModuleList/);
  assert.match(centers, /labelOrderResults/);
  assert.match(centers, /labelCenterActionMenu/);
  assert.match(centers, /Open label set/);
  assert.match(centers, /Remove saved set/);
  assert.match(centers, /Create label set/);
});

test("selected label-information chip x deselects the underlying field", () => {
  assert.match(centers, /labelInfoChipRemove/);
  assert.match(centers, /deselectChip/);
  assert.match(centers, /checkbox\.click\(\)/);
  assert.match(labels, /const toggleField/);
  assert.match(labels, /setItems\(all => all\.filter/);
});

test("label record filters and sorting drive the visible records list", () => {
  assert.match(labels, /recordFilterField/);
  assert.match(labels, /recordFilterValue/);
  assert.match(labels, /recordFilterValueFor/);
  assert.match(labels, /recordFilterValues/);
  assert.match(labels, /visibleRecords = records\.filter/);
  assert.match(labels, /recordSort === "person"/);
  assert.match(labels, /recordSort === "product"/);
  assert.match(labels, /recordSort === "group"/);
  assert.match(labels, /shownRecords = visibleRecords/);
});

test("list center enhancements are mounted and styled", () => {
  assert.match(enhancements, /<SeikoListCenterEnhancements \/>/);
  assert.match(layout, /seiko-list-center-enhancements\.css/);
});
