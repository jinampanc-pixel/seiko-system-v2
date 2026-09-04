import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../app/label-designer-interactions.tsx", import.meta.url), "utf8");
const labelPolish = readFileSync(new URL("../app/label-designer-polish.tsx", import.meta.url), "utf8");
const labelControls = readFileSync(new URL("../app/label-controls.css", import.meta.url), "utf8");
const controlConsistency = readFileSync(new URL("../app/control-consistency.css", import.meta.url), "utf8");
const rescueCss = readFileSync(new URL("../app/seiko-rescue.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("selected label-information chips expose a real remove affordance in retained reference source", () => {
  assert.match(labelPolish, /labelInfoChipRemove/);
  assert.match(labelPolish, /querySelector<HTMLInputElement>\(':scope > label:first-child input\[type="checkbox"\]'\)/);
  assert.match(labelPolish, /checkbox\?\.click\(\)/);
  assert.doesNotMatch(interactions, /removeSelectedChip/);
  assert.match(labelControls, /\.labelInfoChipRemove/);
});

test("classification reference remains available for later source consolidation", () => {
  assert.match(interactions, /classificationTile/);
  assert.match(interactions, /checklist\.insertBefore\(classification, clientChoice\)/);
});

test("native checkboxes and radios use the active business accent", () => {
  assert.match(controlConsistency, /input\[type="checkbox"\]/);
  assert.match(controlConsistency, /accent-color:var\(--gold\)/);
  assert.match(layout, /control-consistency\.css/);
});

test("rescue label preview uses the complete physical canvas without a hidden right exclusion", () => {
  assert.doesNotMatch(interactions, /RIGHT_PRINT_SAFE_MM/);
  assert.doesNotMatch(interactions, /clampPreviewRightEdge/);
  assert.doesNotMatch(interactions, /clampPrintedRightEdge/);
  assert.match(rescueCss, /\.packingCanvas[\s\S]*width:800px!important[\s\S]*height:400px!important/);
  assert.doesNotMatch(layout, /seiko-interface-fixes\.css/);
  assert.match(layout, /seiko-rescue\.css/);
});

test("main menu sizing is owned by rescue stylesheet", () => {
  assert.match(rescueCss, /\.moduleMenu/);
  assert.match(rescueCss, /height:100dvh!important/);
  assert.match(rescueCss, /inset:0 0 0 auto!important/);
});
