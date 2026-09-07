import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packing = readFileSync("app/packing-person-label-designer.tsx", "utf8");
const rescueCss = readFileSync("app/seiko-rescue.css", "utf8");
const priorityCss = readFileSync("app/seiko-priority0.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const enhancements = readFileSync("app/app-enhancements.tsx", "utf8");
const navigation = readFileSync("app/global-navigation.tsx", "utf8");

test("clean SEIKO UX is source-owned and priority-zero stylesheet is loaded last", () => {
  assert.match(layout, /import "\.\/seiko-rescue\.css";\s*\nimport "\.\/seiko-priority0\.css";/);
  assert.doesNotMatch(layout, /packing-workflow-final\.css|seiko-stable\.css|seiko-final-ux-pass\.css|seiko-review-final\.css|seiko-review-hotfix\.css/);
  assert.doesNotMatch(enhancements, /SeikoFinalUxPass|SeikoReviewFinal|SeikoReviewSentinel|SeikoMenuClickFix/);
  assert.match(priorityCss, /\.seikoP0App/);
});
test("packing designer keeps product presentation in its React-owned drawer", () => {
  assert.match(packing, /packingPresentationLayer/);
  assert.match(packing, /packingPresentationDrawer/);
  assert.match(packing, /Include this product when applicable/);
  assert.match(packing, /Printed product name/);
  assert.match(packing, /Primary measurement/);
  assert.match(packing, /Show quantity/);
  assert.match(packing, /Measurements/);
  assert.match(packing, /Attributes \/ specifications/);
  assert.match(rescueCss, /packingPresentationRules[\s\S]*overflow:auto!important/);
  assert.match(rescueCss, /packingPresentationDrawer[\s\S]*overflow:hidden!important/);
});

test("packing canvas remains directly editable and physically proportional", () => {
  assert.match(packing, /onPointerDown=\{event => down\(event, item\)\}/);
  assert.match(packing, /onPointerMove=\{move\}/);
  assert.match(packing, /onPointerUp=\{stop\}/);
  assert.match(packing, /onWheel=\{event => wheel\(event, item\)\}/);
  assert.match(priorityCss, /packingCanvas[\s\S]*width:\s*800px\s*!important/);
  assert.match(priorityCss, /packingCanvas[\s\S]*height:\s*auto\s*!important;\s*aspect-ratio:\s*2\s*\/\s*1/);
  assert.match(rescueCss, /canvasElement[\s\S]*touch-action:none!important/);
  assert.match(rescueCss, /packingTrash[\s\S]*pointer-events:none!important/);
});

test("retired standalone navigation remains outside the active runtime", () => {
  assert.match(navigation, /const \[open, setOpen\] = useState\(false\)/);
  assert.doesNotMatch(enhancements, /<GlobalNavigation\s*\/>/);
});

test("legacy late review layers remain retired so they cannot fight the live canvas or menu", () => {
  assert.doesNotMatch(enhancements, /SeikoFinalUxPass/);
  assert.doesNotMatch(enhancements, /SeikoFinalOrderRouting/);
  assert.doesNotMatch(enhancements, /SeikoReviewFinal/);
  assert.doesNotMatch(enhancements, /SeikoReviewSentinel/);
  assert.doesNotMatch(enhancements, /SeikoMenuClickFix/);
});
