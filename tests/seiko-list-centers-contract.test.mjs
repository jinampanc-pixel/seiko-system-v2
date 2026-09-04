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
  for (const field of ["Status", "Client type", "Product", "Delivery"]) assert.match(centers, new RegExp(field));
  assert.doesNotMatch(centers, /Records", "records/);
  assert.match(centers, /orderFilterToggle/);
  assert.match(centers, /orderFilterGlyph/);
  assert.match(centers, /matchingProducts/);
  assert.match(centers, /filterState\.clientType/);
  assert.match(centers, /Due in next 7 days/);
  assert.match(centers, /Overdue/);
  assert.match(centers, /orderCenterActionMenu/);
  assert.match(centers, /Edit setup/);
  assert.match(centers, /Create labels/);
  assert.doesNotMatch(centers, /openAction\.textContent = "Open order"/);
  assert.match(centers, /Archive order/);
  assert.match(centers, /Restore order/);
});

test("label center uses clickable saved-set rows and consistent three-dot menus", () => {
  assert.match(centers, /\.labelLauncher/);
  assert.match(centers, /labelBatchModuleList/);
  assert.match(centers, /labelBatchRowClickable/);
  assert.match(centers, /open\.hidden=true|open\.hidden = true/);
  assert.doesNotMatch(centers, /openAction\.textContent = "Open label set"/);
  assert.match(centers, /labelOrderResults/);
  assert.match(centers, /labelCenterActionMenu/);
  assert.match(centers, /Archive label set/);
  assert.match(centers, /Restore label set/);
  assert.match(centers, /Delete permanently/);
  assert.doesNotMatch(centers, /Remove saved set/);
  assert.match(centers, /Create label set/);
});

test("saved label actions separate calibrated print from recorded PDF export", () => {
  assert.match(centers, /open-task-direct-action/);
  assert.match(centers, /print\.textContent="Print"/);
  assert.match(centers, /pdf\.textContent="Save PDF"/);
  assert.match(centers, /labels:pdf-records-v1/);
  assert.match(centers, /PDF library/);
  assert.match(centers, /rememberPdf/);
});

test("selected label-information chip x deselects the underlying React field", () => {
  const polish = read("app/label-designer-polish.tsx");
  const interactions = read("app/label-designer-interactions.tsx");
  assert.match(polish, /labelInfoChipRemove/);
  assert.match(polish, /checkbox\?\.click\(\)/);
  assert.doesNotMatch(interactions, /removeSelectedChip/);
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

test("legacy list-center enhancer remains available as reference but is not mounted in rescue runtime", () => {
  assert.doesNotMatch(enhancements, /<SeikoListCenterEnhancements \/>/);
  assert.doesNotMatch(layout, /seiko-list-center-enhancements\.css/);
  assert.match(layout, /seiko-rescue\.css/);
});
