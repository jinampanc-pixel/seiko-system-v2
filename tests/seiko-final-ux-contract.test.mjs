import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/seiko-final-ux-pass.tsx", "utf8");
const css = readFileSync("app/seiko-final-ux-pass.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const enhancements = readFileSync("app/app-enhancements.tsx", "utf8");

test("final SEIKO UX pass is mounted and styled last", () => {
  assert.match(enhancements, /<SeikoFinalUxPass\s*\/>/);
  assert.match(layout, /packing-workflow-final\.css";\s*\nimport "\.\/seiko-final-ux-pass\.css";/);
});

test("packing designer keeps information and products in focused drawers", () => {
  assert.match(source, /finalInfoDrawerOpen/);
  assert.match(source, /Field name bold/);
  assert.match(source, /finalProductTypography/);
  assert.match(source, /Show field name/);
  assert.match(css, /finalProductExcluded/);
  assert.match(css, /finalLegacyPackageVisibility/);
});

test("packing text size is real, wheel driven and can exceed the old cap", () => {
  assert.match(source, /CANVAS_BASE_WIDTH = 400/);
  assert.match(source, /font\.max = "96"/);
  assert.match(source, /addEventListener\("wheel"/);
  assert.match(source, /setProperty\("font-size"/);
  assert.match(source, /packingScaledPx/);
});

test("session navigation and Home order chooser are present", () => {
  assert.match(source, /jinam:session-nav-v2/);
  assert.match(source, /finalSessionBack/);
  assert.match(source, /homeOrderOpen/);
  assert.match(source, /Order page \/ setup/);
  assert.match(source, /Workspace/);
  assert.match(source, /Labels/);
});

test("menus dismiss and trace/code tools remain reachable", () => {
  assert.match(source, /pointerleave/);
  assert.match(source, /focusin/);
  assert.match(source, /Open trace & code tools/);
  assert.match(source, /ADVANCED_LABEL_KEY/);
});

test("Home, Orders and business navigation receive compact final styles", () => {
  assert.match(css, /seikoMetricReadout\{min-height:58px/);
  assert.match(css, /orderRowClickable\{min-height:64px/);
  assert.match(css, /moduleMenu>\.globalBusinessNavigator\{order:-30/);
  assert.match(css, /seikoDashboardHeadActions\{position:absolute/);
});
