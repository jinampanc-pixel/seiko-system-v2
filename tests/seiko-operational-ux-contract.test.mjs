import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const enhancements = read("app/app-enhancements.tsx");
const ux = read("app/seiko-operational-ux.tsx");
const css = read("app/seiko-operational-ux.css");
const orders = read("app/orders.tsx");
const pager = read("app/workspace-top-pager.tsx");
const labels = read("app/label-workspace-refinement.tsx");
const labelDesigner = read("app/label-designer.tsx");
const layout = read("app/layout.tsx");

test("operational UX refinement remains mounted and late styled", () => {
  assert.match(enhancements, /<SeikoOperationalUx \/>/);
  assert.match(layout, /seiko-operational-ux\.css/);
});

test("Home removes duplicate Orders navigation without inventing another Order Center shortcut", () => {
  assert.match(ux, /function enhanceHome\(\)/);
  assert.match(ux, /\.overview \.moduleGrid \.moduleCard/);
  assert.match(ux, /=== "Orders"/);
  assert.match(ux, /card\.hidden = true/);
  assert.doesNotMatch(ux, /Order Center →/);
});

test("Order Center opens rows directly and keeps status plus conditional printing in the action menu", () => {
  assert.match(ux, /orderRowClickable/);
  assert.match(ux, /open\.hidden = true/);
  assert.match(ux, /statusWrap\?\.removeAttribute\("hidden"\)/);
  assert.doesNotMatch(ux, /className = "orderCenterStatusBadge"/);
  assert.match(ux, /orderMenuStatusControl/);
  assert.match(ux, /hasPrintable = tasks\.some/);
  assert.match(ux, /Print labels/);
  assert.match(ux, /waitForWorkspaceAction\("Labels"\)/);
});

test("workspace source owns status and save while rows-per-page accepts custom values", () => {
  assert.match(ux, /workspaceHeaderSecondaryAction/);
  assert.match(ux, /workspaceMenuOperational/);
  assert.doesNotMatch(ux, /Save now/);
  assert.match(orders, /workspaceNativeMenuStatus/);
  assert.match(orders, /workspaceMenuSaveNow/);
  assert.match(orders, />Save now<\/button>/);
  assert.match(pager, /workspacePageSizeInput/);
  assert.match(pager, /Math\.max\(1, Math\.min\(5000/);
  assert.match(pager, /FocusEvent\("focusout"/);
  assert.match(pager, /setInputValue\(native, value\)/);
  assert.doesNotMatch(pager, /cloneNode\(true\) as HTMLSelectElement/);
});

test("Settings exposes Appearance first and Users & access second", () => {
  assert.match(ux, /\["appearance", "1", "Appearance"\]/);
  assert.match(ux, /\["users", "2", "Users & access"\]/);
  assert.match(ux, /settingsUsersModule/);
  assert.match(css, /\.settingsModuleNav/);
});

test("person-package label filtering uses resolved positive package contents", () => {
  assert.match(labelDesigner, /quantityForRecord/);
  assert.match(labelDesigner, /contains_product/);
  assert.match(labelDesigner, /packageProducts\(record\)\.includes\(recordFilterValue\)/);
  assert.match(labelDesigner, /Products with a resolved quantity of 0 are excluded/);
  assert.match(labelDesigner, /Find person, class\/group or a product contained in the package/);
  assert.doesNotMatch(labels, /personPackageWorkspace/);
});

test("automatic label fields use the source-owned physical arrangement", () => {
  assert.doesNotMatch(labels, /stackAutomaticPreview/);
  assert.match(labelDesigner, /arrangeLabelItemsForRow/);
  assert.match(labelDesigner, /advanced \? items : arrangeLabelItemsForRow/);
  assert.match(css, /fieldChoice\.chosen/);
});
