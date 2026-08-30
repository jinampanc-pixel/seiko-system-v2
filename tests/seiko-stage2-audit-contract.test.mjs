import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const orders = read("app/orders.tsx");
const orderDomain = read("app/lib/order-domain.ts");
const setupPolish = read("app/order-setup-polish.tsx");
const setupFinalize = read("app/order-setup-finalize.tsx");
const labelDesigner = read("app/label-designer.tsx");
const labelPolish = read("app/label-designer-polish.tsx");
const labelFinalization = read("app/label-finalization.tsx");
const enhancements = read("app/app-enhancements.tsx");
const layout = read("app/layout.tsx");
const pager = read("app/workspace-top-pager.tsx");
const rowActions = read("app/workspace-row-actions.tsx");

test("Person IDs remain stable after row deletion and new IDs never reuse a deleted sequence", () => {
  assert.doesNotMatch(orders, /renumberRecords/);
  assert.match(orders, /Math\.max\(0, \.\.\.order\.records\.map\(record => Number\(record\.personId\.match/);
  assert.match(orders, /commitRecords\(order\.records\.filter\(item => item\.recordId !== record\.recordId\)\)/);
});

test("group quantity UI and domain both use default quantity plus exceptions", () => {
  assert.match(orderDomain, /return Math\.max\(0, Number\(product\.defaultQuantity\) \|\| 0\)/);
  assert.match(orderDomain, /split\(\/\[;,\\n\]\//);
  assert.match(orders, /min="0" placeholder="Quantity" value=\{rule\.quantity \?\? ""\}/);
  assert.match(orders, /quantity 0 means that group does not receive this product/);
  assert.doesNotMatch(setupPolish, /quantitySelect\.value === "by_group" \|\| quantitySelect\.value === "per_person"/);
  assert.match(setupFinalize, /Set the normal quantity once, then add only the groups that differ/);
});

test("workspace row operations are deliberate and pagination has one state source", () => {
  assert.match(enhancements, /<WorkspaceRowActions \/>/);
  assert.match(enhancements, /<SeikoCloseConfirm \/>/);
  assert.match(rowActions, /Shift-click selects a range/);
  assert.match(rowActions, /Delete selected/);
  assert.match(rowActions, /Add \$\{count\} rows\?/);
  assert.match(orders, /Undo last change/);
  assert.match(orders, /Redo last change/);
  assert.match(pager, /realPager/);
  assert.match(pager, /setRealPageSize/);
  assert.match(pager, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
});

test("label creation stays simple by default while advanced placement remains precise", () => {
  assert.match(labelDesigner, /const \[advanced, setAdvanced\] = useState\(false\)/);
  assert.doesNotMatch(labelPolish, /toggle\.click\(\)/);
  assert.match(labelPolish, /toggle\.hidden = false/);
  assert.match(labelDesigner, /const step = event\.shiftKey \? 1 : \.25/);
  assert.match(labelDesigner, /ArrowLeft/);
  assert.match(labelDesigner, /ArrowRight/);
});

test("label printing supports explicit copies and avoids blocking popup alerts", () => {
  assert.match(labelFinalization, /labelPrintCopies/);
  assert.match(labelFinalization, /Copies/);
  assert.match(labelFinalization, /flatMap\(label => Array\.from\(\{ length: copies \}/);
  assert.doesNotMatch(labelFinalization, /window\.alert\(/);
});

test("the restored Stage 1 label stack remains mounted and Stage 2 safe styling is additive", () => {
  for (const component of ["LabelFlowPolish", "LabelDesignerPolish", "LabelProductionReady", "LabelFinalization", "LabelDesignerInteractions"]) {
    assert.match(enhancements, new RegExp(`<${component} \\/>`));
  }
  assert.doesNotMatch(enhancements, /LabelV2Accessibility/);
  assert.match(layout, /seiko-stage2-safe\.css/);
  assert.doesNotMatch(layout, /seiko-operational-v2\.css/);
  assert.doesNotMatch(layout, /seiko-stage2-repair\.css/);
});
