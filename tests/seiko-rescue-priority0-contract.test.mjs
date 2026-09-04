import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const enhancements = read("app/app-enhancements.tsx");
const layout = read("app/layout.tsx");
const page = read("app/page.tsx");
const orders = read("app/orders.tsx");
const packing = read("app/packing-person-label-designer.tsx");
const rescueCss = read("app/seiko-rescue.css");

test("rescue runtime has one interaction owner for menu and packing labels", () => {
  for (const retired of ["GlobalNavigation","SeikoOperationalUx","SeikoListCenterEnhancements","SeikoInterfaceFixes","PackingWorkflowRuntimeFixes","LabelDesignerInteractions","LabelFlowPolish","LabelDesignerPolish","LabelProductionReady","LabelFinalization","LabelFieldCompact","LabelWorkspaceRefinement"]) {
    assert.doesNotMatch(enhancements, new RegExp(`<${retired} \\/>`));
  }
  assert.match(page, /className="moduleMenu"/);
  assert.match(page, /setNavOpen\(false\)/);
  assert.match(page, /label="Orders"/);
  assert.match(page, /label="Labels"/);
});

test("rescue stylesheet replaces late patch layers", () => {
  assert.match(layout, /seiko-rescue\.css/);
  for (const retiredCss of ["label-designer-polish.css","label-production-ready.css","label-finalization.css","label-flow-polish.css","global-navigation.css","seiko-stage2-safe.css","seiko-workspace-label-final.css","seiko-list-center-enhancements.css","seiko-refinement.css","seiko-operational-ux.css","seiko-interface-fixes.css","packing-workspace-audit.css","packing-workflow-final.css","seiko-stable.css"]) {
    assert.doesNotMatch(layout, new RegExp(retiredCss.replaceAll(".", "\\.")));
  }
  assert.match(rescueCss, /\.moduleMenu/);
  assert.match(rescueCss, /height:100dvh/);
  assert.match(rescueCss, /\.packingCanvas/);
  assert.match(rescueCss, /width:800px/);
  assert.match(rescueCss, /height:400px/);
  assert.match(rescueCss, /\.packingPresentationRules/);
  assert.match(rescueCss, /overflow:auto/);
});

test("Orders and Workspace remain source-backed", () => {
  assert.match(orders, /workspaceNativeMenuStatus/);
  assert.match(orders, /workspaceMenuSaveNow/);
  assert.match(orders, /aria-label="Rows per page"/);
  assert.match(orders, /Archive order/);
  assert.match(orders, /Delete order/);
  assert.match(orders, /Create labels|Labels/);
});

test("packing labels derive order data and keep React as sole drag resize remove owner", () => {
  assert.match(packing, /quantityForRecord/);
  assert.match(packing, /measurementValue/);
  assert.match(packing, /specificationValue/);
  assert.match(packing, /Non-applicable products and missing conditional values take no printed space/);
  assert.match(packing, /const down = \(event: ReactPointerEvent/);
  assert.match(packing, /const move = \(event: ReactPointerEvent/);
  assert.match(packing, /updateItem\(item\.id, \{ x:/);
  assert.match(packing, /const wheel = \(event: ReactWheelEvent/);
  assert.match(packing, /updateItem\(item\.id, \{ font:/);
  assert.doesNotMatch(packing, /updateItem\(item\.id, \{[^}]*font:[^}]*x:/s);
  assert.match(packing, /const removeId = dragging\.current\.id/);
  assert.match(packing, /currentItems\.filter\(item => item\.id !== removeId\)/);
  assert.match(rescueCss, /\.packingTrash\{pointer-events:none!important;\}/);
});

test("packing customization remains order-derived and uses one drawer scroll owner", () => {
  assert.match(packing, /Everything is generated from the actual order schema/);
  assert.match(packing, /Include this product when applicable/);
  assert.match(packing, /Primary measurement/);
  assert.match(packing, /Show quantity/);
  assert.match(packing, /Measurements/);
  assert.match(packing, /Attributes \/ specifications/);
  assert.match(rescueCss, /\.packingPresentationDrawer[\s\S]*overflow:hidden/);
  assert.match(rescueCss, /\.packingPresentationRules[\s\S]*overflow:auto/);
});
