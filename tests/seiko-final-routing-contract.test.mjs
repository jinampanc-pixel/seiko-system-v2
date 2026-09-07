import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/seiko-final-order-routing.tsx", "utf8");
const enhancements = readFileSync("app/app-enhancements.tsx", "utf8");
const navigation = readFileSync("app/global-navigation.tsx", "utf8");

test("broken recursive review routing layers stay unmounted", () => {
  assert.doesNotMatch(enhancements, /<SeikoFinalUxPass\s*\/>/);
  assert.doesNotMatch(enhancements, /<SeikoFinalOrderRouting\s*\/>/);
  assert.doesNotMatch(enhancements, /<SeikoMenuClickFix\s*\/>/);
  assert.doesNotMatch(enhancements, /<GlobalNavigation\s*\/>/);
});

test("retired standalone navigation implementation remains quarantined while rescue shell consolidation proceeds", () => {
  assert.match(navigation, /sessionStorage\.setItem\(NAV_INTENT_KEY, intent\)/);
  assert.match(navigation, /window\.location\.assign\(rootUrl\(\)\)/);
  assert.match(navigation, /sessionStorage\.removeItem\(NAV_INTENT_KEY\)/);
  assert.doesNotMatch(navigation, /document\.addEventListener\("pointerup"/);
  assert.doesNotMatch(enhancements, /GlobalNavigation/);
});

test("Home chooser implementation still routes setup workspace and labels explicitly", () => {
  assert.match(source, /action === "setup"/);
  assert.match(source, /openSetup\(orderNo\)/);
  assert.match(source, /openWorkspace\(orderNo\)/);
  assert.match(source, /openLabels\(orderNo\)/);
  assert.match(source, /Edit setup/);
  assert.match(source, /Create labels/);
  assert.match(source, /\/labels\/create\?business=/);
});

test("setup routing implementation keeps a workspace fallback instead of silently failing", () => {
  assert.match(source, /\.openOrderButton/);
  assert.match(source, /\.workspacePage \.orderActionMenu button/);
  assert.match(source, /order-setup-origin/);
});
