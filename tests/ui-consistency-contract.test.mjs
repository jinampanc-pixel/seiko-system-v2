import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../app/label-designer-interactions.tsx", import.meta.url), "utf8");
const labelControls = readFileSync(new URL("../app/label-controls.css", import.meta.url), "utf8");
const labelPrintSafety = readFileSync(new URL("../app/label-print-safety.css", import.meta.url), "utf8");
const controlConsistency = readFileSync(new URL("../app/control-consistency.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../app/global-navigation.css", import.meta.url), "utf8");
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
