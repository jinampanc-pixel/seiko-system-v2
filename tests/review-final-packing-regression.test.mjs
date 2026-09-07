import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../app/seiko-review-final.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/seiko-review-final.css", import.meta.url), "utf8");
const designer = fs.readFileSync(new URL("../app/packing-person-label-designer.tsx", import.meta.url), "utf8");

test("font resizing never changes a field's x or y position", () => {
  const apply = runtime.match(/function applyFontGrowth\([\s\S]*?\nfunction tightenSelected/)?.[0] || "";
  assert.match(apply, /font-size/);
  assert.doesNotMatch(apply, /ArrowLeft|ArrowUp|translate|style\.left|style\.top|nudgeSelected/);
  assert.doesNotMatch(apply, /setReactInput\(fresh\.width|setReactInput\(fresh\.height/);
});

test("drop removal targets only the actively dragged item", () => {
  assert.match(designer, /const removeId = dragging\.current\.id/);
  assert.match(designer, /filter\(item => item\.id !== removeId\)/);
  assert.doesNotMatch(designer, /filter\(item => !isPackageField\(item\.field\)\)[\s\S]{0,180}removeId/);
  assert.match(css, /\.packingTrash\{pointer-events:none!important\}/);
});

test("package customization uses one compact scrolling drawer", () => {
  assert.match(css, /body:has\(\.packingPresentationLayer\)\{overflow:hidden!important\}/);
  assert.match(css, /\.packingPresentationLayer\{overflow:hidden!important\}/);
  assert.match(css, /\.packingPresentationDrawer\{[^}]*overflow-y:auto!important/);
  assert.match(css, /\.packingRuleBody\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.packingPresentationRules details\{padding:7px 9px!important/);
});

test("main menu remains above its backdrop and accepts pointer input", () => {
  assert.match(css, /\.menuBackdrop\{z-index:490!important;pointer-events:auto!important\}/);
  assert.match(css, /\.moduleMenu\.reviewFinalMenu\{[^}]*z-index:500!important;pointer-events:auto!important/);
  assert.match(runtime, /pointer-events","auto","important"/);
});