import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../app/label-designer-interactions.tsx", import.meta.url), "utf8");
const labelPolish = readFileSync(new URL("../app/label-designer-polish.tsx", import.meta.url), "utf8");
const labelControls = readFileSync(new URL("../app/label-controls.css", import.meta.url), "utf8");
const interfaceFixes = readFileSync(new URL("../app/seiko-interface-fixes.css", import.meta.url), "utf8");
const controlConsistency = readFileSync(new URL("../app/control-consistency.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/global-navigation.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("selected label-information chips expose a real remove affordance", () => {
  assert.match(labelPolish, /labelInfoChipRemove/);
  assert.match(labelPolish, /querySelector<HTMLInputElement>\(':scope > label:first-child input\[type="checkbox"\]'\)/);
  assert.match(labelPolish, /checkbox\?\.click\(\)/);
  assert.doesNotMatch(interactions, /removeSelectedChip/);
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

test("label preview uses the complete physical canvas without a hidden right exclusion", () => {
  assert.doesNotMatch(interactions, /RIGHT_PRINT_SAFE_MM/);
  assert.doesNotMatch(interactions, /clampPreviewRightEdge/);
  assert.doesNotMatch(interactions, /clampPrintedRightEdge/);
  assert.match(interfaceFixes, /\.labelDesignerPage \.labelCanvas::after\s*\{[\s\S]*?display:none!important/);
  assert.match(interfaceFixes, /\.labelDesignerPage \.canvasElement\.element-text[\s\S]*?padding:0!important/);
  assert.match(layout, /seiko-interface-fixes\.css/);
});

test("business navigator is the bottom-most menu control", () => {
  assert.match(navigationCss, /moduleMenu>\.globalBusinessNavigator/);
  assert.match(navigationCss, /margin-top:auto!important/);
});
