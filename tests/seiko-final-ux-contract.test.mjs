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
  assert.match(packing, /physicalDrawerBackdrop/);
  assert.match(packing, /physicalDrawer/);
  assert.match(packing, /every checked product/);
  assert.match(packing, /Printed product name/);
  assert.match(packing, /Primary measurement/);
  assert.match(packing, /Show quantity/);
  assert.match(packing, /Measurements/);
  assert.match(packing, /Attributes \/ specifications/);
  assert.match(stableCss, /packingPresentationRules[\s\S]*overflow-y: auto !important/);
  assert.match(stableCss, /packingPresentationDrawer[\s\S]*overflow: hidden !important/);
});

test("packing canvas remains directly editable and physically proportional", () => {
  const canvas = readFileSync("app/physical-label-canvas.tsx", "utf8");
  const css = readFileSync("app/physical-label-editor.css", "utf8");
  assert.match(packing, /PhysicalLabelCanvas/);
  assert.match(canvas, /onPointerDown/);
  assert.match(canvas, /onPointerMove/);
  assert.match(canvas, /stretchTextBox/);
  assert.match(canvas, /onKeyDown/);
  assert.match(css, /touch-action:none/);
  const profile = readFileSync("app/lib/physical-output.ts", "utf8");
  assert.match(profile, /widthMm: 50/);
  assert.match(profile, /heightMm: 25/);
  assert.match(packing, /physicalPageCss\(PACKING_ROLL\)/);
  assert.match(packing, /PACKING_OUTPUT.widthMm/);
  assert.match(packing, /PACKING_OUTPUT.heightMm/);
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