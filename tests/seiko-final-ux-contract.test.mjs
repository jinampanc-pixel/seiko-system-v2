import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packing = readFileSync("app/packing-person-label-designer.tsx", "utf8");
const stableCss = readFileSync("app/seiko-stable.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const enhancements = readFileSync("app/app-enhancements.tsx", "utf8");
const navigation = readFileSync("app/global-navigation.tsx", "utf8");

test("stable SEIKO UX is source-owned and loaded as the final stylesheet", () => {
  assert.match(layout, /packing-workflow-final\.css";\s*\nimport "\.\/seiko-stable\.css";/);
  assert.doesNotMatch(layout, /seiko-final-ux-pass\.css/);
  assert.doesNotMatch(layout, /seiko-review-final\.css/);
  assert.doesNotMatch(layout, /seiko-review-hotfix\.css/);
  assert.doesNotMatch(enhancements, /SeikoFinalUxPass|SeikoReviewFinal|SeikoReviewSentinel|SeikoMenuClickFix/);
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
  assert.match(stableCss, /packingPresentationRules[\s\S]*overflow-y: auto !important/);
  assert.match(stableCss, /packingPresentationDrawer[\s\S]*overflow: hidden !important/);
});

test("packing canvas remains directly editable and physically proportional", () => {
  assert.match(packing, /onPointerDown=\{event => down\(event, item\)\}/);
  assert.match(packing, /onPointerMove=\{move\}/);
  assert.match(packing, /onPointerUp=\{stop\}/);
  assert.match(packing, /onWheel=\{event => wheel\(event, item\)\}/);
  assert.match(stableCss, /packingCanvas[\s\S]*aspect-ratio: 2 \/ 1 !important/);
  assert.match(stableCss, /packingCanvas[\s\S]*touch-action: none !important/);
  assert.match(stableCss, /packingTrash[\s\S]*pointer-events: none !important/);
});

test("standalone menu is React-owned and navigation is one-shot", () => {
  assert.match(navigation, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(navigation, /className="menuBackdrop"/);
  assert.match(navigation, /goToRoot\(item\.intent\)/);
  assert.match(navigation, /sessionStorage\.removeItem\(NAV_INTENT_KEY\)/);
  assert.match(stableCss, /globalStandaloneMenu[\s\S]*height: 100dvh !important/);
});

test("legacy late review layers remain retired so they cannot fight the live canvas or menu", () => {
  assert.doesNotMatch(enhancements, /SeikoFinalUxPass/);
  assert.doesNotMatch(enhancements, /SeikoFinalOrderRouting/);
  assert.doesNotMatch(enhancements, /SeikoReviewFinal/);
  assert.doesNotMatch(enhancements, /SeikoReviewSentinel/);
  assert.doesNotMatch(enhancements, /SeikoMenuClickFix/);
});