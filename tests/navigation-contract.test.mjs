import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const labelRoute = readFileSync(new URL("../app/labels/create/page.tsx", import.meta.url), "utf8");
const enhancements = readFileSync(new URL("../app/app-enhancements.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../app/global-navigation.tsx", import.meta.url), "utf8");

test("SEIKO root menu is owned by the root React application", () => {
  assert.match(rootPage, /const \[navOpen, setNavOpen\] = useState\(false\)/);
  assert.match(rootPage, /className="moduleMenu"/);
  assert.match(rootPage, /label="Orders"[\s\S]*setModule\("orders"\)/);
  assert.match(rootPage, /label="Labels"[\s\S]*setModule\("labels"\)/);
  assert.match(rootPage, /label="Scan"[\s\S]*setModule\("scan"\)/);
  assert.match(rootPage, /label="Trace"[\s\S]*setModule\("trace"\)/);
  assert.match(rootPage, /setNavOpen\(false\)/);
});

test("recursive standalone navigation enhancer is not mounted on the rescue branch", () => {
  assert.doesNotMatch(enhancements, /import \{ GlobalNavigation \}/);
  assert.doesNotMatch(enhancements, /<GlobalNavigation\s*\/>/);
});

test("retired one-shot navigation replay is quarantined outside the active enhancement stack", () => {
  // The historical file may remain temporarily for reference while the rescue is
  // underway, but none of its timer/sessionStorage/DOM-click replay may execute.
  assert.match(navigation, /NAV_INTENT_KEY/);
  assert.doesNotMatch(enhancements, /global-navigation/);
});

test("label create route remains a real standalone route while shell consolidation proceeds", () => {
  assert.match(labelRoute, /labelCreateTopbar/);
  assert.match(labelRoute, /business/);
});

test("main menu closes through React state rather than a global capture listener", () => {
  assert.match(rootPage, /className="menuBackdrop"[\s\S]*onClick=\{\(\) => setNavOpen\(false\)\}/);
  assert.doesNotMatch(rootPage, /addEventListener\("pointerup"[\s\S]*true\)/);
});
