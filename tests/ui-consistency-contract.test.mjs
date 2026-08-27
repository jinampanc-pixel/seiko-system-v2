import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const interactions = readFileSync(new URL("../app/label-designer-interactions.tsx", import.meta.url), "utf8");
const labelControls = readFileSync(new URL("../app/label-controls.css", import.meta.url), "utf8");
const controlConsistency = readFileSync(new URL("../app/control-consistency.css", import.meta.url), "utf8");
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
