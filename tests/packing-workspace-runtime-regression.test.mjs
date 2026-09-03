import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../app/packing-workspace-audit.css", import.meta.url), "utf8");
const finalCss = fs.readFileSync(new URL("../app/packing-workflow-final.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/packing-workflow-runtime-fixes.tsx", import.meta.url), "utf8");
const enhancements = fs.readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("packing workspace stretches to the available page width without viewport hacks", () => {
  assert.match(css, /align-items:\s*stretch\s*!important/);
  assert.match(css, /\.packingWorkflowDesigner\.labelDesignerPage[\s\S]*width:\s*100%\s*!important/);
  assert.doesNotMatch(css, /margin-left:\s*calc\(50%\s*-\s*50vw\)/);
});

test("packing designer owns exactly one visible drop-to-remove target", () => {
  assert.match(css, /\.packingWorkflowDesigner \.labelCanvasDropRemove\s*\{\s*display:\s*none\s*!important/);
});

test("packing inspector restores value emphasis and tight-box sizing", () => {
  assert.match(runtime, /Value bold/);
  assert.match(runtime, /Fit box to text/);
  assert.match(runtime, /fitSelectedBox/);
  assert.match(finalCss, /\.packingWorkflowDesigner \.packingInspectorBar/);
});

test("package block wording describes inclusion rather than data ownership", () => {
  assert.match(runtime, /Include product details on label/);
  assert.doesNotMatch(runtime, /Show package contents on label/);
});

test("saved label sets and saved layouts are available from the packing menu", () => {
  assert.match(runtime, /Saved label sets/);
  assert.match(runtime, /Saved layouts/);
  assert.match(runtime, /openSavedLibrary/);
});

test("packing workflow requires a label-set brief confirmation before printing", () => {
  assert.match(runtime, /LABEL SET BRIEF/);
  assert.match(runtime, /Confirm label set/);
  assert.match(runtime, /labelSetConfirmedFingerprint/);
  assert.match(finalCss, /\.packingWorkflowDesigner \.packingReadinessPanel/);
});

test("final packing workflow styles load after the older packing audit layer", () => {
  assert.match(layout, /packing-workspace-audit\.css[\s\S]*packing-workflow-final\.css/);
});

test("packing runtime fixes are mounted globally with the label enhancements", () => {
  assert.match(enhancements, /PackingWorkflowRuntimeFixes/);
  assert.match(enhancements, /<PackingWorkflowRuntimeFixes\s*\/>/);
});
