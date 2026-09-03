import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../app/packing-workspace-audit.css", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../app/packing-workflow-runtime-fixes.tsx", import.meta.url), "utf8");
const enhancements = fs.readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");

test("packing workspace stretches to the available page width without viewport hacks", () => {
  assert.match(css, /align-items:\s*stretch\s*!important/);
  assert.match(css, /\.packingWorkflowDesigner\.labelDesignerPage[\s\S]*width:\s*100%\s*!important/);
  assert.doesNotMatch(css, /margin-left:\s*calc\(50%\s*-\s*50vw\)/);
  assert.doesNotMatch(css, /width:\s*100vw\s*!important[\s\S]*packingWorkflowDesigner\.labelDesignerPage/);
});

test("packing designer owns exactly one visible drop-to-remove target", () => {
  assert.match(css, /\.packingWorkflowDesigner \.labelCanvasDropRemove\s*\{\s*display:\s*none\s*!important/);
});

test("packing runtime restores visible value-bold and package-on-label controls", () => {
  assert.match(runtime, /Value bold/);
  assert.match(runtime, /Show package contents on label/);
  assert.match(runtime, /BASE_CANVAS_WIDTH/);
  assert.match(runtime, /fitScaledPreviewText/);
});

test("packing runtime fixes are mounted globally with the label enhancements", () => {
  assert.match(enhancements, /PackingWorkflowRuntimeFixes/);
  assert.match(enhancements, /<PackingWorkflowRuntimeFixes\s*\/>/);
});
