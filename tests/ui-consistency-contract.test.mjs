import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../app/label-designer-interactions.tsx", import.meta.url), "utf8");
const labelControls = readFileSync(new URL("../app/label-controls.css", import.meta.url), "utf8");
const labelPrintSafety = readFileSync(new URL("../app/label-print-safety.css", import.meta.url), "utf8");
const controlConsistency = readFileSync(new URL("../app/control-consistency.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/global-navigation.css", import.meta.url), "utf8");
const operationalFinalize = readFileSync(new URL("../app/seiko-operational-finalize.tsx", import.meta.url), "utf8");
const stage2Repair = readFileSync(new URL("../app/seiko-stage2-repair.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("selected label-information chips expose a real remove affordance", () => {
  assert.match(interactions, /labelInfoChipRemove/);
  assert.match(interactions, /removeSelectedChip/);
  assert.match(interactions, /input\[type="checkbox"\].*\.click\(\)/s);
  assert.match(labelControls, /\.labelInfoChipRemove/);
});

test("classification is presented as a peer information tile", () => {
  assert.match(interactions, /classificationTile/);
  assert.match(interactions, /checklist\.insertBefore\(classification, clientChoice\)/);
  assert.match(labelControls, /classificationInformation\.classificationTile/);
});

test("native checkboxes and radios use the active business accent", () => {
  assert.match(controlConsistency, /input\[type="checkbox"\]/);
  assert.match(controlConsistency, /accent-color:var\(--gold\)/);
  assert.match(layout, /control-consistency\.css/);
});

test("label preview and print reserve a 1.5 mm right safety boundary", () => {
  assert.match(interactions, /RIGHT_PRINT_SAFE_MM = 1\.5/);
  assert.match(interactions, /clampPreviewRightEdge/);
  assert.match(interactions, /clampPrintedRightEdge/);
  assert.match(interactions, /beforeprint/);
  assert.match(labelPrintSafety, /--label-right-safe-pct/);
  assert.match(layout, /label-print-safety\.css/);
});

test("business navigator is the bottom-most menu control", () => {
  assert.match(navigationCss, /moduleMenu>\.globalBusinessNavigator/);
  assert.match(navigationCss, /margin-top:auto!important/);
});

test("order workspace keeps bulk selection inside Actions instead of inserting a leading table column", () => {
  assert.match(operationalFinalize, /recordSelectToggle/);
  assert.match(operationalFinalize, /workspaceSelectAll/);
  assert.match(operationalFinalize, /recordActionMenu/);
  assert.match(operationalFinalize, /workspaceBulkBar/);
  assert.doesNotMatch(operationalFinalize, /workspaceRowSelectHead|workspaceRowSelectCell/);
  assert.match(stage2Repair, /workspaceBulkBar\[hidden\]/);
  assert.match(stage2Repair, /recordNativeAction\{display:none!important\}/);
});

test("Order Center and nested order screens restore Stage 1 contextual actions", () => {
  assert.match(operationalFinalize, /stage1OrderActions/);
  assert.match(operationalFinalize, /add\("Edit setup", "setup"\)/);
  assert.match(operationalFinalize, /add\("Labels", "labels"\)/);
  assert.match(operationalFinalize, /workspaceContextBack/);
  assert.match(operationalFinalize, /SETUP_RETURN_KEY/);
  assert.match(operationalFinalize, /LABEL_CONTEXT_KEY/);
  assert.match(stage2Repair, /stage1OrderActions/);
});

test("Labels opens as a saved-set library and creation is an explicit action", () => {
  assert.match(operationalFinalize, /\+ Create labels/);
  assert.match(operationalFinalize, /labelCreateOpen/);
  assert.match(operationalFinalize, /labelReturnToOrder/);
  assert.match(stage2Repair, /\.labelLauncher \.labelOrderPicker\{display:none!important\}/);
  assert.match(stage2Repair, /\.labelLauncher\.labelCreateOpen \.labelOrderPicker\{display:block!important\}/);
  assert.match(stage2Repair, /\.labelLauncher \.labelCreateToggle\{display:inline-flex!important/);
});

test("focused order label navigation preserves the source order", () => {
  assert.match(operationalFinalize, /sessionStorage\.setItem\(LABEL_CONTEXT_KEY, orderNo\)/);
  assert.match(operationalFinalize, /triggerRowAction\(row, action\)/);
  assert.match(operationalFinalize, /returnToOrder\(contextOrder\)/);
  assert.match(operationalFinalize, /article\.hidden = orderNo !== contextOrder/);
});

test("Stage 2 label workspace has deterministic bounded preview and records regions", () => {
  assert.match(stage2Repair, /grid-template-areas:"canvas records" "properties records"/);
  assert.match(stage2Repair, /\.labelV2CanvasPanel\{/);
  assert.match(stage2Repair, /min-height:290px!important/);
  assert.match(stage2Repair, /max-height:430px!important/);
  assert.match(stage2Repair, /\.labelV2Records\{/);
  assert.match(stage2Repair, /max-height:calc\(100vh - 76px\)!important/);
  assert.match(stage2Repair, /width:min\(100%,680px\)!important/);
  assert.match(layout, /seiko-operational-v2\.css[\s\S]*seiko-stage2-repair\.css/);
});
